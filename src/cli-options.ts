import { Command, InvalidArgumentError } from 'commander';
import { DEFAULT_MODEL } from './config.js';
import { DEFAULT_LIMITS } from './limits.js';

function positiveInteger(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new InvalidArgumentError('Expected a positive integer');
  }
  return number;
}

export function parseCliOptions() {
  const command = new Command()
    .name('jft')
    .description('JFT v0.1 — fictional recovery journal questions')
    .requiredOption('--fixture <path>', 'JSON journal fixture')
    .requiredOption('--question <text>', 'Question to answer')
    .option('--model <model>', `Override OPENAI_MODEL (default: ${DEFAULT_MODEL})`)
    .option('--trace-dir <directory>', 'Trace output directory', 'traces')
    .option('--max-model-requests <number>', 'Model request budget', positiveInteger, DEFAULT_LIMITS.modelRequests)
    .option('--max-tool-calls <number>', 'Tool call budget, including rejected calls', positiveInteger, DEFAULT_LIMITS.toolCalls)
    .option('--model-timeout-ms <number>', 'Per-request timeout', positiveInteger, DEFAULT_LIMITS.modelTimeoutMs)
    .option('--tool-timeout-ms <number>', 'Per-tool timeout', positiveInteger, DEFAULT_LIMITS.toolTimeoutMs)
    .option('--run-timeout-ms <number>', 'Overall deadline', positiveInteger, DEFAULT_LIMITS.runTimeoutMs)
    .showHelpAfterError()
    .addHelpText('after', '\nExample: npm run jft -- --fixture fixtures/sample-journal.json --question "What helped Nelson?"\nEnvironment: OPENAI_API_KEY (required), OPENAI_MODEL (optional)');

  command.parse();
  return command.opts<{
    fixture: string;
    question: string;
    model?: string;
    traceDir: string;
    maxModelRequests: number;
    maxToolCalls: number;
    modelTimeoutMs: number;
    toolTimeoutMs: number;
    runTimeoutMs: number;
  }>();
}
