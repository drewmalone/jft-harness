import { describe, it, expect } from 'vitest';
import { loadFixture } from '../../src/journal/entries.js';
import { fixtureSchema } from '../../src/journal/validation.js';

const entry = {
  id: 'entry-001',
  date: '2026-09-01',
  text: 'Fictional text'
};

const malformedFixtures = [
  null,
  [],
  [{ ...entry, text: '' }],
  [{ ...entry, date: '2026-02-30' }],
  [{ ...entry, date: '2025-02-29' }],
  [{ ...entry, date: '2026-9-01' }],
  [{ ...entry, date: '2026-09-01T00:00:00Z' }],
  [{ ...entry, date: '2026-0a-01' }],
  [{ ...entry, id: '../bad' }],
  [{ ...entry, id: '-bad' }],
  [{ ...entry, id: '' }]
];

describe('fixtures', () => {
  it('loads the fictional dataset and hashes original content', async () => {
    const fixture = await loadFixture('fixtures/sample-journal.json');
    expect(fixture.entries).toHaveLength(18);
    expect(fixture.hash).toHaveLength(64);
    const hasOnlyHexDigits = [...fixture.hash].every((character) =>
      '0123456789abcdef'.includes(character)
    );
    expect(hasOnlyHexDigits).toBe(true);
  });

  it.each(malformedFixtures)('rejects malformed fixture %j', (value) => {
    expect(fixtureSchema.safeParse(value).success).toBe(false);
  });

  it('rejects duplicate IDs', () => {
    expect(fixtureSchema.safeParse([entry, entry]).success).toBe(false);
  });

  it('accepts leap day', () => {
    const fixture = [{ ...entry, date: '2024-02-29' }];
    expect(fixtureSchema.safeParse(fixture).success).toBe(true);
  });
});

it.each(['entry-001', 'entry_002', 'ABC123'])('accepts stable ID %s', (id) => {
  expect(fixtureSchema.safeParse([{ ...entry, id }]).success).toBe(true);
});

it.each(['_leading', 'has space', 'has/slash', 'éclair', 'has.dot'])(
  'rejects unsupported ID %s',
  (id) => {
    expect(fixtureSchema.safeParse([{ ...entry, id }]).success).toBe(false);
  }
);
