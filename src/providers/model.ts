import type { Entry } from '../journal/entries.js';
import type { ToolOutput } from '../tools/search-entries.js';

/** How journal evidence reaches the model. */
export type ContextMode = 'retrieval' | 'full';

/** A model-requested function call. Name and raw JSON arguments are untrusted. */
export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
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
  /** Omitted mode preserves retrieval; journal is untrusted user-message data. */
  contextMode?: ContextMode;
  journal?: Entry[];
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
