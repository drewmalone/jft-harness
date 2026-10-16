import { it, expect } from 'vitest';
import { validateLimits } from '../src/limits.js';
import { validateToolCall } from '../src/validation.js';

it('rejects invalid programmatic limits independently of the CLI', () => {
  for (const value of [0, -1, 1.5, Infinity, NaN]) {
    expect(() => validateLimits({ toolCalls: value })).toThrow();
  }
});

it('rejects duplicate and missing call IDs before tool execution', () => {
  const seenIds = new Set<string>();
  const call = { id: 'call-1', name: 'search_entries', arguments: '{"query":"walk"}' };
  expect(validateToolCall(call, seenIds)).toEqual({ query: 'walk', limit: 5 });
  expect(() => validateToolCall(call, seenIds)).toThrow('duplicate');
  expect(() => validateToolCall({ ...call, id: '' }, seenIds)).toThrow('Missing');
});
