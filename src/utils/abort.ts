/**
 * Cancellation helpers shared by the AI run pipeline.
 *
 * A single AbortSignal, created in StudioEngine per generation run, is threaded
 * through every /api/chat-forge and /api/compile fetch so a user "Cancelar"
 * aborts the whole run in flight. These helpers keep that plumbing uniform.
 */

/** True when the thrown value is an abort/cancel (fetch aborted or timeout). */
export function isAbortError(e: unknown): boolean {
  return (
    e instanceof DOMException
      ? e.name === 'AbortError'
      : !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError'
  );
}

/**
 * Compose an external cancellation signal with a per-call timeout without
 * relying on AbortSignal.any (not in the ES2022 lib typings). Returns a signal
 * that aborts when EITHER the external signal aborts or `timeoutMs` elapses,
 * plus a cleanup() to detach the listener and clear the timer. Always call
 * cleanup() once the fetch settles to avoid leaking timers/listeners.
 *
 * When `external` is already aborted the returned signal is aborted up-front.
 */
export function withTimeout(
  external: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);

  const onAbort = () => controller.abort((external as AbortSignal).reason);
  if (external) {
    if (external.aborted) {
      controller.abort(external.reason);
    } else {
      external.addEventListener('abort', onAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  };

  return { signal: controller.signal, cleanup };
}
