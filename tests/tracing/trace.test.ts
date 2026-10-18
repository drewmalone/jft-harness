import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { saveTrace, type Trace } from '../../src/tracing/trace.js';
import completedTrace from './fixtures/completed-v1.json' with { type: 'json' };

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function traceDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'jft-trace-contract-'));
  directories.push(directory);
  return join(directory, 'nested');
}

// Keep this persisted example fixed; changing the format needs deliberate review.
const trace: Trace = completedTrace as Trace;

it('persists the v1 contract including opaque provider evidence in an owner-only file', async () => {
  const path = await saveTrace(trace, await traceDirectory());
  const content = await readFile(path, 'utf8');

  expect(JSON.parse(content)).toEqual(completedTrace);
  expect(content.endsWith('\n')).toBe(true);
  if (process.platform !== 'win32') {
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  }
});

it('refuses to overwrite a trace with the same run ID and preserves the saved record', async () => {
  const directory = await traceDirectory();
  const path = await saveTrace(trace, directory);
  const original = await readFile(path, 'utf8');

  await expect(
    saveTrace({ ...trace, finalAnswer: 'Replacement' }, directory)
  ).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(path, 'utf8')).toBe(original);
});
