/** Conservative payload ceilings for individual Devvit Redis Set values. */
export const REDIS_SAFE_SET_MAX_BYTES = 48 * 1024;
const REDIS_LOG_ENTRY_MAX_BYTES = 6 * 1024;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function compactLogEntry<T extends object>(entry: T): T | Record<string, unknown> {
  const record = entry as Record<string, unknown>;
  const raw = JSON.stringify(entry);
  if (byteLength(raw) <= REDIS_LOG_ENTRY_MAX_BYTES) return entry;

  const compact: Record<string, unknown> = {
    truncated: true,
    preview: raw.slice(0, 900),
  };
  for (const key of [
    'timestamp', 'at', 'event', 'stage', 'userId', 'username',
    'boosterId', 'boosterName', 'tier', 'usedCredit',
  ]) {
    const value = record[key];
    if (typeof value === 'string') compact[key] = value.slice(0, 100);
    else if (typeof value === 'number' || typeof value === 'boolean') compact[key] = value;
  }
  return compact;
}

/** Retains the newest diagnostics while guaranteeing one Redis value stays bounded. */
export function serializeBoundedRedisLog<T extends object>(entries: T[]): string {
  const compacted = entries.map(compactLogEntry);
  let low = 0;
  let high = compacted.length;
  let bestStart = compacted.length;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = JSON.stringify(compacted.slice(middle));
    if (byteLength(candidate) <= REDIS_SAFE_SET_MAX_BYTES) {
      bestStart = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  const serialized = JSON.stringify(compacted.slice(bestStart));
  return byteLength(serialized) <= REDIS_SAFE_SET_MAX_BYTES ? serialized : '[]';
}

/** Retains the highest-ranked prefix of a sorted leaderboard within the Set ceiling. */
export function serializeBoundedLeaderboard<T>(entries: T[]): string {
  let low = 0;
  let high = entries.length;
  let best = '[]';

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = JSON.stringify(entries.slice(0, middle));
    if (byteLength(candidate) <= REDIS_SAFE_SET_MAX_BYTES) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

/** Bounds a set of named leaderboard arrays under one shared Redis value limit. */
export function serializeBoundedLeaderboardBoards(
  boards: Record<string, unknown>,
): string {
  const bounded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(boards)) {
    bounded[key] = Array.isArray(value) ? value.slice() : value;
  }

  let serialized = JSON.stringify(bounded);
  while (byteLength(serialized) > REDIS_SAFE_SET_MAX_BYTES) {
    let largestKey: string | null = null;
    let largestLength = 0;
    for (const [key, value] of Object.entries(bounded)) {
      if (Array.isArray(value) && value.length > largestLength) {
        largestKey = key;
        largestLength = value.length;
      }
    }
    if (!largestKey || largestLength <= 1) return '{}';
    (bounded[largestKey] as unknown[]).pop();
    serialized = JSON.stringify(bounded);
  }
  return serialized;
}

/** Retains the newest chat entries; an unexpectedly huge message is never written. */
export function serializeBoundedRecentArray<T>(entries: T[]): string {
  let low = 0;
  let high = entries.length;
  let best = '[]';
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = JSON.stringify(entries.slice(entries.length - middle));
    if (byteLength(candidate) <= REDIS_SAFE_SET_MAX_BYTES) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}
