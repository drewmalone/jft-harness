import { it, expect } from 'vitest';
import { searchArguments, searchEntries, searchTool } from '../src/tools/search-entries.js';

const entries = ['Sponsor anxiety', 'Anxiety', 'sponsor anxiety anxiety', 'walking'].map((text, i) => ({
  id: `e${i}`,
  date: '2026-09-01',
  text
}));

it('ranks unique keyword overlap and breaks ties by fixture order', () => {
  const original = JSON.stringify(entries);
  expect(searchEntries(entries, searchArguments.parse({ query: 'ANXIETY sponsor sponsor' })).map(e => e.id)).toEqual(['e0', 'e2', 'e1']);
  expect(JSON.stringify(entries)).toBe(original);
});

it('has no semantic or substring matches', () => expect(searchEntries(entries, searchArguments.parse({ query: 'walk' }))).toEqual([]));

it('defaults and bounds limit consistently', () => {
  expect(searchArguments.parse({ query: 'x' }).limit).toBe(5);
  for (const value of [0, 11, 1.5, '2']) {
    expect(searchArguments.safeParse({
      query: 'x',
      limit: value
    }).success).toBe(false);
  }
  expect(searchTool.parameters).toMatchObject({
    additionalProperties: false,
    properties: { limit: { maximum: 10 } }
  });
  expect(searchEntries(entries, {
    query: 'anxiety',
    limit: 1
  })).toHaveLength(1);
});

it('segments punctuation and Unicode words without regular expressions', () => {
  const journal = [
    { id: 'one', date: '2026-09-01', text: 'CAFÉ, sponsor! Anxiety.' },
    { id: 'two', date: '2026-09-02', text: 'Walking home.' },
  ];
  const results = searchEntries(journal, { query: 'café sponsor', limit: 5 });
  expect(results.map(entry => entry.id)).toEqual(['one']);
});
