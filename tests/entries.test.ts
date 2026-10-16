import { describe, it, expect } from 'vitest';
import { fixtureSchema, loadFixture } from '../src/entries.js';
const entry = { id: 'entry-001', date: '2026-09-01', text: 'Fictional text' };
describe('fixtures', () => {
  it('loads the fictional dataset and hashes original content', async () => {
    const fixture = await loadFixture('fixtures/sample-journal.json');
    expect(fixture.entries).toHaveLength(18); expect(fixture.hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([null, [], [{ ...entry, text: '' }], [{ ...entry, date: '2026-02-30' }], [{ ...entry, date: '2025-02-29' }], [{ ...entry, id: '../bad' }]])('rejects malformed fixture %j', value => {
    expect(fixtureSchema.safeParse(value).success).toBe(false);
  });
  it('rejects duplicate IDs', () => expect(fixtureSchema.safeParse([entry, entry]).success).toBe(false));
  it('accepts leap day', () => expect(fixtureSchema.safeParse([{ ...entry, date: '2024-02-29' }]).success).toBe(true));
});
