import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { it, expect } from 'vitest';

const exec = promisify(execFile);

it('prints help without credentials', async () => {
  const result = await exec(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--help'], { env: {
      ...process.env,
      OPENAI_API_KEY: ''
    } });
  expect(result.stdout).toContain('--fixture');
  expect(result.stdout).toContain('--max-tool-calls');
});

it('missing arguments produce nonzero exit and usage', async () => {
  await expect(exec(process.execPath, ['--import', 'tsx', 'src/cli.ts'])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining('--fixture and --question are required')
  });
});

it('missing key fails before live execution', async () => {
  await expect(exec(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--fixture', 'fixtures/sample-journal.json', '--question', 'What helped?'], { env: {
      ...process.env,
      OPENAI_API_KEY: ''
    } })).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining('Set OPENAI_API_KEY')
  });
});
