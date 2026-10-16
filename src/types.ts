export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ToolResult = {
  callId: string;
  output: unknown;
};

export type Turn = {
  text: string;
  calls: ToolCall[];
  status?: string;
  usage?: unknown;
  raw?: unknown;
};

export type ModelRequest = {
  instructions: string;
  question: string;
  results: ToolResult[];
};

export interface ModelAdapter {
  model: string;
  provider: string;
  request(input: ModelRequest, signal: AbortSignal): Promise<Turn>;
}

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
  output: unknown;
};

export type Termination = 'completed' | 'model_limit' | 'tool_limit' | 'timeout' | 'provider_error' | 'internal_error';

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
  output: unknown;
  durationMs: number;
  executed: boolean;
} | {
  type: 'error';
  category: string;
  message: string;
});

export type TraceEvent = TraceEventData & {
  at: string;
};
