import { context, redis } from './devvit-mock.js';

export type ImpressionPostType = 'main-game' | 'orb-share' | 'frenzy';
export type ImpressionDeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

const POST_TYPES: ImpressionPostType[] = ['main-game', 'orb-share', 'frenzy'];
const DEVICE_TYPES: ImpressionDeviceType[] = ['mobile', 'tablet', 'desktop', 'unknown'];
const TOTAL_KEY = 'io:impressions:total';
const TYPE_PREFIX = 'io:impressions:type:';
const DEVICE_PREFIX = 'io:impressions:device:';
const POST_PREFIX = 'io:impressions:post:';
const POST_INDEX_KEY = 'io:impressions:post-index';
const TYPE_DEVICE_PREFIX = 'io:impressions:type-device:';
const HOUR_PREFIX = 'io:impressions:hour:';
const DAY_PREFIX = 'io:impressions:day:';
const INDEX_PRUNE_COUNTER_KEY = 'io:impressions:index-prune-counter';
const INDEX_PRUNE_EVERY = 100;
const MAX_INDEXED_POSTS = 2_000;
const MAX_COUNTER_COMMIT_ATTEMPTS = 24;

function normalizePostType(value: unknown): ImpressionPostType {
  const candidate = String(value ?? '').trim();
  if (!POST_TYPES.includes(candidate as ImpressionPostType)) {
    throw new Error('Unsupported impression post type.');
  }
  return candidate as ImpressionPostType;
}

function normalizeDeviceType(value: unknown): ImpressionDeviceType {
  const candidate = String(value ?? '').trim();
  return DEVICE_TYPES.includes(candidate as ImpressionDeviceType)
    ? candidate as ImpressionDeviceType
    : 'unknown';
}

function normalizeCount(value: unknown): number {
  const raw = value === null || value === undefined || value === '' ? '0' : value;
  const count = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function postKey(postType: ImpressionPostType, postId: string): string {
  return POST_PREFIX + postType + ':' + encodeURIComponent(postId);
}

async function readCount(key: string): Promise<number> {
  return normalizeCount(await redis.get(key));
}

async function prunePostIndex(now: number): Promise<void> {
  const retentionCutoff = now - 180 * 86_400_000;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const txn = await redis.watch(POST_INDEX_KEY);
    let transactionClosed = false;
    try {
      const currentIndex = await redis.hGetAll(POST_INDEX_KEY);
      const entries = Object.entries(currentIndex ?? {}).map(([field, raw]) => {
        try {
          const parsed = JSON.parse(String(raw)) as { postType?: unknown; postId?: unknown; lastSeenAt?: unknown };
          normalizePostType(parsed.postType);
          const postId = String(parsed.postId ?? '').trim();
          const lastSeenAt = Number(parsed.lastSeenAt ?? 0);
          const valid = Boolean(postId) && postId.length <= 200 &&
            Number.isSafeInteger(lastSeenAt) && lastSeenAt >= 0;
          return { field, lastSeenAt: valid ? lastSeenAt : 0, invalid: !valid };
        } catch {
          return { field, lastSeenAt: 0, invalid: true };
        }
      }).sort((a, b) => b.lastSeenAt - a.lastSeenAt);

      const expiredOrInvalid = entries.filter(
        entry => entry.invalid || entry.lastSeenAt < retentionCutoff,
      );
      const recentEntries = entries.filter(
        entry => !entry.invalid && entry.lastSeenAt >= retentionCutoff,
      );
      const fieldsToPrune = [...new Set([
        ...expiredOrInvalid,
        ...recentEntries.slice(MAX_INDEXED_POSTS),
      ].map(entry => entry.field))].slice(0, 250);

      if (fieldsToPrune.length === 0) {
        await txn.unwatch();
        transactionClosed = true;
        return;
      }

      await txn.multi();
      for (const field of fieldsToPrune) await txn.hDel(POST_INDEX_KEY, field);
      const result = await txn.exec();
      transactionClosed = true;
      if (result !== null) return;
    } finally {
      if (!transactionClosed) await txn.unwatch().catch(() => undefined);
    }

    // Another view changed the shared hash during the prune. Yield and retry
    // a small, bounded number of times; the next impression/dashboard read can
    // continue cleanup if contention remains high.
    await new Promise(resolve => setTimeout(resolve, Math.min(5 * (attempt + 1), 20)));
  }
  throw new Error('Impression index changed repeatedly; cleanup will retry later.');
}

/**
 * Records aggregate post-preview loads only. No username, Reddit user ID,
 * raw user-agent, or per-view browsing event is persisted. Importantly, this
 * module never touches the online-player set or the player activity registry.
 */
export async function recordPostImpression(
  postTypeValue: unknown,
  deviceTypeValue: unknown,
): Promise<{ recorded: boolean }> {
  const postType = normalizePostType(postTypeValue);
  const deviceType = normalizeDeviceType(deviceTypeValue);
  const postId = String(context.postId ?? '').trim();

  // Without Reddit post context, do not merge unrelated previews into a fake
  // "unknown post" row. A real post ID is required for useful analytics.
  if (!postId || postId.length > 200 || /[\u0000-\u001f\u007f]/.test(postId)) {
    return { recorded: false };
  }

  const now = Date.now();
  const hour = Math.floor(now / 3_600_000);
  const day = Math.floor(now / 86_400_000);
  const keyForPost = postKey(postType, postId);
  const indexField = postType + ':' + postId;
  // Time buckets only serve recent charts. Per-post counters can be recreated
  // on the next view, so orphaned/old keys should not accumulate forever.
  const postCounterExpiration = new Date(now + 180 * 86_400_000);
  const hourBucketExpiration = new Date((hour + 25) * 3_600_000);
  const dayBucketExpiration = new Date((day + 31) * 86_400_000);

  // Commit the counters and index entry together. Independent INCR calls can
  // otherwise leave totals and breakdowns inconsistent when one write fails.
  const counterKeys = [
    TOTAL_KEY,
    TYPE_PREFIX + postType,
    DEVICE_PREFIX + deviceType,
    TYPE_DEVICE_PREFIX + postType + ':' + deviceType,
    keyForPost,
    HOUR_PREFIX + hour + ':' + postType,
    DAY_PREFIX + day + ':' + postType,
    INDEX_PRUNE_COUNTER_KEY,
    POST_INDEX_KEY,
  ];
  let pruneSequence = 0;
  let committed = false;

  const nextCounter = (raw: unknown): number => {
    const current = normalizeCount(raw);
    if (current >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Impression counter exceeded the safe integer limit.');
    }
    return current + 1;
  };

  for (let attempt = 0; attempt < MAX_COUNTER_COMMIT_ATTEMPTS; attempt += 1) {
    const txn = await redis.watch(...counterKeys);
    let transactionClosed = false;
    try {
      const [
        totalRaw,
        typeRaw,
        deviceRaw,
        typeDeviceRaw,
        postRaw,
        hourRaw,
        dayRaw,
        pruneRaw,
      ] = await Promise.all([
        redis.get(TOTAL_KEY),
        redis.get(TYPE_PREFIX + postType),
        redis.get(DEVICE_PREFIX + deviceType),
        redis.get(TYPE_DEVICE_PREFIX + postType + ':' + deviceType),
        redis.get(keyForPost),
        redis.get(HOUR_PREFIX + hour + ':' + postType),
        redis.get(DAY_PREFIX + day + ':' + postType),
        redis.get(INDEX_PRUNE_COUNTER_KEY),
      ]);

      const nextTotal = nextCounter(totalRaw);
      const nextType = nextCounter(typeRaw);
      const nextDevice = nextCounter(deviceRaw);
      const nextTypeDevice = nextCounter(typeDeviceRaw);
      const nextPost = nextCounter(postRaw);
      const nextHour = nextCounter(hourRaw);
      const nextDay = nextCounter(dayRaw);
      const nextPruneSequence = nextCounter(pruneRaw);

      await txn.multi();
      await txn.set(TOTAL_KEY, String(nextTotal));
      await txn.set(TYPE_PREFIX + postType, String(nextType));
      await txn.set(DEVICE_PREFIX + deviceType, String(nextDevice));
      await txn.set(TYPE_DEVICE_PREFIX + postType + ':' + deviceType, String(nextTypeDevice));
      await txn.set(keyForPost, String(nextPost), { expiration: postCounterExpiration });
      await txn.set(HOUR_PREFIX + hour + ':' + postType, String(nextHour), { expiration: hourBucketExpiration });
      await txn.set(DAY_PREFIX + day + ':' + postType, String(nextDay), { expiration: dayBucketExpiration });
      await txn.set(INDEX_PRUNE_COUNTER_KEY, String(nextPruneSequence));
      await txn.hSet(POST_INDEX_KEY, {
        [indexField]: JSON.stringify({ postType, postId, lastSeenAt: now }),
      });

      const result = await txn.exec();
      transactionClosed = true;
      if (result !== null) {
        pruneSequence = nextPruneSequence;
        committed = true;
        break;
      }
    } finally {
      if (!transactionClosed) await txn.unwatch().catch(() => undefined);
    }
    // Optimistic retries need a small yield; do not spin synchronously under load.
    await new Promise(resolve => setTimeout(resolve, Math.min(2 * (attempt + 1), 16)));
  }

  if (!committed) {
    throw new Error('Impression counters changed repeatedly. Please retry.');
  }

  // Index pruning is best-effort after commit; it must not turn a recorded
  // impression into an apparent failure that causes clients to retry it.
  if (pruneSequence % INDEX_PRUNE_EVERY === 0) {
    try {
      await prunePostIndex(now);
    } catch (error) {
      console.error('[Impressions] Index pruning failed after the impression committed.', error);
    }
  }
  return { recorded: true };
}

export interface ImpressionPostRow {
  postType: ImpressionPostType;
  postId: string;
  impressions: number;
}

export interface ImpressionTimePoint {
  bucket: string;
  total: number;
  byType: Record<ImpressionPostType, number>;
}

export interface ImpressionDashboard {
  generatedAt: number;
  total: number;
  trackedPostCount: number;
  byType: Record<ImpressionPostType, number>;
  byDevice: Record<ImpressionDeviceType, number>;
  byTypeAndDevice: Record<ImpressionPostType, Record<ImpressionDeviceType, number>>;
  posts: ImpressionPostRow[];
  last24Hours: ImpressionTimePoint[];
  last30Days: ImpressionTimePoint[];
}

/** Reads aggregate impression metrics for the admin-only dashboard. */
export async function getImpressionDashboard(now = Date.now()): Promise<ImpressionDashboard> {
  const requestedNow = Number(now);
  const dashboardNow = Number.isFinite(requestedNow) && requestedNow >= 0
    ? Math.floor(requestedNow)
    : Date.now();
  const [total, postIndex] = await Promise.all([
    readCount(TOTAL_KEY),
    redis.hGetAll(POST_INDEX_KEY),
  ]);

  const byType = Object.fromEntries(await Promise.all(
    POST_TYPES.map(async type => [type, await readCount(TYPE_PREFIX + type)] as const),
  )) as Record<ImpressionPostType, number>;

  const byDevice = Object.fromEntries(await Promise.all(
    DEVICE_TYPES.map(async device => [device, await readCount(DEVICE_PREFIX + device)] as const),
  )) as Record<ImpressionDeviceType, number>;

  const typeDeviceEntries = await Promise.all(POST_TYPES.map(async type => {
    const values = await Promise.all(DEVICE_TYPES.map(async device => [
      device,
      await readCount(TYPE_DEVICE_PREFIX + type + ':' + device),
    ] as const));
    return [type, Object.fromEntries(values)] as const;
  }));
  const byTypeAndDevice = Object.fromEntries(typeDeviceEntries) as Record<
    ImpressionPostType,
    Record<ImpressionDeviceType, number>
  >;

  // Keep dashboard reads bounded and consistent with the per-post counter TTL.
  // Stale/corrupt rows are excluded immediately and lazily deleted even during
  // quiet periods when no new impression arrives to trigger the periodic sweep.
  const postIndexRetentionCutoff = dashboardNow - 180 * 86_400_000;
  const staleIndexFields: string[] = [];
  const validIndexedPosts = Object.entries(postIndex ?? {}).flatMap(([field, raw]) => {
    try {
      const parsed = JSON.parse(String(raw)) as { postType?: unknown; postId?: unknown; lastSeenAt?: unknown };
      const postType = normalizePostType(parsed.postType);
      const postId = String(parsed.postId ?? '').trim();
      const lastSeenAt = Number(parsed.lastSeenAt ?? 0);
      if (!postId || postId.length > 200 || !Number.isSafeInteger(lastSeenAt) ||
          lastSeenAt < 0 || lastSeenAt < postIndexRetentionCutoff) {
        staleIndexFields.push(field);
        return [];
      }
      return [{ postType, postId, lastSeenAt }];
    } catch {
      staleIndexFields.push(field);
      return [];
    }
  }).sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  // The displayed snapshot filters these rows immediately. Clean the underlying
  // hash through WATCH/MULTI/EXEC so a concurrent fresh impression cannot be lost.
  if (staleIndexFields.length > 0 || validIndexedPosts.length > MAX_INDEXED_POSTS) {
    try {
      await prunePostIndex(dashboardNow);
    } catch (error) {
      console.error('[Impressions] Dashboard index cleanup failed.', error);
    }
  }
  const trackedPostCount = validIndexedPosts.length;
  const indexedPosts = validIndexedPosts.slice(0, 500);

  const rows = await Promise.all(indexedPosts.map(async ({ postType, postId }) => ({
    postType,
    postId,
    impressions: await readCount(postKey(postType, postId)),
  } satisfies ImpressionPostRow)));
  const posts = rows
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 200);

  const readTimePoint = async (bucketNumber: number, prefix: string, label: string): Promise<ImpressionTimePoint> => {
    const pairs = await Promise.all(POST_TYPES.map(async type => [
      type,
      await readCount(prefix + bucketNumber + ':' + type),
    ] as const));
    const values = Object.fromEntries(pairs) as Record<ImpressionPostType, number>;
    return {
      bucket: label,
      total: POST_TYPES.reduce((sum, type) => sum + values[type], 0),
      byType: values,
    };
  };

  const last24Hours = await Promise.all(Array.from({ length: 24 }, (_, index) => {
    const bucket = Math.floor(dashboardNow / 3_600_000) - (23 - index);
    return readTimePoint(bucket, HOUR_PREFIX, new Date(bucket * 3_600_000).toISOString());
  }));

  const last30Days = await Promise.all(Array.from({ length: 30 }, (_, index) => {
    const bucket = Math.floor(dashboardNow / 86_400_000) - (29 - index);
    return readTimePoint(bucket, DAY_PREFIX, new Date(bucket * 86_400_000).toISOString().slice(0, 10));
  }));

  return { generatedAt: dashboardNow, total, trackedPostCount, byType, byDevice, byTypeAndDevice, posts, last24Hours, last30Days };
}
