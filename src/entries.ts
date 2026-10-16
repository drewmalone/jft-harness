import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fixtureSchema } from './fixture-validation.js';

export { entrySchema, fixtureSchema, type Entry } from './fixture-validation.js';

export async function loadFixture(path: string) {
  const content = await readFile(path, 'utf8');
  return {
    path,
    hash: createHash('sha256').update(content).digest('hex'),
    entries: fixtureSchema.parse(JSON.parse(content))
  };
}
