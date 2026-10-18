import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Entry } from './entries.js';
import type { Limits } from './limits.js';
import type { TraceEvent, TraceEventData, TranscriptItem, Termination, ToolOutput, ToolResult, Turn } from './types.js';

/**
 * Inspectable record of one attempted run, including full fictional journal data.
 * Fields describing completion are filled at termination. This format is not a
 * retention or redaction policy suitable for real journals.
 */
export type Trace = {
  schemaVersion: '1';
  runId: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  model: string;
  promptVersion: string;
  fixture: {
    path: string;
    hash: string;
    entries: Entry[];
  };
  question: string;
  context: string;
  limits: Limits;
  events: TraceEvent[];
  transcript: TranscriptItem[];
  termination?: Termination;
  finalAnswer?: string;
};

/** Creates run identity, start time, and the initial logical user message. */
export function createTrace(input: Omit<Trace, 'schemaVersion' | 'runId' | 'startedAt' | 'events' | 'transcript'>): Trace {
  return {
    ...input,
    schemaVersion: '1',
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    events: [],
    transcript: [
      { role: 'user', text: input.question },
    ],
  };
}

/**
 * Writes a new JSON trace without overwriting an existing run file.
 * Creates the directory if needed and requests owner-only file permissions.
 * @returns The trace file path, only after the write succeeds.
 * @throws On serialization or filesystem errors; the harness reports run failure.
 */
export async function saveTrace(trace: Trace, directory = 'traces') {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${trace.runId}.json`);
  await writeFile(path, JSON.stringify(trace, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600
  });
  return path;
}

/** Appends an event with its observation time, preserving execution order. */
export function recordEvent(trace: Trace, event: TraceEventData): void {
  trace.events.push({
    ...event,
    at: new Date().toISOString()
  });
}

/** Records a model response and its logical assistant message together. */
export function recordModelResponse(trace: Trace, number: number, response: Turn): void {
  recordEvent(trace, { type: 'model_response', number, response });
  trace.transcript.push({
    role: 'assistant',
    text: response.text,
    calls: response.calls,
  });
}

/**
 * Records a tool outcome and its logical tool message together.
 * Includes rejected requests and execution failures as well as successful search.
 * @param startedAt - Operation start time in epoch milliseconds, for duration.
 * @returns The correlated output for the next model request.
 */
export function recordToolResult(
  trace: Trace,
  callId: string,
  output: ToolOutput,
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
