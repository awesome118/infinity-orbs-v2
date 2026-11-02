/**
 * Extra wait after a server-side cooldown rejection.
 *
 * The server reports the remaining cooldown rounded to one decimal place. A
 * small buffer avoids another early request when that value was rounded down
 * or the request is retried close to the boundary.
 */
export const AUTO_ROLL_COOLDOWN_RETRY_BUFFER_MS = 150;

export function autoRollCooldownRetryDelayMs(error: unknown): number | null {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';
  const match = /Cooldown:\s*(\d+(?:\.\d+)?)s/i.exec(message);
  if (!match) return null;

  const remainingSeconds = Number(match[1]);
  if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) return null;

  const retryDelay = Math.ceil(remainingSeconds * 1_000) + AUTO_ROLL_COOLDOWN_RETRY_BUFFER_MS;
  return Number.isFinite(retryDelay) ? retryDelay : null;
}
