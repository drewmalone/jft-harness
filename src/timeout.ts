/** Signals a deadline or parent cancellation, both reported as timeout outcomes. */
export class DeadlineError extends Error {}

/**
 * Bounds an asynchronous operation and propagates cancellation to its signal.
 *
 * The race bounds how long the caller waits. Work must observe the signal to
 * stop; synchronous JavaScript cannot be forcibly interrupted by this timer.
 * Timers and parent listeners are removed when either side settles.
 *
 * @param work - Operation receiving a signal scoped to this invocation.
 * @param timeoutMs - Allowed wait in milliseconds, capped by the caller's deadline.
 * @param parentSignal - Optional run cancellation signal.
 * @throws {@link DeadlineError} on timeout or parent cancellation; otherwise
 * propagates the operation's error unchanged.
 */
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;

  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new DeadlineError('Execution timed out or was cancelled'));
    };
    parentSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(cancel, Math.max(0, timeoutMs));
    if (parentSignal?.aborted) {
      cancel();
    }
  });

  const operation = Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return work(controller.signal);
  });

  try {
    return await Promise.race([deadline, operation]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (cancel) {
      parentSignal?.removeEventListener('abort', cancel);
    }
  }
}
