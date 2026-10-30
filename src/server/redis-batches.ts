/**
 * Reads a list of Redis keys without sending an unbounded MGet request.
 *
 * Devvit imposes a response-size ceiling on Redis MGet, and player saves can be
 * comparatively large. Small chunks keep each response bounded; limiting the
 * number of in-flight chunks avoids replacing one oversized request with a burst.
 */
export async function readInBatches<T>(
  keys: readonly string[],
  readMany: (batchKeys: string[]) => Promise<readonly T[]>,
  batchSize = 16,
  maxConcurrency = 4,
): Promise<T[]> {
  if (keys.length === 0) return [];

  const safeBatchSize = Number.isSafeInteger(batchSize) && batchSize > 0 ? batchSize : 16;
  const safeConcurrency = Number.isSafeInteger(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : 4;
  const chunkCount = Math.ceil(keys.length / safeBatchSize);
  const output = new Array<T>(keys.length);
  let nextChunk = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const chunkIndex = nextChunk;
      nextChunk += 1;
      if (chunkIndex >= chunkCount) return;

      const start = chunkIndex * safeBatchSize;
      const batchKeys = keys.slice(start, start + safeBatchSize);
      const values = await readMany(batchKeys);

      if (!Array.isArray(values) || values.length !== batchKeys.length) {
        throw new Error('Redis MGet batch returned a different number of values than keys.');
      }
      for (let index = 0; index < values.length; index += 1) {
        output[start + index] = values[index] as T;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(safeConcurrency, chunkCount) }, () => worker()),
  );
  return output;
}


/**
 * Serialize an array while keeping its payload below Devvit's Redis RPC budget.
 * "first" preserves the array prefix (for ranked lists); "last" preserves the
 * newest entries (for append-only diagnostics). Returns null only when even []
 * cannot fit the requested limit.
 */
export function serializeJsonArrayWithinByteLimit<T>(
  items: readonly T[],
  maxBytes: number,
  retain: 'first' | 'last' = 'last',
): string | null {
  const budget = Math.max(2, Math.floor(Number(maxBytes) || 0));
  const encoder = new TextEncoder();
  let low = 0;
  let high = items.length;
  let best: string | null = null;

  while (low <= high) {
    const count = Math.floor((low + high) / 2);
    const slice = retain === 'first'
      ? items.slice(0, count)
      : items.slice(items.length - count);
    const serialized = JSON.stringify(slice);
    if (encoder.encode(serialized).byteLength <= budget) {
      best = serialized;
      low = count + 1;
    } else {
      high = count - 1;
    }
  }

  return best;
}
