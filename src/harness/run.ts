import { buildContext, PROMPT_VERSION } from './context.js';
import type { Entry } from '../journal/entries.js';
import { validateLimits, type Limits } from './limits.js';
import { executeToolCall, type SearchExecutor } from './tool-execution.js';
import { createTrace, recordEvent, recordModelResponse, saveTrace, type Trace } from '../tracing/trace.js';
import type { FailureReason, ModelAdapter, RunOutcome, ToolCall, ToolResult, Turn } from './types.js';
import { DeadlineError, withTimeout } from './timeout.js';

export { DEFAULT_LIMITS, type Limits } from './limits.js';

/**
 * Inputs for a single question-answering run.
 *
 * Supply a fresh adapter for each run: adapters may keep continuation state.
 * The optional search implementation exists for deterministic failure tests;
 * its arguments still pass the same allowlist and schema validation.
 */
export type HarnessOptions = {
  adapter: ModelAdapter;
  question: string;
  fixture: { path: string; hash: string; entries: Entry[] };
  limits?: Partial<Limits>;
  traceDirectory?: string;
  signal?: AbortSignal;
  // Tests simulate search failures without bypassing dispatch or validation.
  search?: SearchExecutor;
};

type RunContext = {
  options: HarnessOptions;
  limits: Limits;
  instructions: string;
  trace: Trace;
  remainingTime: () => number;
  toolCallsUsed: number;
};

class ProviderError extends Error {}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Rejects incomplete provider turns and turns with neither tools nor an answer.
 * Text alongside tool calls is permitted but is not a final answer.
 * @throws If the turn cannot advance the harness safely.
 */
function validateModelResponse(response: Turn): void {
  if (response.status && response.status !== 'completed') {
    throw new Error(`Provider response status: ${response.status}`);
  }
  if (response.calls.length === 0 && !response.text.trim()) {
    throw new Error('Model returned neither an answer nor tool calls');
  }
}

/** Records one provider interaction and classifies provider/response failures. */
async function requestModel(run: RunContext, number: number, results: ToolResult[]): Promise<Turn> {
  const { options, limits, trace } = run;
  const input = { instructions: run.instructions, question: options.question, results };
  recordEvent(trace, { type: 'model_request', number, input });

  try {
    const response = await withTimeout(
      signal => options.adapter.request(input, signal),
      Math.min(limits.modelTimeoutMs, run.remainingTime()),
      options.signal,
    );
    recordModelResponse(trace, number, response);
    validateModelResponse(response);
    return response;
  } catch (error) {
    if (error instanceof DeadlineError) {
      throw error;
    }
    throw new ProviderError(errorMessage(error));
  }
}

function checkRunDeadline(run: RunContext): void {
  if (run.remainingTime() <= 0 || run.options.signal?.aborted) {
    throw new DeadlineError('Overall deadline reached or run cancelled');
  }
}

/** Processes one response's calls in order, stopping before an over-budget call. */
async function executeToolBatch(run: RunContext, calls: ToolCall[]) {
  const results: ToolResult[] = [];
  const seenIds = new Set<string>();

  // Preserve response order. Rejected requests consume budget too.
  for (const call of calls) {
    checkRunDeadline(run);
    recordEvent(run.trace, { type: 'tool_request', call });
    if (run.toolCallsUsed >= run.limits.toolCalls) {
      return { results, limitReached: true };
    }
    run.toolCallsUsed++;

    const result = await executeToolCall(
      call,
      seenIds,
      {
        entries: run.options.fixture.entries,
        search: run.options.search,
        signal: run.options.signal,
      },
      run.trace,
      Math.min(run.limits.toolTimeoutMs, run.remainingTime()),
    );
    results.push(result);
  }
  return { results, limitReached: false };
}

/** Advances turns until an answer or budget limit; operational errors propagate. */
async function executeLoop(run: RunContext): Promise<RunOutcome> {
  let pendingResults: ToolResult[] = [];

  for (let number = 1; number <= run.limits.modelRequests; number++) {
    checkRunDeadline(run);

    const response = await requestModel(run, number, pendingResults);
    if (response.calls.length === 0) {
      return { termination: 'completed', answer: response.text };
    }

    const batch = await executeToolBatch(run, response.calls);
    if (batch.limitReached) {
      return { termination: 'tool_limit', error: 'Tool call limit reached' };
    }
    pendingResults = batch.results;
  }

  return { termination: 'model_limit', error: 'Model request limit reached' };
}

function failedOutcome(error: unknown): RunOutcome {
  let termination: FailureReason = 'internal_error';
  if (error instanceof DeadlineError) {
    termination = 'timeout';
  } else if (error instanceof ProviderError) {
    termination = 'provider_error';
  }
  return { termination, error: errorMessage(error) };
}

/** Finalizes trace metadata; persistence failure converts even an answer to failure. */
async function finishRun(run: RunContext, outcome: RunOutcome, startedAt: number) {
  const { trace, options } = run;
  if (outcome.termination !== 'completed') {
    recordEvent(trace, {
      type: 'error',
      category: outcome.termination,
      message: outcome.error,
    });
  }
  trace.termination = outcome.termination;
  trace.finalAnswer = outcome.answer;
  trace.endedAt = new Date().toISOString();
  trace.durationMs = Date.now() - startedAt;

  let tracePath: string | undefined;
  try {
    tracePath = await saveTrace(trace, options.traceDirectory);
  } catch {
    outcome = {
      termination: 'internal_error',
      error: 'Could not save trace; check trace directory permissions and disk space',
    };
    trace.termination = outcome.termination;
    delete trace.finalAnswer;
    recordEvent(trace, {
      type: 'error',
      category: 'trace_write',
      message: outcome.error,
    });
    trace.endedAt = new Date().toISOString();
    trace.durationMs = Date.now() - startedAt;
  }
  return { ...outcome, trace, tracePath };
}

/**
 * Coordinates model turns and read-only searches, then attempts to save a trace.
 *
 * Tool calls execute sequentially in response order. Rejected calls consume
 * budget, and tool execution failures terminate the run without retries.
 * A response is final only when it has nonempty text and no tool calls.
 *
 * @param options - Validated fixture, question, fresh adapter, and run settings.
 * @returns The termination reason, final answer on success, and trace path when
 * persistence succeeded. Provider, tool, deadline, and trace-write failures are
 * returned as unsuccessful outcomes rather than thrown.
 * @throws If execution limits are invalid, before a trace is created.
 */
export async function runHarness(options: HarnessOptions) {
  const limits = validateLimits(options.limits);
  const instructions = buildContext(options.fixture.entries);
  const trace = createTrace({
    provider: options.adapter.provider,
    model: options.adapter.model,
    promptVersion: PROMPT_VERSION,
    fixture: options.fixture,
    question: options.question,
    context: instructions,
    limits,
  });
  const startedAt = Date.now();
  const run: RunContext = {
    options,
    limits,
    instructions,
    trace,
    remainingTime: () => limits.runTimeoutMs - (Date.now() - startedAt),
    toolCallsUsed: 0,
  };

  let outcome: RunOutcome;
  try {
    outcome = await executeLoop(run);
  } catch (error) {
    outcome = failedOutcome(error);
  }
  return finishRun(run, outcome, startedAt);
}
