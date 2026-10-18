import { z } from 'zod';
import { MAX_TIMER_DELAY_MS } from './timeout.js';

/** Default budgets; all durations are milliseconds and all counts include failures. */
export const DEFAULT_LIMITS = {
  modelRequests: 5,
  toolCalls: 6,
  modelTimeoutMs: 30_000,
  toolTimeoutMs: 5_000,
  runTimeoutMs: 120_000,
};

/** Positive integer budgets for requests, requested tools, and operation/run waits. */
export type Limits = typeof DEFAULT_LIMITS;

/** Shared count rules for CLI arguments and programmatic execution budgets. */
export const countBudgetSchema = z.number({ error: 'Expected a positive integer' })
  .int({ error: 'Expected a positive integer' })
  .positive({ error: 'Expected a positive integer' })
  .max(Number.MAX_SAFE_INTEGER, { error: 'Expected a positive safe integer' });

/** Shared duration rules, including the maximum delay supported by Node timers. */
export const timeoutBudgetSchema = countBudgetSchema.max(MAX_TIMER_DELAY_MS, {
  error: `Timeout must be at most ${MAX_TIMER_DELAY_MS} milliseconds`,
});

const limitsSchema = z.object({
  modelRequests: countBudgetSchema,
  toolCalls: countBudgetSchema,
  modelTimeoutMs: timeoutBudgetSchema,
  toolTimeoutMs: timeoutBudgetSchema,
  runTimeoutMs: timeoutBudgetSchema,
});

/**
 * Merges overrides with defaults and checks every budget before a run begins.
 * @throws If any count or duration is not a positive safe integer, or a duration
 * exceeds Node's maximum timer delay.
 */
export function validateLimits(overrides: Partial<Limits> = {}): Limits {
  return limitsSchema.parse({ ...DEFAULT_LIMITS, ...overrides });
}
