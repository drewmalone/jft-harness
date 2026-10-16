import { searchArguments, type SearchArguments } from './tools/search-entries.js';
import type { ToolCall, Turn } from './types.js';

export function validateToolCall(call: ToolCall, seenIds: Set<string>): SearchArguments {
  if (!call.id || seenIds.has(call.id)) {
    throw new Error('Missing or duplicate tool call identifier');
  }
  seenIds.add(call.id);

  if (call.name !== 'search_entries') {
    throw new Error(`Unknown tool: ${call.name}`);
  }
  return searchArguments.parse(JSON.parse(call.arguments));
}

export function validateModelResponse(response: Turn): void {
  if (response.status && response.status !== 'completed') {
    throw new Error(`Provider response status: ${response.status}`);
  }
  if (response.calls.length === 0 && !response.text.trim()) {
    throw new Error('Model returned neither an answer nor tool calls');
  }
}
