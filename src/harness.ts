import { buildContext, PROMPT_VERSION } from './context.js';
import type { Entry } from './entries.js';
import { validateLimits, type Limits } from './limits.js';
import { executeToolCall } from './tool-execution.js';
import type { SearchArguments } from './tools/search-entries.js';
import { createTrace, recordEvent, saveTrace, type Trace } from './trace.js';
import type { ModelAdapter, Termination, ToolCall, ToolResult, Turn } from './types.js';
import { DeadlineError, withTimeout } from './timeout.js';
import { validateModelResponse } from './validation.js';

export { DEFAULT_LIMITS, type Limits } from './limits.js';

export type HarnessOptions = {
  adapter: ModelAdapter;
  question: string;
  fixture: { path: string; hash: string; entries: Entry[] };
  limits?: Partial<Limits>;
  traceDirectory?: string;
  signal?: AbortSignal;
  // Tests simulate search failures without bypassing dispatch or validation.
  search?: (args: SearchArguments, signal: AbortSignal) => Promise<Entry[]>;
};

type RunOutcome = {
  termination: Termination;
  answer?: string;
  error?: string;
};

type RunContext = {
  options: HarnessOptions;
  limits: Limits;
  trace: Trace;
  remainingTime: () => number;
  toolCallsUsed: number;
};

class ProviderError extends Error {}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function requestModel(run: RunContext, number: number, results: ToolResult[]): Promise<Turn> {
  const { options, limits, trace } = run;
  const input = { instructions: trace.context, question: options.question, results };
  recordEvent(trace, { type: 'model_request', number, input });

  try {
    const response = await withTimeout(
      signal => options.adapter.request(input, signal),
      Math.min(limits.modelTimeoutMs, run.remainingTime()),
      options.signal,
    );
    recordEvent(trace, { type: 'model_response', number, response });
    trace.transcript.push({ role: 'assistant', text: response.text, calls: response.calls });
    validateModelResponse(response);
    return response;
  } catch (error) {
    if (error instanceof DeadlineError) {
      throw error;
    }
    throw new ProviderError(errorMessage(error));
  }
}

async function executeToolBatch(run: RunContext, calls: ToolCall[]) {
  const results: ToolResult[] = [];
  const seenIds = new Set<string>();

  // Preserve response order. Rejected requests consume budget too.
  for (const call of calls) {
    recordEvent(run.trace, { type: 'tool_request', call });
    if (run.toolCallsUsed >= run.limits.toolCalls) {
      return { results, limitReached: true };
    }
    run.toolCallsUsed++;

    const result = await executeToolCall(
      call,
      seenIds,
      run.options,
      run.trace,
      Math.min(run.limits.toolTimeoutMs, run.remainingTime()),
    );
    results.push(result);
  }
  return { results, limitReached: false };
}

async function executeLoop(run: RunContext): Promise<RunOutcome> {
  let pendingResults: ToolResult[] = [];

  for (let number = 1; number <= run.limits.modelRequests; number++) {
    if (run.remainingTime() <= 0 || run.options.signal?.aborted) {
      throw new DeadlineError('Overall deadline reached or run cancelled');
    }

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
  let termination: Termination = 'internal_error';
  if (error instanceof DeadlineError) {
    termination = 'timeout';
  } else if (error instanceof ProviderError) {
    termination = 'provider_error';
  }
  return { termination, error: errorMessage(error) };
}

async function finishRun(run: RunContext, outcome: RunOutcome, startedAt: number) {
  const { trace, options } = run;
  if (outcome.termination !== 'completed') {
    recordEvent(trace, {
      type: 'error',
      category: outcome.termination,
      message: outcome.error ?? outcome.termination,
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
  }
  return { ...outcome, trace, tracePath };
}

export async function runHarness(options: HarnessOptions) {
  const limits = validateLimits(options.limits);
  const trace = createTrace({
    provider: options.adapter.provider,
    model: options.adapter.model,
    promptVersion: PROMPT_VERSION,
    fixture: options.fixture,
    question: options.question,
    context: buildContext(options.fixture.entries),
    limits,
  });
  const startedAt = Date.now();
  const run: RunContext = {
    options,
    limits,
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
