import { redis } from './devvit-mock.js';
import { readInBatches } from './redis-batches.js';
import { CODEX_SHARD_COUNT, codexShardKey } from '../shared/collection-storage.js';

type StorageGroup = { label: string; bytes: number; keys: number; records: number };
type PlayerManifest = { token: string; chunkCount: number; length: number };
type LargeManifest = { namespaceHash: string; token: string; chunkCount: number; length: number };

const encoder = new TextEncoder();
const byteLength = (value: string): number => encoder.encode(value).length;
const PLAYER_CHUNK_PREFIX = 'io:player-save-chunk:';
const LARGE_CHUNK_PREFIX = 'io:large-value-chunk:v1:';
const ANALYTICS_PREFIX = 'io:impressions:unique-v2:';
const MAX_AUDIT_USERS = 100;
const MAX_PLAYER_CHUNK_PAYLOAD_READ_BYTES = 32 * 1024 * 1024;
const MAX_TOP_VALUES = 25;

function valueBytes(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string') return byteLength(value);
  try { return byteLength(JSON.stringify(value) ?? String(value)); }
  catch { return byteLength(String(value)); }
}

function parsePlayerManifest(value: unknown): PlayerManifest | null {
  if (typeof value !== 'string' || !value.startsWith('{"__ioPlayerSaveManifest":1')) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const token = String(parsed.token ?? '');
    const chunkCount = Number(parsed.chunkCount);
    const length = Number(parsed.length);
    if (!/^[a-zA-Z0-9-]{8,120}$/.test(token) ||
        !Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > 128 ||
        !Number.isSafeInteger(length) || length < 1 || length > 8 * 1024 * 1024) return null;
    return { token, chunkCount, length };
  } catch { return null; }
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseLargeManifest(namespaceKey: string, value: unknown): LargeManifest | null {
  if (typeof value !== 'string' || !value.startsWith('{"__ioLargeValueManifest":1')) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const namespaceHash = String(parsed.namespaceHash ?? '');
    const token = String(parsed.token ?? '');
    const chunkCount = Number(parsed.chunkCount);
    const length = Number(parsed.length);
    if (namespaceHash !== hashText(namespaceKey) ||
        !/^[a-zA-Z0-9-]{8,120}$/.test(token) ||
        !Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > 128 ||
        !Number.isSafeInteger(length) || length <= 192 * 1024 || length > 8 * 1024 * 1024) return null;
    return { namespaceHash, token, chunkCount, length };
  } catch { return null; }
}

function playerChunkKey(userId: string, token: string, index: number): string {
  return PLAYER_CHUNK_PREFIX + userId + ':' + token + ':' + index;
}

function largeChunkKey(manifest: LargeManifest, index: number): string {
  return LARGE_CHUNK_PREFIX + manifest.namespaceHash + ':' + manifest.token + ':' + String(index).padStart(3, '0');
}

export async function auditKnownRedisStorage(redisClient: any = redis) {
  const groups = new Map<string, StorageGroup>();
  const largest: Array<{ family: string; bytes: number; keyBytes: number; valueBytes: number }> = [];
  const errors: string[] = [];
  const now = Date.now();
  let missingPlayerChunks = 0;
  let playerChunkPayloadBytesEstimated = 0;
  let playerChunkPayloadBytesRead = 0;
  let playerChunkKeysSkipped = 0;
  let missingLargeValueChunks = 0;
  let playerManifestCount = 0;
  let codexUsersAudited = 0;
  let codexKeysPresent = 0;
  let analyticsPostIndexFields = 0;
  let analyticsViewerIndexFields = 0;

  const add = (family: string, key: string, value: unknown): void => {
    if (value == null) return;
    const group = groups.get(family) ?? { label: family, bytes: 0, keys: 0, records: 0 };
    const keyBytes = byteLength(key);
    const bytes = keyBytes + valueBytes(value);
    group.bytes += bytes;
    group.keys += 1;
    group.records += 1;
    groups.set(family, group);
    largest.push({ family, bytes, keyBytes, valueBytes: bytes - keyBytes });
    if (largest.length > MAX_TOP_VALUES * 3) {
      largest.sort((a, b) => b.bytes - a.bytes);
      largest.length = MAX_TOP_VALUES;
    }
  };

  const addHash = (family: string, key: string, value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return;
    const group = groups.get(family) ?? { label: family, bytes: 0, keys: 0, records: 0 };
    let bytes = byteLength(key);
    for (const [field, fieldValue] of entries) bytes += byteLength(field) + valueBytes(fieldValue);
    group.bytes += bytes;
    group.keys += 1;
    group.records += entries.length;
    groups.set(family, group);
    largest.push({ family, bytes, keyBytes: byteLength(key), valueBytes: bytes - byteLength(key) });
    if (largest.length > MAX_TOP_VALUES * 3) {
      largest.sort((a, b) => b.bytes - a.bytes);
      largest.length = MAX_TOP_VALUES;
    }
  };

  const safeMGet = async (keys: string[]): Promise<unknown[]> => {
    if (!keys.length) return [];
    return readInBatches(keys, batch => redisClient.mGet(batch), 12, 3);
  };

  const registryKey = 'io:player-registry';
  let registry: Record<string, unknown> = {};
  try {
    const raw = await redisClient.hGetAll(registryKey);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) registry = raw as Record<string, unknown>;
    addHash('Player registry', registryKey, registry);
  } catch (error) {
    errors.push('Player registry read failed: ' + String(error));
  }

  const allUserIds = Object.keys(registry);
  const userIds = allUserIds.slice(0, MAX_AUDIT_USERS);
  const truncatedUsers = Math.max(0, allUserIds.length - userIds.length);
  const playerKeys = userIds.map(id => 'player:' + id);
  const combatKeys = userIds.map(id => 'infinity-orbs:combat:' + id);
  const generationKeys = userIds.map(id => 'player-generation:' + id);

  let playerValues: unknown[] = [];
  let combatValues: unknown[] = [];
  let generationValues: unknown[] = [];
  try {
    [playerValues, combatValues, generationValues] = await Promise.all([
      safeMGet(playerKeys),
      safeMGet(combatKeys),
      safeMGet(generationKeys),
    ]);
  } catch (error) {
    errors.push('Indexed player/combat save read failed: ' + String(error));
  }

  const playerStates = new Map<string, { saveGeneration: number; collectionStorageVersion: number; raw: string }>();
  const chunkPlans: Array<{ userId: string; keys: string[]; length: number }> = [];
  for (let index = 0; index < userIds.length; index += 1) {
    const userId = userIds[index];
    const raw = playerValues[index];
    if (typeof raw === 'string') {
      add('Player saves', playerKeys[index], raw);
      const manifest = parsePlayerManifest(raw);
      if (manifest) {
        playerManifestCount += 1;
        chunkPlans.push({
          userId,
          keys: Array.from({ length: manifest.chunkCount }, (_, chunk) => playerChunkKey(userId, manifest.token, chunk)),
          length: manifest.length,
        });
      } else {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          playerStates.set(userId, {
            saveGeneration: Math.max(0, Math.floor(Number(parsed.saveGeneration) || 0)),
            collectionStorageVersion: Math.floor(Number(parsed.collectionStorageVersion) || 0),
            raw,
          });
        } catch { /* Report the raw save size even if a legacy save is malformed. */ }
      }
    }
    if (typeof combatValues[index] === 'string') add('Combat saves', combatKeys[index], combatValues[index]);
    if (generationValues[index] != null) add('Player generation markers', generationKeys[index], generationValues[index]);
  }

  const chunkReadPlans: typeof chunkPlans = [];
  let remainingChunkReadBytes = MAX_PLAYER_CHUNK_PAYLOAD_READ_BYTES;
  for (const plan of chunkPlans) {
    playerChunkPayloadBytesEstimated += plan.length;
    if (plan.length <= remainingChunkReadBytes) {
      chunkReadPlans.push(plan);
      remainingChunkReadBytes -= plan.length;
    } else {
      playerChunkKeysSkipped += plan.keys.length;
      const estimated = groups.get('Player save chunks (manifest estimate)') ?? {
        label: 'Player save chunks (manifest estimate)', bytes: 0, keys: 0, records: 0,
      };
      estimated.bytes += plan.length + plan.keys.reduce((total, key) => total + byteLength(key), 0);
      estimated.keys += plan.keys.length;
      estimated.records += plan.keys.length;
      groups.set(estimated.label, estimated);
    }
  }
  const flatPlayerChunkKeys = chunkReadPlans.flatMap(plan => plan.keys);
  if (flatPlayerChunkKeys.length) {
    try {
      const chunkValues = await safeMGet(flatPlayerChunkKeys);
      let offset = 0;
      for (const plan of chunkReadPlans) {
        const chunks = chunkValues.slice(offset, offset + plan.keys.length);
        offset += plan.keys.length;
        let joined = '';
        for (let i = 0; i < plan.keys.length; i += 1) {
          const value = chunks[i];
          if (typeof value !== 'string') {
            missingPlayerChunks += 1;
            continue;
          }
          add('Player save chunks', plan.keys[i], value);
          playerChunkPayloadBytesRead += valueBytes(value);
          joined += value;
        }
        if (chunks.every(value => typeof value === 'string')) {
          try {
            const parsed = JSON.parse(joined) as Record<string, unknown>;
            playerStates.set(plan.userId, {
              saveGeneration: Math.max(0, Math.floor(Number(parsed.saveGeneration) || 0)),
              collectionStorageVersion: Math.floor(Number(parsed.collectionStorageVersion) || 0),
              raw: joined,
            });
          } catch {
            errors.push('A chunked player save could not be parsed for one indexed account.');
          }
        }
      }
    } catch (error) {
      errors.push('Player-save chunk payload read failed: ' + String(error));
    }
  }

  // Codex hashes are generation-scoped. Audit the active generation only;
  // obsolete generations cannot be discovered without a provider key scan.
  const codexRequests = userIds.flatMap(userId => {
    const state = playerStates.get(userId);
    if (!state || state.collectionStorageVersion < 1) return [];
    codexUsersAudited += 1;
    return Array.from({ length: CODEX_SHARD_COUNT }, (_, shard) => ({
      userId,
      shard,
      key: codexShardKey(userId, state.saveGeneration, shard),
    }));
  });
  try {
    const codexHashes = await readInBatches(
      codexRequests.map(item => item.key),
      async batch => Promise.all(batch.map(key => redisClient.hGetAll(key))),
      8,
      4,
    );
    for (let index = 0; index < codexRequests.length; index += 1) {
      const value = codexHashes[index];
      if (value && typeof value === 'object' && Object.keys(value).length) {
        codexKeysPresent += 1;
        addHash('Active Codex shards', codexRequests[index].key, value);
      }
    }
  } catch (error) {
    errors.push('Active Codex shard audit failed: ' + String(error));
  }

  const sharedStringKeys = [
    'io:leaderboard', 'io:guilds', 'io:community_event', 'io:community_event_tick',
    'io:global-chat:v1', 'io:global-game-post-id',
    'io:game-bans', 'io:ccu:all-time', 'io:follow-prompt-actions:v2', 'io:popup-config:v1',
    'io:developer-announcement', 'io:global-booster-announcement',
    'io:global-boosters:v4', 'io:daily-streak-community',
    'io:leaderboards:cache:v1', 'io:guild-token-reset:v1', 'io:guild-upgrade-reset:v1',
  ];
  try {
    const sharedValues = await safeMGet(sharedStringKeys);
    for (let i = 0; i < sharedStringKeys.length; i += 1) {
      const key = sharedStringKeys[i];
      const value = sharedValues[i];
      if (typeof value !== 'string') continue;
      add(key === 'io:guilds' ? 'Guild data' : key === 'io:leaderboard' || key === 'io:leaderboards:cache:v1' ? 'Leaderboards' : 'Shared game state', key, value);
      const manifest = parseLargeManifest(key, value);
      if (manifest) {
        const keys = Array.from({ length: manifest.chunkCount }, (_, chunk) => largeChunkKey(manifest, chunk));
        try {
          const chunks = await safeMGet(keys);
          for (let chunk = 0; chunk < keys.length; chunk += 1) {
            if (typeof chunks[chunk] !== 'string') missingLargeValueChunks += 1;
            else add(key === 'io:guilds' ? 'Guild data chunks' : 'Leaderboard chunks', keys[chunk], chunks[chunk]);
          }
        } catch (error) {
          errors.push('Large-value chunk read failed for ' + key + ': ' + String(error));
        }
      }
    }
  } catch (error) {
    errors.push('Shared string-key audit failed: ' + String(error));
  }

  const currentOnlinePlayers = Number(await redisClient.zCard('io:online:players').catch((error: unknown) => {
    errors.push('Online-player sorted-set count failed: ' + String(error));
    return 0;
  })) || 0;

  const hourlyCcuKeys = Array.from({ length: 720 }, (_, index) =>
    'io:ccu:hour:' + String(Math.floor(now / 3_600_000) - index),
  );
  try {
    const hourlyCcuValues = await safeMGet(hourlyCcuKeys);
    for (let i = 0; i < hourlyCcuKeys.length; i += 1) add('CCU history', hourlyCcuKeys[i], hourlyCcuValues[i]);
  } catch (error) {
    errors.push('Hourly CCU history read failed: ' + String(error));
  }

  const hashKeys = [
    ['Guild chat mutes', 'io:guild-chat-mutes:v1'],
    ['Chat reports', 'io:chat-reports:v1'],
    ['Arena profiles', 'infinity-orbs:combat:arena:profiles'],
    ['Impression post index', ANALYTICS_PREFIX + 'post-index'],
    ['Impression viewer index', ANALYTICS_PREFIX + 'viewer-index'],
  ] as const;
  const hashes = await Promise.all(hashKeys.map(async ([family, key]) => {
    try { return { family, key, value: await redisClient.hGetAll(key) }; }
    catch (error) { errors.push(family + ' read failed: ' + String(error)); return { family, key, value: {} }; }
  }));
  const analyticsPostIndex: Array<{ postType: string; postId: string }> = [];
  const analyticsViewerHashes: string[] = [];
  for (const item of hashes) {
    addHash(item.family, item.key, item.value);
    if (item.family === 'Impression post index') {
      for (const raw of Object.values(item.value ?? {})) {
        try {
          const parsed = JSON.parse(String(raw)) as { postType?: unknown; postId?: unknown };
          const postType = String(parsed.postType ?? '');
          const postId = String(parsed.postId ?? '').trim();
          if (['main-game', 'orb-share', 'frenzy'].includes(postType) && postId) analyticsPostIndex.push({ postType, postId });
        } catch { /* malformed index values are counted in the hash payload */ }
      }
    }
    if (item.family === 'Impression viewer index') {
      analyticsViewerHashes.push(...Object.keys(item.value ?? {}).filter(hash => /^[a-f0-9]{64}$/.test(hash)));
    }
  }
  analyticsPostIndexFields = analyticsPostIndex.length;
  analyticsViewerIndexFields = analyticsViewerHashes.length;

  const analyticsCounterKeys = [
    ANALYTICS_PREFIX + 'post-views', ANALYTICS_PREFIX + 'unique-users', ANALYTICS_PREFIX + 'index-prune-counter',
    ...['main-game', 'orb-share', 'frenzy'].flatMap(type => [
      ANALYTICS_PREFIX + 'type:' + type,
      ANALYTICS_PREFIX + 'unique-type-count:' + type,
      ANALYTICS_PREFIX + 'conversion-count:' + type,
      ...['mobile', 'tablet', 'desktop', 'unknown'].map(device => ANALYTICS_PREFIX + 'type-device:' + type + ':' + device),
    ]),
    ...['mobile', 'tablet', 'desktop', 'unknown'].map(device => ANALYTICS_PREFIX + 'device:' + device),
    ...['orb-share', 'frenzy'].map(type => ANALYTICS_PREFIX + 'source-eligible-count:' + type),
    ANALYTICS_PREFIX + 'conversion-count:main-game-post',
  ];
  const analyticsTimeKeys: string[] = [];
  const hour = Math.floor(now / 3_600_000);
  const day = Math.floor(now / 86_400_000);
  for (let n = 0; n <= 25; n += 1) for (const type of ['main-game', 'orb-share', 'frenzy']) analyticsTimeKeys.push(ANALYTICS_PREFIX + 'hour:' + (hour - n) + ':' + type);
  for (let n = 0; n <= 35; n += 1) {
    for (const type of ['main-game', 'orb-share', 'frenzy']) analyticsTimeKeys.push(ANALYTICS_PREFIX + 'day:' + (day - n) + ':' + type);
    analyticsTimeKeys.push(ANALYTICS_PREFIX + 'unique-today:' + (day - n));
  }
  for (const post of analyticsPostIndex) analyticsCounterKeys.push(ANALYTICS_PREFIX + 'post:' + post.postType + ':' + encodeURIComponent(post.postId));
  const analyticsValues = await safeMGet([...analyticsCounterKeys, ...analyticsTimeKeys]);
  for (let i = 0; i < analyticsValues.length; i += 1) {
    const key = [...analyticsCounterKeys, ...analyticsTimeKeys][i];
    add('Impression analytics counters', key, analyticsValues[i]);
  }

  try {
    const viewerKeys = analyticsViewerHashes.map(hash => ANALYTICS_PREFIX + 'viewer:' + hash);
    const viewerValues = await safeMGet(viewerKeys);
    for (let i = 0; i < viewerKeys.length; i += 1) add('Impression viewer records', viewerKeys[i], viewerValues[i]);
  } catch (error) {
    errors.push('Impression viewer-record audit failed: ' + String(error));
  }

  const diagnosticSharedKeys = [
    'io:save-debug:v1', 'io:payment-debug-log:v1',
    'io:global-booster-debug-log:v1', 'io:global-booster-activation-log:v1',
  ];
  const diagnosticValues = await safeMGet(diagnosticSharedKeys);
  for (let i = 0; i < diagnosticSharedKeys.length; i += 1) add('Diagnostic logs', diagnosticSharedKeys[i], diagnosticValues[i]);

  // Per-player operational and diagnostic keys reachable through the registry.
  const perPlayerKeys = userIds.flatMap(userId => [
    ['Diagnostic logs', 'io:player-spy:v1:' + userId],
    ['Temporary player state', 'io:offline-full-notified:' + userId],
    ['Temporary player state', 'io:offline-full-job:' + userId],
    ['Temporary player state', 'io:player-flair:' + userId],
    ['Temporary player state', 'io:roll-ticket:' + userId],
    ['Follow prompt records', 'io:follow-prompt-subscribed:v2:' + userId],
    ['Follow prompt records', 'io:follow-prompt-reward:v1:' + userId],
  ] as const);
  const perPlayerValues = await safeMGet(perPlayerKeys.map(item => item[1]));
  for (let i = 0; i < perPlayerKeys.length; i += 1) add(perPlayerKeys[i][0], perPlayerKeys[i][1], perPlayerValues[i]);

  const popupKeys = ['notification', 'frenzy', 'joinSubreddit'].flatMap(popup =>
    ['shown', 'accepted', 'dismissed'].map(event => 'io:popup-stats:v1:' + popup + ':' + event));
  const popupValues = await safeMGet(popupKeys);
  for (let i = 0; i < popupKeys.length; i += 1) add('Popup statistics', popupKeys[i], popupValues[i]);

  const orderedGroups = [...groups.values()].sort((a, b) => b.bytes - a.bytes);
  largest.sort((a, b) => b.bytes - a.bytes);
  return {
    generatedAt: new Date().toISOString(),
    installationStorageLimitBytes: 5_000_000_000,
    platformReportedTotalAvailable: false,
    knownIndexedPayloadBytes: orderedGroups.reduce((total, group) => total + group.bytes, 0),
    knownIndexedKeys: orderedGroups.reduce((total, group) => total + group.keys, 0),
    knownRecords: orderedGroups.reduce((total, group) => total + group.records, 0),
    indexedPlayersTotal: allUserIds.length,
    indexedPlayersAudited: userIds.length,
    onlinePlayersCurrentCount: currentOnlinePlayers,
    playerAuditTruncated: truncatedUsers > 0,
    playerManifestCount,
    playerChunkPayloadBytesEstimated,
    playerChunkPayloadBytesRead,
    playerChunkKeysSkipped,
    activeCodexUsersAudited: codexUsersAudited,
    activeCodexShardKeysPresent: codexKeysPresent,
    missingPlayerSaveChunks: missingPlayerChunks,
    missingLargeValueChunks,
    impressionPostIndexFields: analyticsPostIndexFields,
    impressionViewerIndexFields: analyticsViewerIndexFields,
    groups: orderedGroups,
    largestKnownValues: largest.slice(0, MAX_TOP_VALUES),
    limitations: [
      'This is a payload-size estimate from known/indexed keys, not Redis MEMORY USAGE or the platform quota meter.',
      'Devvit does not expose global key scanning; retired player-save generations, old Codex generations, unindexed large-value chunks, and orphaned keys cannot be enumerated.',
      'Only the first ' + MAX_AUDIT_USERS + ' indexed players are inspected per audit to keep the request bounded.',
      'Player-save chunk payload reads are capped at ' + MAX_PLAYER_CHUNK_PAYLOAD_READ_BYTES + ' bytes per audit; skipped chunk payload sizes are estimated from manifests.',
      'Per-post/per-viewer impression marker combinations are not exhaustively enumerated; viewer/post index rows and indexed viewer values are counted.',
      'Redis key metadata, hash-table overhead, allocator overhead, and provider accounting are not included.',
    ],
    errors,
  };
}
