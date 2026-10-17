import { resolve } from 'node:path';
import { parseCliOptions } from './cli-options.js';
import { readModelConfig } from './config.js';
import { loadFixture } from './entries.js';
import { runHarness } from './harness.js';
import { OpenAIAdapter } from './provider.js';

async function main() {
  const options = parseCliOptions();
  if (!options.question.trim()) {
    throw new Error('--question must not be blank');
  }
  const config = readModelConfig(options.model);
  const fixture = await loadFixture(resolve(options.fixture));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);

  try {
    const result = await runHarness({
      adapter: new OpenAIAdapter(config.model, config.apiKey),
      question: options.question,
      contextMode: options.contextMode,
      fixture,
      limits: {
        modelRequests: options.maxModelRequests,
        toolCalls: options.maxToolCalls,
        modelTimeoutMs: options.modelTimeoutMs,
        toolTimeoutMs: options.toolTimeoutMs,
        runTimeoutMs: options.runTimeoutMs,
      },
      traceDirectory: options.traceDir,
      signal: controller.signal,
    });

    if (result.termination === 'completed') {
      console.log(result.answer);
    } else {
      console.error(`Run failed (${result.termination}): ${result.error}. Inspect the trace and configuration before retrying.`);
      process.exitCode = 1;
    }
    if (result.tracePath) {
      console.log(`Trace: ${result.tracePath}`);
    }
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
