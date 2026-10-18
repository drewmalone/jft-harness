import { MAX_TIMER_DELAY_MS } from '../../src/harness/timeout.js';
import { it, expect } from 'vitest';
import { validateLimits } from '../../src/harness/limits.js';

it('rejects invalid programmatic limits independently of the CLI', () => {
  for (const value of [0, -1, 1.5, Infinity, NaN]) {
    expect(() => validateLimits({ toolCalls: value })).toThrow();
  }
});

it.each(['modelTimeoutMs', 'toolTimeoutMs', 'runTimeoutMs'] as const)(
  'bounds %s to the Node timer range',
  key => {
    expect(validateLimits({ [key]: MAX_TIMER_DELAY_MS })[key]).toBe(MAX_TIMER_DELAY_MS);
    expect(() => validateLimits({ [key]: MAX_TIMER_DELAY_MS + 1 })).toThrow();
    expect(() => validateLimits({ [key]: Number.MAX_SAFE_INTEGER })).toThrow();
  },
);
