/** Signals a deadline or parent cancellation, both reported as timeout outcomes. */
export class DeadlineError extends Error {}

/**
 * Bounds an asynchronous operation and propagates cancellation to its signal.
 *
 * Two promises race: the operation and a timer/parent-cancellation rejection.
 * When the deadline wins, the caller receives DeadlineError immediately and
 * the operation's signal is aborted. The OpenAI adapter forwards that signal
 * to the SDK so its in-flight HTTP request can be cancelled.
 *
 * This does not kill arbitrary work: a task that ignores its signal may keep
 * running after the caller stops waiting. A timer also cannot interrupt busy
 * synchronous JavaScript because its callback needs the event loop to run.
 * Tool implementations must therefore remain bounded and honor cancellation
 * when performing asynchronous work. There is no automatic retry.
 *
 * The parent signal represents whole-run cancellation; the local timer applies
 * only to this operation. Either path uses the same DeadlineError outcome.
 * Finally removes the timer and parent listener even if the operation fails.
 *
 * @example
 * ```ts
 * await withTimeout(
 *   signal => adapter.request(input, signal),
 *   Math.min(modelTimeoutMs, remainingRunTimeMs),
 *   runSignal,
 * );
 * ```
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

  // Deferring work lets an already-cancelled parent prevent it from starting.
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
