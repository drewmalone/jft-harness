export class DeadlineError extends Error {}

// Racing bounds the wait; the signal also asks cooperative work to stop.
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
