import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Entry } from './entries.js';
import type { TraceEvent, TraceEventData, TranscriptItem, Termination } from './types.js';

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
  limits: unknown;
  events: TraceEvent[];
  transcript: TranscriptItem[];
  termination?: Termination;
  finalAnswer?: string;
};

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

export async function saveTrace(trace: Trace, directory = 'traces') {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${trace.runId}.json`);
  await writeFile(path, JSON.stringify(trace, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600
  });
  return path;
}

export function recordEvent(trace: Trace, event: TraceEventData): void {
  trace.events.push({
    ...event,
    at: new Date().toISOString()
  });
}
