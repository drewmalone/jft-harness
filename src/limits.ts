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

const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const timeoutDuration = positiveInteger.max(MAX_TIMER_DELAY_MS);
const limitsSchema = z.object({
  modelRequests: positiveInteger,
  toolCalls: positiveInteger,
  modelTimeoutMs: timeoutDuration,
  toolTimeoutMs: timeoutDuration,
  runTimeoutMs: timeoutDuration,
});

/**
 * Merges overrides with defaults and checks every budget before a run begins.
 * @throws If any count or duration is not a positive safe integer, or a duration
 * exceeds Node's maximum timer delay.
 */
export function validateLimits(overrides: Partial<Limits> = {}): Limits {
  return limitsSchema.parse({ ...DEFAULT_LIMITS, ...overrides });
}
