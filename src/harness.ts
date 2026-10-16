import { buildContext, PROMPT_VERSION } from './context.js';
import type { Entry } from './entries.js';
import { searchArguments, searchEntries, type SearchArguments } from './tools/search-entries.js';
import { createTrace, recordEvent, saveTrace, type Trace } from './trace.js';
import type { ModelAdapter, Termination, ToolCall, ToolResult } from './types.js';
import { DeadlineError, withTimeout } from './timeout.js';

export const DEFAULT_LIMITS = {
  modelRequests: 5,
  toolCalls: 6,
  modelTimeoutMs: 30_000,
  toolTimeoutMs: 5_000,
  runTimeoutMs: 120_000,
};

export type Limits = typeof DEFAULT_LIMITS;

export type HarnessOptions = {
  adapter: ModelAdapter;
  question: string;
  fixture: {
    path: string;
    hash: string;
    entries: Entry[];
  };
  limits?: Partial<Limits>;
  traceDirectory?: string;
  signal?: AbortSignal;
  // Tests can simulate search failures without bypassing dispatch or validation.
  search?: (args: SearchArguments, signal: AbortSignal) => Promise<Entry[]>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateToolCall(call: ToolCall, seenIds: Set<string>): SearchArguments {
  if (!call.id || seenIds.has(call.id)) {
    throw new Error('Missing or duplicate tool call identifier');
  }
  seenIds.add(call.id);
  if (call.name !== 'search_entries') {
    throw new Error(`Unknown tool: ${call.name}`);
  }
  return searchArguments.parse(JSON.parse(call.arguments));
}

function recordToolResult(
  trace: Trace,
  callId: string,
  output: unknown,
  executed: boolean,
  startedAt: number,
): ToolResult {
  recordEvent(trace, {
    type: 'tool_result',
    callId,
    output,
    executed,
    durationMs: Date.now() - startedAt,
  });
  trace.transcript.push({
    role: 'tool',
    callId,
    output
  });
  return {
    callId,
    output
  };
}

async function executeToolCall(
  call: ToolCall,
  seenIds: Set<string>,
  options: HarnessOptions,
  trace: Trace,
  timeoutMs: number,
): Promise<ToolResult> {
  const startedAt = Date.now();
  let args: SearchArguments;

  try {
    args = validateToolCall(call, seenIds);
    recordEvent(trace, {
      type: 'tool_validation',
      callId: call.id,
      valid: true,
      input: args,
    });
  } catch (error) {
    const detail = errorMessage(error);
    recordEvent(trace, {
      type: 'tool_validation',
      callId: call.id,
      valid: false,
      error: detail,
    });
    const output = {
      error: {
        code: 'invalid_tool_request',
        message: detail
      },
    };
    return recordToolResult(trace, call.id, output, false, startedAt);
  }

  try {
    const entries = await withTimeout(
      async signal => {
        if (options.search) {
          return options.search(args, signal);
        }
        return searchEntries(options.fixture.entries, args);
      },
      timeoutMs,
      options.signal,
    );
    return recordToolResult(trace, call.id, { entries }, true, startedAt);
  } catch (error) {
    const code = error instanceof DeadlineError ? 'timeout' : 'tool_error';
    const output = {
      error: { code, message: errorMessage(error) },
    };
    recordToolResult(trace, call.id, output, true, startedAt);
    throw error;
  }
}

export async function runHarness(options: HarnessOptions) {
  const limits = {
    ...DEFAULT_LIMITS,
    ...options.limits
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Invalid limit: ${name}`);
    }
  }

  const context = buildContext(options.fixture.entries);
  const trace = createTrace({
    provider: options.adapter.provider,
    model: options.adapter.model,
    promptVersion: PROMPT_VERSION,
    fixture: options.fixture,
    question: options.question,
    context,
    limits,
  });
  const startedAt = Date.now();
  const remainingTime = () => limits.runTimeoutMs - (Date.now() - startedAt);

  let termination: Termination = 'internal_error';
  let failureMessage: string | undefined;
  let toolCallsUsed = 0;
  let pendingResults: ToolResult[] = [];
  let stage: 'model' | 'tool' = 'model';

  try {
    modelLoop: for (let requestNumber = 1; requestNumber <= limits.modelRequests; requestNumber++) {
      if (remainingTime() <= 0 || options.signal?.aborted) {
        throw new DeadlineError('Overall deadline reached or run cancelled');
      }

      stage = 'model';
      const input = {
        instructions: context,
        question: options.question,
        results: pendingResults,
      };
      recordEvent(trace, {
        type: 'model_request',
        number: requestNumber,
        input
      });
      const response = await withTimeout(
        signal => options.adapter.request(input, signal),
        Math.min(limits.modelTimeoutMs, remainingTime()),
        options.signal,
      );
      recordEvent(trace, {
        type: 'model_response',
        number: requestNumber,
        response,
      });
      trace.transcript.push({
        role: 'assistant',
        text: response.text,
        calls: response.calls,
      });

      if (response.status && response.status !== 'completed') {
        throw new Error(`Provider response status: ${response.status}`);
      }

      if (response.calls.length === 0) {
        if (!response.text.trim()) {
          throw new Error('Model returned neither an answer nor tool calls');
        }
        termination = 'completed';
        failureMessage = undefined;
        trace.finalAnswer = response.text;
        break;
      }

      stage = 'tool';
      pendingResults = [];
      const seenIds = new Set<string>();

      // Preserve response order. Rejected requests consume budget too.
      for (const call of response.calls) {
        recordEvent(trace, {
          type: 'tool_request',
          call
        });
        if (toolCallsUsed >= limits.toolCalls) {
          termination = 'tool_limit';
          failureMessage = 'Tool call limit reached';
          break modelLoop;
        }
        toolCallsUsed++;
        const result = await executeToolCall(
          call,
          seenIds,
          options,
          trace,
          Math.min(limits.toolTimeoutMs, remainingTime()),
        );
        pendingResults.push(result);
      }

      termination = 'model_limit';
      failureMessage = 'Model request limit reached';
    }
  } catch (error) {
    if (error instanceof DeadlineError) {
      termination = 'timeout';
    } else if (stage === 'model') {
      termination = 'provider_error';
    } else {
      termination = 'internal_error';
    }
    failureMessage = errorMessage(error);
  }

  if (termination !== 'completed') {
    recordEvent(trace, {
      type: 'error',
      category: termination,
      message: failureMessage ?? termination,
    });
  }

  trace.termination = termination;
  trace.endedAt = new Date().toISOString();
  trace.durationMs = Date.now() - startedAt;

  let tracePath: string | undefined;
  try {
    tracePath = await saveTrace(trace, options.traceDirectory);
  } catch {
    failureMessage = 'Could not save trace; check trace directory permissions and disk space';
    termination = 'internal_error';
    trace.termination = termination;
  }

  return {
    termination,
    answer: termination === 'completed' ? trace.finalAnswer : undefined,
    error: failureMessage,
    trace,
    tracePath,
  };
}
