import { z } from 'zod';

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
const limitsSchema = z.object({
  modelRequests: positiveInteger,
  toolCalls: positiveInteger,
  modelTimeoutMs: positiveInteger,
  toolTimeoutMs: positiveInteger,
  runTimeoutMs: positiveInteger,
});

/**
 * Merges overrides with defaults and checks every budget before a run begins.
 * @throws If any count or duration is not a positive safe integer.
 */
export function validateLimits(overrides: Partial<Limits> = {}): Limits {
  return limitsSchema.parse({ ...DEFAULT_LIMITS, ...overrides });
}
