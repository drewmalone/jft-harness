import { it, expect } from 'vitest';
import {
  searchArguments,
  searchEntries,
  searchTool,
  validateSearchCall
} from '../../src/tools/search-entries.js';

const texts = [
  'Sponsor anxiety',
  'Anxiety',
  'sponsor anxiety anxiety',
  'walking'
];
const entries = texts.map((text, index) => ({
  id: `e${index}`,
  date: '2026-09-01',
  text
}));

it('ranks unique keyword overlap and breaks ties by fixture order', () => {
  const originalEntries = JSON.stringify(entries);
  const args = searchArguments.parse({ query: 'ANXIETY sponsor sponsor' });

  const results = searchEntries(entries, args);

  expect(results.map((entry) => entry.id)).toEqual(['e0', 'e2', 'e1']);
  expect(JSON.stringify(entries)).toBe(originalEntries);
});

it('has no semantic or substring matches', () => {
  const args = searchArguments.parse({ query: 'walk' });

  expect(searchEntries(entries, args)).toEqual([]);
});

it('defaults and bounds the result limit consistently', () => {
  const defaultArgs = searchArguments.parse({ query: 'x' });
  expect(defaultArgs.limit).toBe(5);

  for (const limit of [0, 11, 1.5, '2']) {
    const validation = searchArguments.safeParse({ query: 'x', limit });
    expect(validation.success).toBe(false);
  }

  expect(searchTool.parameters).toMatchObject({
    additionalProperties: false,
    properties: { limit: { maximum: 10 } }
  });
  expect(searchEntries(entries, { query: 'anxiety', limit: 1 })).toHaveLength(
    1
  );
});

it('segments punctuation and Unicode words without regular expressions', () => {
  const journal = [
    { id: 'one', date: '2026-09-01', text: 'CAFÉ, sponsor! Anxiety.' },
    { id: 'two', date: '2026-09-02', text: 'Walking home.' }
  ];

  const results = searchEntries(journal, { query: 'café sponsor', limit: 5 });

  expect(results.map((entry) => entry.id)).toEqual(['one']);
});

it('rejects duplicate and missing call IDs before tool execution', () => {
  const seenIds = new Set<string>();
  const call = {
    id: 'call-1',
    name: 'search_entries',
    arguments: '{"query":"walk"}'
  };

  expect(validateSearchCall(call, seenIds)).toEqual({
    query: 'walk',
    limit: 5
  });
  expect(() => validateSearchCall(call, seenIds)).toThrow('duplicate');
  expect(() => validateSearchCall({ ...call, id: '' }, seenIds)).toThrow(
    'Missing'
  );
});
