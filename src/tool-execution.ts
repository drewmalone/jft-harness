import type { HarnessOptions } from './harness.js';
import type { SearchArguments } from './tools/search-entries.js';
import { searchEntries } from './tools/search-entries.js';
import { recordEvent, type Trace } from './trace.js';
import type { ToolCall, ToolResult } from './types.js';
import { validateToolCall } from './validation.js';
import { DeadlineError, withTimeout } from './timeout.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export async function executeToolCall(
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

