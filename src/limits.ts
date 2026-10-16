import { z } from 'zod';

export const DEFAULT_LIMITS = {
  modelRequests: 5,
  toolCalls: 6,
  modelTimeoutMs: 30_000,
  toolTimeoutMs: 5_000,
  runTimeoutMs: 120_000,
};

export type Limits = typeof DEFAULT_LIMITS;

const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const limitsSchema = z.object({
  modelRequests: positiveInteger,
  toolCalls: positiveInteger,
  modelTimeoutMs: positiveInteger,
  toolTimeoutMs: positiveInteger,
  runTimeoutMs: positiveInteger,
});

export function validateLimits(overrides: Partial<Limits> = {}): Limits {
  return limitsSchema.parse({ ...DEFAULT_LIMITS, ...overrides });
}
