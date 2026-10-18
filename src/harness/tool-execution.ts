import type { Entry } from '../journal/entries.js';
import type { SearchArguments } from '../tools/search-entries.js';
import { searchEntries, validateSearchCall } from '../tools/search-entries.js';
import { recordEvent, recordToolResult, type Trace } from '../tracing/trace.js';
import type { ToolCall, ToolResult } from '../providers/model.js';
import type { ToolOutput } from '../tools/search-entries.js';
import { DeadlineError, withTimeout } from './timeout.js';

/** Search implementation invoked only after call authorization and validation. */
export type SearchExecutor = (args: SearchArguments, signal: AbortSignal) => Promise<Entry[]>;

/** Only the journal data, search override, and cancellation needed by execution. */
export type ToolExecutionOptions = {
  toolsEnabled?: boolean;
  entries: Entry[];
  search?: SearchExecutor;
  signal?: AbortSignal;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validates and executes one permitted call, recording validation and results.
 *
 * Invalid requests return a correlated structured error for the next model
 * turn. Journal strings remain result data and never determine tool dispatch.
 * Budget accounting belongs to the caller, including rejected requests.
 *
 * @returns A result correlated with the original provider call ID.
 * @throws On execution failure or timeout, after recording the failed result.
 * No execution is retried automatically.
 */
export async function executeToolCall(
  call: ToolCall,
  seenIds: Set<string>,
  options: ToolExecutionOptions,
  trace: Trace,
  timeoutMs: number,
): Promise<ToolResult> {
  const startedAt = Date.now();
  let args: SearchArguments;

  try {
    if (options.toolsEnabled === false) {
      throw new Error('No tools are available in full-context mode');
    }
    args = validateSearchCall(call, seenIds);
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
    const output: ToolOutput = {
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
        return searchEntries(options.entries, args);
      },
      timeoutMs,
      options.signal,
    );
    return recordToolResult(trace, call.id, { entries }, true, startedAt);
  } catch (error) {
    const code = error instanceof DeadlineError ? 'timeout' : 'tool_error';
    const output: ToolOutput = {
      error: { code, message: errorMessage(error) },
    };
    recordToolResult(trace, call.id, output, true, startedAt);
    throw error;
  }
}

