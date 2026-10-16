import { afterEach, it, expect, vi } from 'vitest';
import { DeadlineError, withTimeout } from '../src/timeout.js';

afterEach(() => vi.useRealTimers());

it('aborts cooperative work when its deadline expires', async () => {
  vi.useFakeTimers();
  let operationSignal: AbortSignal | undefined;
  const operation = withTimeout(signal => {
    operationSignal = signal;
    return new Promise<never>(() => {});
  }, 100);
  const rejection = expect(operation).rejects.toBeInstanceOf(DeadlineError);

  await vi.advanceTimersByTimeAsync(100);
  await rejection;
  expect(operationSignal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('propagates parent cancellation and removes its listener', async () => {
  const parent = new AbortController();
  const removeListener = vi.spyOn(parent.signal, 'removeEventListener');
  let operationSignal: AbortSignal | undefined;
  const operation = withTimeout(signal => {
    operationSignal = signal;
    return new Promise<never>(() => {});
  }, 1000, parent.signal);
  const rejection = expect(operation).rejects.toBeInstanceOf(DeadlineError);

  await Promise.resolve();
  parent.abort();
  await rejection;
  expect(operationSignal?.aborted).toBe(true);
  expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('cleans up the deadline after successful work', async () => {
  vi.useFakeTimers();
  await expect(withTimeout(async () => 'done', 100)).resolves.toBe('done');
  expect(vi.getTimerCount()).toBe(0);
});
