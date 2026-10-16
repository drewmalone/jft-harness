import { searchArguments, type SearchArguments } from './tools/search-entries.js';
import type { ToolCall, Turn } from './types.js';

/**
 * Enforces the tool allowlist, batch call IDs, JSON parsing, and search schema.
 *
 * @param seenIds - Mutable IDs for this response batch. A new ID is reserved
 * before name/argument checks, so rejected calls cannot reuse it in the batch.
 * @returns Parsed search arguments with defaults applied.
 * @throws If any identifier, tool name, JSON, or argument check fails.
 */
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

/**
 * Rejects incomplete provider turns and turns with neither tools nor an answer.
 * Text alongside tool calls is permitted but is not a final answer.
 * @throws If the turn cannot advance the harness safely.
 */
export function validateModelResponse(response: Turn): void {
  if (response.status && response.status !== 'completed') {
    throw new Error(`Provider response status: ${response.status}`);
  }
  if (response.calls.length === 0 && !response.text.trim()) {
    throw new Error('Model returned neither an answer nor tool calls');
  }
}
