import { buildContext, PROMPT_VERSION } from './context.js';
import type { Entry } from './entries.js';
import { searchArguments, searchEntries } from './tools/search-entries.js';
import { createTrace, saveTrace } from './trace.js';
import type { ModelAdapter, Termination, ToolResult, TraceEvent } from './types.js';
export const DEFAULT_LIMITS = { modelRequests: 5, toolCalls: 6, modelTimeoutMs: 30_000, toolTimeoutMs: 5_000, runTimeoutMs: 120_000 };
export type Limits = typeof DEFAULT_LIMITS;
class DeadlineError extends Error {}
export async function within<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        abort = () => { controller.abort(); reject(new DeadlineError('Execution timed out or was cancelled')); };
        parent?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(abort, Math.max(0, ms));
        if (parent?.aborted) abort();
      }),
      Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(controller.signal); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) parent?.removeEventListener('abort', abort);
  }
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export async function runHarness(options: {
  adapter: ModelAdapter; question: string; fixture: { path: string; hash: string; entries: Entry[] };
  limits?: Partial<Limits>; traceDirectory?: string; signal?: AbortSignal;
  // Narrow execution seam for deterministic failure tests; dispatch and validation remain in the harness.
  search?: (args: ReturnType<typeof searchArguments.parse>, signal: AbortSignal) => Promise<Entry[]>;
}) {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid limit: ${key}`);
  const context = buildContext(options.fixture.entries);
  const trace = createTrace({ provider: options.adapter.provider, model: options.adapter.model, promptVersion: PROMPT_VERSION, fixture: options.fixture, question: options.question, context, limits });
  const start = Date.now();
  const remaining = () => limits.runTimeoutMs - (Date.now() - start);
  type Event = TraceEvent extends infer E ? E extends TraceEvent ? Omit<E, 'at'> : never : never;
  const event = (item: Event) => trace.events.push({ ...item, at: new Date().toISOString() } as TraceEvent);
  let termination: Termination = 'internal_error';
  let errorMessage: string | undefined;
  let toolCount = 0;
  let results: ToolResult[] = [];
  let stage: 'model' | 'tool' = 'model';
  try {
    modelLoop: for (let number = 1; number <= limits.modelRequests; number++) {
      if (remaining() <= 0 || options.signal?.aborted) throw new DeadlineError('Overall deadline reached or run cancelled');
      stage = 'model';
      const input = { instructions: context, question: options.question, results };
      event({ type: 'model_request', number, input });
      const response = await within(signal => options.adapter.request(input, signal), Math.min(limits.modelTimeoutMs, remaining()), options.signal);
      event({ type: 'model_response', number, response });
      trace.transcript.push({ role: 'assistant', text: response.text, calls: response.calls });
      if (response.status && response.status !== 'completed') throw new Error(`Provider response status: ${response.status}`);
      if (!response.calls.length) {
        if (!response.text.trim()) throw new Error('Model returned neither an answer nor tool calls');
        termination = 'completed'; errorMessage = undefined; trace.finalAnswer = response.text; break;
      }
      results = [];
      stage = 'tool';
      // Preserve provider output order. Rejected requests consume the same budget as executions.
      const ids = new Set<string>();
      for (const call of response.calls) {
        event({ type: 'tool_request', call });
        if (toolCount >= limits.toolCalls) { termination = 'tool_limit'; errorMessage = 'Tool call limit reached'; break modelLoop; }
        toolCount++;
        const toolStart = Date.now();
        let output: unknown;
        let executed = false;
        let args: ReturnType<typeof searchArguments.parse> | undefined;
        try {
          if (!call.id || ids.has(call.id)) throw new Error('Missing or duplicate tool call identifier');
          ids.add(call.id);
          if (call.name !== 'search_entries') throw new Error(`Unknown tool: ${call.name}`);
          args = searchArguments.parse(JSON.parse(call.arguments));
          event({ type: 'tool_validation', callId: call.id, valid: true, input: args });
        } catch (error) {
          const detail = message(error);
          event({ type: 'tool_validation', callId: call.id, valid: false, error: detail });
          output = { error: { code: 'invalid_tool_request', message: detail } };
        }
        if (args) {
          executed = true;
          try {
            const validated = args;
            const entries = await within(signal => options.search ? options.search(validated, signal) : Promise.resolve(searchEntries(options.fixture.entries, validated)), Math.min(limits.toolTimeoutMs, remaining()), options.signal);
            output = { entries };
          } catch (error) {
            output = { error: { code: error instanceof DeadlineError ? 'timeout' : 'tool_error', message: message(error) } };
            event({ type: 'tool_result', callId: call.id, output, executed, durationMs: Date.now() - toolStart });
            trace.transcript.push({ role: 'tool', callId: call.id, output });
            throw error;
          }
        }
        event({ type: 'tool_result', callId: call.id, output, executed, durationMs: Date.now() - toolStart });
        results.push({ callId: call.id, output });
        trace.transcript.push({ role: 'tool', callId: call.id, output });
      }
      termination = 'model_limit'; errorMessage = 'Model request limit reached';
    }
  } catch (error) {
    termination = error instanceof DeadlineError ? 'timeout' : stage === 'model' ? 'provider_error' : 'internal_error';
    errorMessage = message(error);
    event({ type: 'error', category: termination, message: errorMessage });
  }
  if (termination !== 'completed' && !trace.events.some(e => e.type === 'error')) event({ type: 'error', category: termination, message: errorMessage ?? termination });
  trace.termination = termination;
  trace.endedAt = new Date().toISOString(); trace.durationMs = Date.now() - start;
  let tracePath: string | undefined;
  try { tracePath = await saveTrace(trace, options.traceDirectory); }
  catch { errorMessage = 'Could not save trace; check trace directory permissions and disk space'; termination = 'internal_error'; trace.termination = termination; }
  return { termination, answer: termination === 'completed' ? trace.finalAnswer : undefined, error: errorMessage, trace, tracePath };
}
