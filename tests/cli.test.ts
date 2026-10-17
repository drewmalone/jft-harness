import { MAX_TIMER_DELAY_MS } from '../src/timeout.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { it, expect } from 'vitest';

const exec = promisify(execFile);

function runCli(args: string[]) {
  return exec(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    env: { ...process.env, OPENAI_API_KEY: '' },
  });
}

it('prints help without credentials', async () => {
  const result = await runCli(['--help']);
  expect(result.stdout).toContain('--fixture');
  expect(result.stdout).toContain('--max-tool-calls');
  expect(result.stdout).toContain('gpt-5.4-mini');
});

it('missing arguments produce nonzero exit and usage', async () => {
  await expect(runCli([])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("required option '--fixture <path>' not specified"),
  });
});

it('missing key fails before live execution', async () => {
  await expect(runCli([
    '--fixture', 'fixtures/sample-journal.json',
    '--question', 'What helped?',
  ])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining('Set OPENAI_API_KEY'),
  });
});

it.each(['0', '-1', '1.5', 'not-a-number'])(
  'rejects invalid execution budget %s before live execution',
  async value => {
    await expect(runCli([
      '--fixture', 'fixtures/sample-journal.json',
      '--question', 'What helped?',
      '--max-tool-calls', value,
    ])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Expected a positive integer'),
    });
  },
);

it.each(['--model-timeout-ms', '--tool-timeout-ms', '--run-timeout-ms'])(
  'rejects timer overflow through %s',
  async flag => {
    await expect(runCli([
      '--fixture', 'fixtures/sample-journal.json',
      '--question', 'What helped?',
      flag, String(MAX_TIMER_DELAY_MS + 1),
    ])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(`Timeout must be at most ${MAX_TIMER_DELAY_MS}`),
    });
  },
);


it('rejects unknown context modes before checking credentials', async () => {
  await expect(runCli([
    '--fixture', 'fixtures/sample-journal.json', '--question', 'What helped?',
    '--context-mode', 'unknown',
  ])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Allowed choices are retrieval, full') });
});
