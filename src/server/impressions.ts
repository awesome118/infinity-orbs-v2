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
const MAX_POST_ID_LENGTH = 256;
const MAX_TRACKED_POSTS = 1_000;
const RETAINED_POSTS_AFTER_PRUNE = 800;

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

export function normalizeImpressionCount(value: unknown): number {
  const raw = String(value ?? '0').trim();
  // parseInt('12garbage', 10) silently returns 12. Reject partial numbers.
  if (!/^\d+$/.test(raw)) return 0;
  const count = Number(raw);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function postKey(postType: ImpressionPostType, postId: string): string {
  return POST_PREFIX + postType + ':' + encodeURIComponent(postId);
}

async function readCount(key: string): Promise<number> {
  return normalizeImpressionCount(await redis.get(key));
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
  // "unknown post" row. Bound the ID to avoid oversized Redis keys.
  if (!postId || postId.length > MAX_POST_ID_LENGTH) return { recorded: false };

  const now = Date.now();
  const hour = Math.floor(now / 3_600_000);
  const day = Math.floor(now / 86_400_000);
  const keyForPost = postKey(postType, postId);
  const indexField = postType + ':' + postId;

  // Redis INCR keeps counters safe under concurrent preview traffic.
  await Promise.all([
    redis.incr(TOTAL_KEY),
    redis.incr(TYPE_PREFIX + postType),
    redis.incr(DEVICE_PREFIX + deviceType),
    redis.incr(TYPE_DEVICE_PREFIX + postType + ':' + deviceType),
    redis.incr(keyForPost),
    redis.incr(HOUR_PREFIX + hour + ':' + postType),
    redis.incr(DAY_PREFIX + day + ':' + postType),
  ]);

  // The index contains post metadata only, never viewer data. Keep this hash
  // bounded so share/Frenzy posts cannot grow it forever.
  const added = await redis.hSet(POST_INDEX_KEY, {
    [indexField]: JSON.stringify({ postType, postId, lastSeenAt: now }),
  });
  if (added > 0) {
    try {
      const index = await redis.hGetAll(POST_INDEX_KEY);
      const entries = Object.entries(index ?? {}).map(([field, raw]) => {
        let lastSeenAt = 0;
        try {
          const parsed = JSON.parse(String(raw)) as { lastSeenAt?: unknown };
          const timestamp = Number(parsed.lastSeenAt ?? 0);
          if (Number.isSafeInteger(timestamp) && timestamp >= 0) lastSeenAt = timestamp;
        } catch {
          // Malformed legacy rows are treated as oldest and pruned first.
        }
        return { field, lastSeenAt };
      });
      if (entries.length > MAX_TRACKED_POSTS) {
        const stale = entries
          .sort((a, b) => a.lastSeenAt - b.lastSeenAt)
          .slice(0, entries.length - RETAINED_POSTS_AFTER_PRUNE);
        await Promise.all(stale.map(entry => redis.hDel(POST_INDEX_KEY, entry.field)));
      }
    } catch (error) {
      // Maintenance failure must not make the public preview fail.
      console.warn('[Impressions] Post index pruning failed:', error);
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
  const safeNow = Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
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

  // Keep dashboard reads bounded as the community creates more share/Frenzy
  // posts. The hash index is small compared with reading every per-post counter;
  // only the 500 most recently seen post IDs are expanded into rows.
  const indexedPosts = Object.values(postIndex ?? {}).flatMap(raw => {
    try {
      const parsed = JSON.parse(String(raw)) as { postType?: unknown; postId?: unknown; lastSeenAt?: unknown };
      const postType = normalizePostType(parsed.postType);
      const postId = String(parsed.postId ?? '').trim();
      if (!postId) return [];
      const lastSeenAt = Number(parsed.lastSeenAt ?? 0);
      return [{
        postType,
        postId,
        lastSeenAt: Number.isSafeInteger(lastSeenAt) && lastSeenAt >= 0 ? lastSeenAt : 0,
      }];
    } catch {
      return [];
    }
  }).sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, 500);

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
    const bucket = Math.floor(safeNow / 3_600_000) - (23 - index);
    return readTimePoint(bucket, HOUR_PREFIX, new Date(bucket * 3_600_000).toISOString());
  }));

  const last30Days = await Promise.all(Array.from({ length: 30 }, (_, index) => {
    const bucket = Math.floor(safeNow / 86_400_000) - (29 - index);
    return readTimePoint(bucket, DAY_PREFIX, new Date(bucket * 86_400_000).toISOString().slice(0, 10));
  }));

  return { generatedAt: safeNow, total, trackedPostCount: Object.keys(postIndex ?? {}).length, byType, byDevice, byTypeAndDevice, posts, last24Hours, last30Days };
}
