import { it, expect } from 'vitest';
import { validateLimits } from '../src/limits.js';
import { validateSearchCall } from '../src/tools/search-entries.js';

it('rejects invalid programmatic limits independently of the CLI', () => {
  for (const value of [0, -1, 1.5, Infinity, NaN]) {
    expect(() => validateLimits({ toolCalls: value })).toThrow();
  }
});

it('rejects duplicate and missing call IDs before tool execution', () => {
  const seenIds = new Set<string>();
  const call = { id: 'call-1', name: 'search_entries', arguments: '{"query":"walk"}' };
  expect(validateSearchCall(call, seenIds)).toEqual({ query: 'walk', limit: 5 });
  expect(() => validateSearchCall(call, seenIds)).toThrow('duplicate');
  expect(() => validateSearchCall({ ...call, id: '' }, seenIds)).toThrow('Missing');
});
