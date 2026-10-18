import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fixtureSchema, type Entry } from './validation.js';

export { entrySchema, fixtureSchema, type Entry } from './validation.js';

/** Validated journal data plus the source path and original-content hash. */
export type LoadedFixture = {
  path: string;
  hash: string;
  entries: Entry[];
};

/**
 * Reads and validates a fictional journal fixture before harness execution.
 *
 * The SHA-256 hash covers original UTF-8 file content, not normalized JSON.
 * @returns The supplied path, content hash, and validated nonempty entries.
 * @throws On file access, JSON parsing, schema, calendar-date, or duplicate-ID errors.
 */
export async function loadFixture(path: string): Promise<LoadedFixture> {
  const content = await readFile(path, 'utf8');
  return {
    path,
    hash: createHash('sha256').update(content).digest('hex'),
    entries: fixtureSchema.parse(JSON.parse(content))
  };
}
