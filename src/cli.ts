import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadFixture } from './entries.js';
import { runHarness, DEFAULT_LIMITS, type Limits } from './harness.js';
import { OpenAIAdapter } from './provider.js';
const usage = `JFT v0.1 — fictional recovery journal questions
Usage: npm run jft -- --fixture ./fixtures/sample-journal.json --question "What helped Alex?"
Options: --help, --model <model>, --trace-dir <directory>
Limits: --max-model-requests (5), --max-tool-calls (6), --model-timeout-ms (30000),
        --tool-timeout-ms (5000), --run-timeout-ms (120000)
Environment: OPENAI_API_KEY (required), OPENAI_MODEL (default: gpt-4.1-mini)`;
async function main() {
  const { values } = parseArgs({ options: {
    fixture: { type: 'string' }, question: { type: 'string' }, help: { type: 'boolean' }, model: { type: 'string' }, 'trace-dir': { type: 'string' },
    'max-model-requests': { type: 'string' }, 'max-tool-calls': { type: 'string' }, 'model-timeout-ms': { type: 'string' }, 'tool-timeout-ms': { type: 'string' }, 'run-timeout-ms': { type: 'string' },
  } });
  if (values.help) { console.log(usage); return; }
  if (!values.fixture || !values.question?.trim()) throw new Error(`--fixture and --question are required.\n${usage}`);
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('Set OPENAI_API_KEY in your environment or .env before a live run.');
  const model = values.model ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  if (!model.trim()) throw new Error('OPENAI_MODEL must not be empty');
  const limits: Limits = { ...DEFAULT_LIMITS };
  const mapping = { 'max-model-requests': 'modelRequests', 'max-tool-calls': 'toolCalls', 'model-timeout-ms': 'modelTimeoutMs', 'tool-timeout-ms': 'toolTimeoutMs', 'run-timeout-ms': 'runTimeoutMs' } as const;
  for (const [flag, key] of Object.entries(mapping)) {
    const value = values[flag as keyof typeof mapping];
    if (value !== undefined) {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 1) throw new Error(`--${flag} must be a positive integer`);
      limits[key] = number;
    }
  }
  const fixture = await loadFixture(resolve(values.fixture));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const result = await runHarness({ adapter: new OpenAIAdapter(model, process.env.OPENAI_API_KEY), question: values.question, fixture, limits, traceDirectory: values['trace-dir'], signal: controller.signal });
    if (result.termination === 'completed') console.log(result.answer);
    else { console.error(`Run failed (${result.termination}): ${result.error}. Inspect the trace and configuration before retrying.`); process.exitCode = 1; }
    if (result.tracePath) console.log(`Trace: ${result.tracePath}`);
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
