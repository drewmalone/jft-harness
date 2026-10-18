import type { Entry } from '../journal/entries.js';

/** A model-requested function call. Name and raw JSON arguments are untrusted. */
export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

/** Search results or a structured error; an output cannot contain both. */
export type ToolOutput =
  | { entries: Entry[]; error?: never }
  | {
      error: {
        code: 'invalid_tool_request' | 'tool_error' | 'timeout';
        message: string;
      };
      entries?: never;
    };

/** Structured output correlated by provider call ID, including validation errors. */
export type ToolResult = {
  callId: string;
  output: ToolOutput;
};

/** Normalized model turn plus optional opaque provider evidence and token usage. */
export type Turn = {
  text: string;
  calls: ToolCall[];
  status?: string;
  usage?: unknown;
  raw?: unknown;
};

/** Logical request input; results belong to the immediately preceding tool batch. */
export type ModelRequest = {
  instructions: string;
  question: string;
  results: ToolResult[];
};

/** Sequential model boundary. A fresh stateful instance is required for each run. */
export interface ModelAdapter {
  model: string;
  provider: string;
  request(input: ModelRequest, signal: AbortSignal): Promise<Turn>;
}

/** Logical conversation view for inspection; does not replace provider history. */
export type TranscriptItem = {
  role: 'user';
  text: string;
} | {
  role: 'assistant';
  text: string;
  calls: ToolCall[];
} | {
  role: 'tool';
  callId: string;
  output: ToolOutput;
};

/** Why the run stopped; only completed represents a successful answer. */
export type Termination = 'completed' | 'model_limit' | 'tool_limit' | 'timeout' | 'provider_error' | 'internal_error';

/** Unsuccessful termination reasons, excluding completed. */
export type FailureReason = Exclude<Termination, 'completed'>;

/** A completed run always has an answer; every failed run has an error. */
export type RunOutcome =
  | { termination: 'completed'; answer: string; error?: never }
  | { termination: FailureReason; error: string; answer?: never };

/** Event payloads recorded at orchestration boundaries, before timestamping. */
export type TraceEventData = ({
  type: 'model_request';
  number: number;
  input: ModelRequest;
} | {
  type: 'model_response';
  number: number;
  response: Turn;
} | {
  type: 'tool_request';
  call: ToolCall;
} | {
  type: 'tool_validation';
  callId: string;
  valid: boolean;
  error?: string;
  input?: unknown;
} | {
  type: 'tool_result';
  callId: string;
  output: ToolOutput;
  durationMs: number;
  executed: boolean;
} | {
  type: 'error';
  category: string;
  message: string;
});

/** Ordered event with an ISO observation timestamp. */
export type TraceEvent = TraceEventData & {
  at: string;
};
