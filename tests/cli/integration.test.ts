import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { it, expect } from 'vitest';

const exec = promisify(execFile);
const journal = [{ id: 'entry-001', date: '2026-09-01', text: 'A walk eased anxiety.' }];
const question = 'What helped Nelson?';
const answer = 'A walk eased anxiety [entry-001].';
const testKey = 'fictional-local-test-key';

const reasoning = {
  type: 'reasoning',
  id: 'rs-1',
  summary: [],
  encrypted_content: 'fictional-reasoning',
};
const functionCall = {
  type: 'function_call',
  id: 'fc-1',
  call_id: 'call-search-1',
  name: 'search_entries',
  arguments: '{"query":"anxiety"}',
  status: 'completed',
};
const finalMessage = {
  type: 'message',
  id: 'msg-1',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text: answer, annotations: [] }],
};

type ResponseScenario = 'success' | 'provider_error';

type CapturedRequest = {
  method: string | undefined;
  url: string | undefined;
  body: Record<string, unknown>;
};

function createFakeResponsesServer(scenario: ResponseScenario) {
  const requests: CapturedRequest[] = [];
  const serverErrors: unknown[] = [];

  const server = createServer((request, response) => {
    // Keep callback failures observable without unhandled async rejections.
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ method: request.method, url: request.url, body });
      response.setHeader('content-type', 'application/json');

      if (scenario === 'provider_error') {
        response.writeHead(429);
        response.end(JSON.stringify({
          error: { message: 'Local rate limit', type: 'rate_limit_error', code: 'rate_limit_exceeded' },
        }));
        return;
      }

      if (requests.length > 2) {
        throw new Error('Unexpected extra model request');
      }
      const output = requests.length === 1 ? [reasoning, functionCall] : [finalMessage];
      response.end(JSON.stringify({
        id: `resp-${requests.length}`,
        object: 'response',
        created_at: 1_800_000_000,
        status: 'completed',
        model: 'local-test-model',
        output,
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }));
    })().catch(error => {
      serverErrors.push(error);
      response.writeHead(500);
      response.end(JSON.stringify({ error: { message: 'Fake endpoint failed' } }));
    });
  });

  return { server, requests, serverErrors };
}

it.each(['success', 'provider_error'] as const)(
  'runs the real CLI and SDK against a local Responses endpoint: %s',
  async scenario => {
    const directory = await mkdtemp(join(tmpdir(), 'jft-cli-'));
    const fixturePath = join(directory, 'fixture.json');
    const traceDirectory = join(directory, 'traces');
    const { server, requests, serverErrors } = createFakeResponsesServer(scenario);

    try {
      await writeFile(fixturePath, JSON.stringify(journal));
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('No local server port');
      }

      const command = exec(process.execPath, [
        '--import', 'tsx', 'src/cli/main.ts',
        '--fixture', fixturePath,
        '--question', question,
        '--model', 'local-test-model',
        '--trace-dir', traceDirectory,
      ], {
        timeout: 5000,
        env: {
          ...process.env,
          OPENAI_API_KEY: testKey,
          OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        },
      });

      if (scenario === 'success') {
        const result = await command;
        expect(result.stdout).toContain(answer);
        expect(result.stdout).toContain(`Trace: ${traceDirectory}`);
        expect(result.stderr).toBe('');
        expect(requests).toHaveLength(2);
        expect(requests[0]?.body.input).toEqual([{ role: 'user', content: question }]);
        expect(requests[1]?.body.input).toEqual([
          { role: 'user', content: question },
          reasoning,
          functionCall,
          {
            type: 'function_call_output',
            call_id: 'call-search-1',
            output: JSON.stringify({ entries: journal }),
          },
        ]);
      } else {
        await expect(command).rejects.toMatchObject({
          code: 1,
          stderr: expect.stringContaining('Run failed (provider_error)'),
          stdout: expect.stringContaining(`Trace: ${traceDirectory}`),
        });
        // The actual SDK receives 429; retries must remain disabled.
        expect(requests).toHaveLength(1);
      }

      expect(serverErrors).toEqual([]);
      for (const request of requests) {
        expect(request).toMatchObject({
          method: 'POST',
          url: '/v1/responses',
          body: {
            model: 'local-test-model',
            store: false,
            include: ['reasoning.encrypted_content'],
            tools: [expect.objectContaining({ name: 'search_entries' })],
          },
        });
      }

      const files = await readdir(traceDirectory);
      expect(files).toHaveLength(1);
      const traceText = await readFile(join(traceDirectory, files[0]!), 'utf8');
      const trace = JSON.parse(traceText);
      expect(trace.termination).toBe(scenario === 'success' ? 'completed' : 'provider_error');
      expect(traceText).not.toContain(testKey);
      if (scenario === 'success') {
        expect(trace.finalAnswer).toBe(answer);
        expect(trace.events.map((event: { type: string }) => event.type)).toEqual([
          'model_request', 'model_response', 'tool_request', 'tool_validation',
          'tool_result', 'model_request', 'model_response',
        ]);
        expect(trace.events[1].response.usage.total_tokens).toBe(15);
      } else {
        expect(trace.finalAnswer).toBeUndefined();
        expect(trace.events.at(-1).category).toBe('provider_error');
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
