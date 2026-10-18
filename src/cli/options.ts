import { Command, InvalidArgumentError } from 'commander';
import { DEFAULT_MODEL } from './config.js';
import type { ZodNumber } from 'zod';
import { countBudgetSchema, DEFAULT_LIMITS, timeoutBudgetSchema } from '../harness/limits.js';

/** Adapts a shared numeric schema to Commander's string parser and error format. */
function budgetArgument(schema: ZodNumber) {
  return (value: string): number => {
    const result = schema.safeParse(Number(value));
    if (!result.success) {
      throw new InvalidArgumentError(result.error.issues[0]?.message ?? 'Invalid execution budget');
    }
    return result.data;
  };
}

const countArgument = budgetArgument(countBudgetSchema);
const timeoutArgument = budgetArgument(timeoutBudgetSchema);

/**
 * Parses process arguments with Commander and validates required options/budgets.
 * Commander prints help or usage errors and exits for those paths; model
 * credentials and fixture content are validated separately before execution.
 */
export function parseCliOptions() {
  const command = new Command()
    .name('jft')
    .description('JFT v0.1 — fictional recovery journal questions')
    .requiredOption('--fixture <path>', 'JSON journal fixture')
    .requiredOption('--question <text>', 'Question to answer')
    .option('--model <model>', `Override OPENAI_MODEL (default: ${DEFAULT_MODEL})`)
    .option('--trace-dir <directory>', 'Trace output directory', 'traces')
    .option('--max-model-requests <number>', 'Model request budget', countArgument, DEFAULT_LIMITS.modelRequests)
    .option('--max-tool-calls <number>', 'Tool call budget, including rejected calls', countArgument, DEFAULT_LIMITS.toolCalls)
    .option('--model-timeout-ms <number>', 'Per-request timeout', timeoutArgument, DEFAULT_LIMITS.modelTimeoutMs)
    .option('--tool-timeout-ms <number>', 'Per-tool timeout', timeoutArgument, DEFAULT_LIMITS.toolTimeoutMs)
    .option('--run-timeout-ms <number>', 'Overall deadline', timeoutArgument, DEFAULT_LIMITS.runTimeoutMs)
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
