import { redis, context, reddit } from './devvit-mock.js';
import {
  createInitialState,
  type PlayerState,
  type RollResponse,
  type UpgradeId,
  type PrestigeUpgradeId,
  type Orb,
  AUTO_UNLOCK_COST,
  SHARD_SYNTHESIS_COST,
  PRESTIGE_UPGRADES,
  cooldownMs,
  rollsPerActivation,
  luckMultiplier,
  upgradeCost,
  prestigeUpgradeCost,
  calculatePrestigeDust,
  offlineRollCap,
  getOrbInfo,
  createInitialDailyQuests,
  createInitialWeeklyQuests,
  COSMETICS_LIST,
  rollContinuum,
  coinsForRarity,
  OFFLINE_TICK_MS,
  calculateCosmicDust,
  effectiveOfflineTickMs,
  critMultiplier,
  calculateLevelFromXp,
  type MasterySkillId,
  type PremiumBoosterId,
  type AutomationId,
  type PaymentReceipt,
  type GlobalBoosterId,
  type GlobalBoosterSnapshot,

  GLOBAL_BOOSTERS,
  createInitialGlobalBoosters,
  decayGlobalBoosterState,
  activateGlobalBoosterStack,
  globalBoosterCritChanceBonus,

  PREMIUM_BOOSTERS,
  AUTOMATIONS,
  PURCHASE_PACKS,
  grantFreeShards,
  spendShards,
  resetFreeShardBudgetIfNeeded,
  weekKey,
  isPremiumBoosterActive,
  MASTERY_SKILLS,
  masterySkillCost,
  getLevelBenefits,
} from '../shared/game.js';
import {
  contribute,
  recordLeaderboard,
  addGuildTokens,
  applyGuildTax,
  getPlayerGuildPerks,
  addCommunityRolls,
  getCommunityEvent,
} from './social.js';


function currentUserId(): string {
  const userId = String(context.userId ?? '').trim();
  if (!userId) throw new Error('REDDIT_LOGIN_REQUIRED');
  return userId;
}

const key = () => `player:${currentUserId()}`;
const GAME_BANS_KEY = 'io:game-bans';
const ONLINE_PLAYERS_KEY = 'io:online:players';
const CCU_HOURLY_PREFIX = 'io:ccu:hour:';
const CCU_ALL_TIME_KEY = 'io:ccu:all-time';
const SAVE_GENERATION_KEY_PREFIX = 'player-generation:';
const PLAYER_REGISTRY_KEY = 'io:player-registry';
const DEVELOPER_ANNOUNCEMENT_KEY = 'io:developer-announcement';
const GLOBAL_BOOSTER_ANNOUNCEMENT_KEY = 'io:global-booster-announcement';
const PLAYER_FLAIR_KEY_PREFIX = 'io:player-flair:';

const PAYMENT_DEBUG_LOG_KEY = 'io:payment-debug-log:v1';
const PAYMENT_DEBUG_LOG_LIMIT = 200;

export async function appendPaymentDebugLog(stage: string, details: Record<string, unknown> = {}): Promise<void> {
  const entry = {
    at: new Date().toISOString(),
    timestamp: Date.now(),
    stage,
    ...details,
  };

  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const txn = await redis.watch(PAYMENT_DEBUG_LOG_KEY);
      const raw = await redis.get(PAYMENT_DEBUG_LOG_KEY);
      let entries: Array<Record<string, unknown>> = [];

      if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            entries = parsed.filter(
              (item): item is Record<string, unknown> =>
                Boolean(item) && typeof item === 'object' && !Array.isArray(item),
            );
          }
        } catch {
          entries = [];
        }
      }

      entries.push(entry);
      if (entries.length > PAYMENT_DEBUG_LOG_LIMIT) {
        entries = entries.slice(-PAYMENT_DEBUG_LOG_LIMIT);
      }

      await txn.multi();
      await txn.set(PAYMENT_DEBUG_LOG_KEY, JSON.stringify(entries));
      const committed = await txn.exec();
      if (committed !== null) return;
    }
  } catch (error) {
    console.error('[Payments] Could not persist payment debug log:', error);
  }
}

export async function getPaymentDebugLogs(limit = PAYMENT_DEBUG_LOG_LIMIT): Promise<Array<Record<string, unknown>>> {
  const raw = await redis.get(PAYMENT_DEBUG_LOG_KEY);
  if (typeof raw !== 'string' || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
    return entries.slice(-Math.max(1, Math.min(PAYMENT_DEBUG_LOG_LIMIT, Math.floor(limit))));
  } catch {
    return [];
  }
}

export async function clearPaymentDebugLogs(): Promise<void> {
  await redis.set(PAYMENT_DEBUG_LOG_KEY, JSON.stringify([]));
}

const GLOBAL_BOOSTERS_KEY = 'io:global-boosters:v4';
const GLOBAL_BOOSTER_DEBUG_LOG_KEY = 'io:global-booster-debug-log:v1';
const GLOBAL_BOOSTER_DEBUG_LOG_LIMIT = 300;

function summarizeGlobalBoosterRaw(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  return raw.length > 12000 ? raw.slice(0, 12000) + '…[truncated]' : raw;
}

export async function appendGlobalBoosterDebugLog(
  stage: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const entry = {
    at: new Date().toISOString(),
    timestamp: Date.now(),
    stage,
    ...details,
  };

  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const txn = await redis.watch(GLOBAL_BOOSTER_DEBUG_LOG_KEY);
      const raw = await redis.get(GLOBAL_BOOSTER_DEBUG_LOG_KEY);
      let entries: Array<Record<string, unknown>> = [];

      if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            entries = parsed.filter(
              (item): item is Record<string, unknown> =>
                Boolean(item) && typeof item === 'object' && !Array.isArray(item),
            );
          }
        } catch {
          entries = [];
        }
      }

      entries.push(entry);
      if (entries.length > GLOBAL_BOOSTER_DEBUG_LOG_LIMIT) {
        entries = entries.slice(-GLOBAL_BOOSTER_DEBUG_LOG_LIMIT);
      }

      await txn.multi();
      await txn.set(GLOBAL_BOOSTER_DEBUG_LOG_KEY, JSON.stringify(entries));
      const committed = await txn.exec();
      if (committed !== null) return;
    }
  } catch (error) {
    console.error('[Global Boosters] Could not persist debug log:', error);
  }
}

export async function getGlobalBoosterDebugLogs(
  limit = GLOBAL_BOOSTER_DEBUG_LOG_LIMIT,
): Promise<Array<Record<string, unknown>>> {
  const raw = await redis.get(GLOBAL_BOOSTER_DEBUG_LOG_KEY);
  if (typeof raw !== 'string' || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
    return entries.slice(-Math.max(
      1,
      Math.min(GLOBAL_BOOSTER_DEBUG_LOG_LIMIT, Math.floor(limit)),
    ));
  } catch {
    return [];
  }
}

export async function clearGlobalBoosterDebugLogs(): Promise<void> {
  await redis.set(GLOBAL_BOOSTER_DEBUG_LOG_KEY, JSON.stringify([]));
}
export interface DeveloperAnnouncement {
  message: string;
  updatedAt: number;
  updatedBy: string;
}
export const DEFAULT_DEVELOPER_ANNOUNCEMENT = 'Welcome to Infinity Orbs! New developer announcements will appear here.';

export async function getDeveloperAnnouncement(): Promise<DeveloperAnnouncement> {
  const raw = await redis.get(DEVELOPER_ANNOUNCEMENT_KEY);
  if (!raw) {
    return { message: DEFAULT_DEVELOPER_ANNOUNCEMENT, updatedAt: 0, updatedBy: '' };
  }

  const parsed = parseStoredJson<Partial<DeveloperAnnouncement>>(raw);
  if (!parsed) {
    return { message: DEFAULT_DEVELOPER_ANNOUNCEMENT, updatedAt: 0, updatedBy: '' };
  }

  return {
    message: String(parsed.message ?? DEFAULT_DEVELOPER_ANNOUNCEMENT).slice(0, 1200),
    updatedAt: Number(parsed.updatedAt ?? 0) || 0,
    updatedBy: String(parsed.updatedBy ?? '').slice(0, 100),
  };
}

export async function setDeveloperAnnouncement(message: string, updatedBy: string): Promise<DeveloperAnnouncement> {
  const next: DeveloperAnnouncement = {
    message: String(message ?? '').trim().slice(0, 1200),
    updatedAt: Date.now(),
    updatedBy: String(updatedBy ?? context.username ?? 'Developer').slice(0, 100),
  };
  await redis.set(DEVELOPER_ANNOUNCEMENT_KEY, JSON.stringify(next));
  return next;
}


function saveGenerationKeyFor(userId: string): string {
  return SAVE_GENERATION_KEY_PREFIX + userId;
}

export interface GameBanRecord {
  userId: string;
  username: string;
  bannedAt: number;
  bannedUntil: number | null;
  reason: string;
  bannedBy: string;
}

export interface GameBanStatus extends GameBanRecord {
  active: true;
}

function parseStoredJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function ensureRedisStringKey(keyName: string, fallback: string): Promise<void> {
  const existing = await redis.get(keyName);
  if (existing == null) {
    await redis.set(keyName, fallback);
  }
}

async function readGameBans(): Promise<Record<string, GameBanRecord>> {
  const raw = await redis.get(GAME_BANS_KEY);
  if (!raw) return {};
  try {
    return parseStoredJson<Record<string, GameBanRecord>>(raw) ?? {};
  } catch {
    return {};
  }
}

async function writeGameBans(bans: Record<string, GameBanRecord>): Promise<void> {
  await redis.set(GAME_BANS_KEY, JSON.stringify(bans));
}

export async function getGameBanStatus(userId = context.userId ?? ''): Promise<GameBanStatus | null> {
  if (!userId) return null;
  const bans = await readGameBans();
  const ban = bans[userId];
  if (!ban) return null;
  if (ban.bannedUntil !== null && ban.bannedUntil <= Date.now()) {
    delete bans[userId];
    await writeGameBans(bans);
    return null;
  }
  return { ...ban, active: true };
}

export async function listGameBans(): Promise<GameBanRecord[]> {
  const bans = await readGameBans();
  const now = Date.now();
  let changed = false;
  const active: GameBanRecord[] = [];

  for (const [userId, ban] of Object.entries(bans)) {
    if (ban.bannedUntil !== null && ban.bannedUntil <= now) {
      delete bans[userId];
      changed = true;
      continue;
    }
    active.push(ban);
  }

  if (changed) await writeGameBans(bans);
  return active.sort((a, b) => b.bannedAt - a.bannedAt);
}

export async function banGameUser(options: {
  userId: string;
  username: string;
  durationDays?: number;
  reason?: string;
  bannedBy?: string;
}): Promise<GameBanStatus> {
  const durationDays =
    options.durationDays == null
      ? null
      : Math.max(1, Math.floor(Number(options.durationDays)));
  const ban: GameBanRecord = {
    userId: options.userId,
    username: options.username,
    bannedAt: Date.now(),
    bannedUntil: durationDays === null ? null : Date.now() + durationDays * 86_400_000,
    reason: String(options.reason ?? 'Game moderation action').slice(0, 300),
    bannedBy: String(options.bannedBy ?? context.username ?? 'Admin').slice(0, 100),
  };
  const bans = await readGameBans();
  bans[options.userId] = ban;
  await writeGameBans(bans);
  return { ...ban, active: true };
}

export async function unbanGameUser(userId: string): Promise<boolean> {
  const bans = await readGameBans();
  if (!bans[userId]) return false;
  delete bans[userId];
  await writeGameBans(bans);
  return true;
}
const ONLINE_WINDOW_MS = 30_000;

async function recordCcuPeak(ccu: number, now: number): Promise<void> {
  const hour = Math.floor(now / 3_600_000);
  const hourKey = CCU_HOURLY_PREFIX + String(hour);
  const allTime = Math.max(0, Number.parseInt(String(await redis.get(CCU_ALL_TIME_KEY) ?? '0'), 10) || 0);
  const hourly = Math.max(0, Number.parseInt(String(await redis.get(hourKey) ?? '0'), 10) || 0);

  if (ccu > hourly) await redis.set(hourKey, String(ccu));
  if (ccu > allTime) await redis.set(CCU_ALL_TIME_KEY, String(ccu));
}

async function touchOnlinePresence(): Promise<number> {
  const userId = context.userId;
  if (!userId) return 1;
  const now = Date.now();
  await redis.zAdd(ONLINE_PLAYERS_KEY, { member: userId, score: now });
  await redis.zRemRangeByScore(ONLINE_PLAYERS_KEY, 0, now - ONLINE_WINDOW_MS);
  const ccu = Math.max(1, await redis.zCard(ONLINE_PLAYERS_KEY));
  void recordCcuPeak(ccu, now).catch(error => {
    console.error('Failed to record CCU peak:', error);
  });
  return ccu;
}

export async function getOnlinePlayers(): Promise<number> {
  return touchOnlinePresence();
}

export async function getCcuPeaks(): Promise<{
  current: number;
  last24Hours: number;
  last7Days: number;
  last30Days: number;
  allTime: number;
}> {
  const now = Date.now();
  const current = await touchOnlinePresence();
  const currentHour = Math.floor(now / 3_600_000);
  const hourlyKeys = Array.from({ length: 720 }, (_, index) => CCU_HOURLY_PREFIX + String(currentHour - index));
  const values = await Promise.all(hourlyKeys.map(async key => {
    const raw = await redis.get(key);
    return Math.max(0, Number.parseInt(String(raw ?? '0'), 10) || 0);
  }));

  const maxIn = (hours: number) => Math.max(current, ...values.slice(0, hours), 0);
  const allTimeRaw = await redis.get(CCU_ALL_TIME_KEY);
  return {
    current,
    last24Hours: maxIn(24),
    last7Days: maxIn(24 * 7),
    last30Days: maxIn(24 * 30),
    allTime: Math.max(0, Number.parseInt(String(allTimeRaw ?? '0'), 10) || 0, current),
  };
}

const FRENZY_POST_PREFIX = 'io:frenzy:post:';

function parseGlobalBoosterSnapshot(
  raw: unknown,
  now: number,
): GlobalBoosterSnapshot | null {
  if (raw == null) return null;

  let parsed: unknown = raw;
  for (let depth = 0; depth < 12; depth++) {
    if (typeof parsed === 'string') {
      const text = parsed.trim();
      if (!text) return null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return null;
      }
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;

    if (
      record.luck && typeof record.luck === 'object' &&
      record.speed && typeof record.speed === 'object' &&
      record.crit && typeof record.crit === 'object'
    ) {
      return {
        luck: decayGlobalBoosterState(record.luck as GlobalBoosterSnapshot['luck'], now),
        speed: decayGlobalBoosterState(record.speed as GlobalBoosterSnapshot['speed'], now),
        crit: decayGlobalBoosterState(record.crit as GlobalBoosterSnapshot['crit'], now),
      };
    }

    let nested = false;
    for (const wrapperKey of ['value', 'state', 'data', 'payload', 'result']) {
      if (!(wrapperKey in record)) continue;
      parsed = record[wrapperKey];
      nested = true;
      break;
    }
    if (!nested) return null;
  }

  return null;
}

export async function getGlobalBoosters(): Promise<GlobalBoosterSnapshot> {
  const now = Date.now();
  const raw = await redis.get(GLOBAL_BOOSTERS_KEY);
  const snapshot = parseGlobalBoosterSnapshot(raw, now);

  if (!snapshot) {
    await appendGlobalBoosterDebugLog('read:missing-or-invalid', {
      key: GLOBAL_BOOSTERS_KEY,
      rawType: typeof raw,
      rawIsNull: raw == null,
      rawValue: summarizeGlobalBoosterRaw(raw),
    });
    return createInitialGlobalBoosters(now);
  }

  snapshot.speed.tier = Math.min(10, Math.max(0, Math.floor(Number(snapshot.speed.tier) || 0)));
  if (snapshot.speed.tier >= 10) snapshot.speed.activationProgress = 0;
  return snapshot;
}

async function updateGlobalBooster(id: GlobalBoosterId): Promise<GlobalBoosterSnapshot> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const now = Date.now();
    const txn = await redis.watch(GLOBAL_BOOSTERS_KEY);
    const raw = await redis.get(GLOBAL_BOOSTERS_KEY);

    await appendGlobalBoosterDebugLog('activate:redis-read', {
      id,
      attempt,
      key: GLOBAL_BOOSTERS_KEY,
      rawType: typeof raw,
      rawIsNull: raw == null,
      rawValue: summarizeGlobalBoosterRaw(raw),
    });

    const current = parseGlobalBoosterSnapshot(raw, now) ?? createInitialGlobalBoosters(now);
    const before = current[id];
    const after = activateGlobalBoosterStack(before, now, id === 'speed' ? 10 : Number.MAX_SAFE_INTEGER);
    current[id] = after;

    await appendGlobalBoosterDebugLog('activate:state-computed', {
      id,
      attempt,
      before,
      after,
    });

    await txn.multi();
    await txn.set(GLOBAL_BOOSTERS_KEY, JSON.stringify(current));
    const committed = await txn.exec();

    if (committed !== null) {
      const verifiedRaw = await redis.get(GLOBAL_BOOSTERS_KEY);
      const verified = parseGlobalBoosterSnapshot(verifiedRaw, Date.now()) ?? current;
      await appendGlobalBoosterDebugLog('activate:global-write-success', {
        id,
        attempt,
        committed: true,
        verifiedRawType: typeof verifiedRaw,
        verifiedRaw: summarizeGlobalBoosterRaw(verifiedRaw),
        verifiedSnapshot: verified,
      });
      return verified;
    }

    await appendGlobalBoosterDebugLog('activate:global-write-conflict', { id, attempt });
  }

  await appendGlobalBoosterDebugLog('activate:global-write-exhausted', { id });
  throw new Error('The Global Booster was activated by another player. Please try again.');
}

export async function setGlobalBoosterDebugState(
  id: GlobalBoosterId,
  tier: number,
  minutes: number,
): Promise<{ tier: number; activationProgress: number; endsAt: number }> {
  if (!GLOBAL_BOOSTERS[id]) throw new Error('Unknown Global Booster.');

  const now = Date.now();
  const safeTier = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(tier) || 0)));
  const safeMinutes = Math.max(1, Math.floor(Number(minutes) || 30));
  const snapshot = await getGlobalBoosters();
  const previous = snapshot[id];
  const cappedTier = id === 'speed' ? Math.min(10, safeTier) : safeTier;
  const next = {
    tier: cappedTier,
    activationProgress: 0,
    endsAt: cappedTier === 0 ? 0 : now + safeMinutes * 60_000,
  };
  snapshot[id] = next;
  await redis.set(GLOBAL_BOOSTERS_KEY, JSON.stringify(snapshot));

  await appendGlobalBoosterDebugLog('admin:set', {
    id,
    previous,
    next,
    minutes: safeMinutes,
    key: GLOBAL_BOOSTERS_KEY,
  });

  return next;
}

function playerKeyFor(userId: string): string {
  return `player:${userId}`;
}

interface PlayerRegistryEntry {
  username: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

async function registerPlayer(userId: string, username: string): Promise<void> {
  const now = Date.now();
  let firstSeenAt = now;
  const existingRaw = await redis.hGet(PLAYER_REGISTRY_KEY, userId);
  if (existingRaw) {
    const existing = parseStoredJson<Partial<PlayerRegistryEntry>>(existingRaw);
    firstSeenAt = Math.max(0, Number(existing?.firstSeenAt ?? now) || now);
  }
  await redis.hSet(PLAYER_REGISTRY_KEY, {
    [userId]: JSON.stringify({
      username: String(username).trim().slice(0, 100),
      firstSeenAt,
      lastSeenAt: now,
    } satisfies PlayerRegistryEntry),
  });
}

export interface PlayerListEntry {
  userId: string;
  username: string;
  firstSeenAt: number;
  lastSeenAt: number;
  active: boolean;
  level: number;
  xp: number;
  totalRolls: number;
  highestRarity: number;
  coins: number;
  shards: number;
}

export async function listPlayers(): Promise<PlayerListEntry[]> {
  const rawRegistry = await redis.hGetAll(PLAYER_REGISTRY_KEY);
  const records = rawRegistry && typeof rawRegistry === 'object' ? rawRegistry as Record<string, string> : {};
  const userIds = Object.keys(records);
  if (userIds.length === 0) return [];

  const now = Date.now();
  const saves = await redis.mGet(userIds.map(id => playerKeyFor(id)));
  const players = userIds.map((userId, index) => {
    const registry = parseStoredJson<Partial<PlayerRegistryEntry>>(records[userId]) ?? {};
    const save = saves[index] ? parseStoredJson<Partial<PlayerState>>(saves[index]) : null;
    const lastSeenAt = Math.max(
      Number(registry.lastSeenAt ?? 0) || 0,
      Number(save?.lastSeenAt ?? 0) || 0,
    );
    return {
      userId,
      username: String(registry.username ?? save?.username ?? ('user-' + userId.slice(-8))).trim().slice(0, 100),
      firstSeenAt: Math.max(0, Number(registry.firstSeenAt ?? 0) || 0),
      lastSeenAt,
      active: lastSeenAt >= now - 30_000,
      level: Math.max(1, Number(save?.level ?? 1) || 1),
      xp: Math.max(0, Number(save?.xp ?? 0) || 0),
      totalRolls: Math.max(0, Number(save?.totalRolls ?? 0) || 0),
      highestRarity: Math.max(0, Number(save?.highestRarity ?? 0) || 0),
      coins: Math.max(0, Number(save?.coins ?? 0) || 0),
      shards: Math.max(0, Number(save?.shards ?? 0) || 0),
    } satisfies PlayerListEntry;
  });
  players.sort((a, b) => Number(b.active) - Number(a.active) || b.lastSeenAt - a.lastSeenAt || a.username.localeCompare(b.username));
  return players;
}

function paymentGoodsForSku(sku: string) {
  const pack = PURCHASE_PACKS.find(p => p.sku === sku);
  if (!pack) throw new Error('Unknown purchase product.');
  return pack;
}

function parsePlayerStateValue(value: unknown, depth = 0): PlayerState | null {
  if (depth > 6 || value == null) return null;

  if (typeof value === 'string') {
    const parsed = parseStoredJson<unknown>(value);
    if (parsed === null) return null;
    return parsePlayerStateValue(parsed, depth + 1);
  }

  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  // A real PlayerState has these required top-level fields. Do not mistake a
  // Redis/proxy wrapper such as { value: '...' } for the save itself.
  if ('coins' in record && 'shards' in record && 'totalRolls' in record) {
    return record as unknown as PlayerState;
  }

  for (const key of ['value', 'state', 'player', 'data', 'payload', 'result']) {
    if (!(key in record)) continue;
    const nested = parsePlayerStateValue(record[key], depth + 1);
    if (nested) return nested;
  }

  return null;
}

function parsePaymentPlayerState(raw: unknown): PlayerState {
  // Payment fulfillment must tolerate the same Redis representations that the
  // normal loader can encounter, including nested wrappers and double-encoded
  // JSON strings from older saves or migration layers.
  let parsed: unknown = raw;

  for (let depth = 0; depth < 12; depth++) {
    if (typeof parsed === 'string') {
      const decoded = parseStoredJson<unknown>(parsed);
      if (decoded === null) break;
      parsed = decoded;
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) break;

    const record = parsed as Record<string, unknown>;
    const looksLikePlayerState =
      'coins' in record ||
      'shards' in record ||
      'totalRolls' in record ||
      'username' in record ||
      'saveGeneration' in record ||
      'upgrades' in record ||
      'collection' in record ||
      'paymentReceipts' in record;

    if (looksLikePlayerState) {
      const base = createInitialState();
      const upgrades = record.upgrades && typeof record.upgrades === 'object' && !Array.isArray(record.upgrades)
        ? record.upgrades as Record<string, unknown>
        : {};
      const prestigeUpgrades = record.prestigeUpgrades && typeof record.prestigeUpgrades === 'object' && !Array.isArray(record.prestigeUpgrades)
        ? record.prestigeUpgrades as Record<string, unknown>
        : {};

      return {
        ...base,
        ...record,
        upgrades: { ...base.upgrades, ...upgrades },
        prestigeUpgrades: { ...base.prestigeUpgrades, ...prestigeUpgrades },
        collection: (record.collection && typeof record.collection === 'object' && !Array.isArray(record.collection))
          ? record.collection as Record<string, number>
          : base.collection,
        claimedAchievements: Array.isArray(record.claimedAchievements)
          ? record.claimedAchievements as string[]
          : base.claimedAchievements,
        unlockedCosmetics: Array.isArray(record.unlockedCosmetics)
          ? record.unlockedCosmetics as string[]
          : base.unlockedCosmetics,
        dailyQuests: Array.isArray(record.dailyQuests)
          ? record.dailyQuests as PlayerState['dailyQuests']
          : base.dailyQuests,
        weeklyQuests: Array.isArray(record.weeklyQuests)
          ? record.weeklyQuests as PlayerState['weeklyQuests']
          : base.weeklyQuests,
        paymentReceipts: record.paymentReceipts && typeof record.paymentReceipts === 'object' && !Array.isArray(record.paymentReceipts)
          ? record.paymentReceipts as PlayerState['paymentReceipts']
          : {},
      };
    }

    let nestedFound = false;
    for (const key of ['value', 'state', 'player', 'data', 'payload', 'result']) {
      if (!(key in record)) continue;
      parsed = record[key];
      nestedFound = true;
      break;
    }
    if (!nestedFound) break;
  }

  throw new Error('Saved player data could not be read; the purchase was not applied.');
}

export async function hasReadablePlayerSave(userId: string): Promise<boolean> {
  const id = String(userId ?? '').trim();
  if (!id) return false;
  try {
    return parsePaymentPlayerState(await redis.get(playerKeyFor(id))) !== null;
  } catch {
    return false;
  }
}

export async function grantPurchasedPack(userId: string, sku: string, orderId: string): Promise<boolean> {
  const pack = paymentGoodsForSku(sku);
  const pkey = playerKeyFor(userId);
  const generationKey = saveGenerationKeyFor(userId);
  await appendPaymentDebugLog('grant:start', {
    userId,
    sku,
    orderId,
    playerKey: pkey,
    generationKey,
    packShards: pack.shards,
  });
  await ensureRedisStringKey(generationKey, '0');

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(pkey, generationKey);
    const generationRaw = await redis.get(generationKey);
    const generation = Math.max(0, Number.parseInt(String(generationRaw ?? '0'), 10) || 0);
    const raw = await redis.get(pkey);
    await appendPaymentDebugLog('grant:redis-read', {
      userId,
      sku,
      orderId,
      attempt,
      rawType: typeof raw,
      rawIsNull: raw == null,
      rawLength: typeof raw === 'string' ? raw.length : null,
      rawPreview: typeof raw === 'string' ? raw.slice(0, 2000) : raw,
      generation,
      generationRaw,
    });

    let state: PlayerState;
    if (raw == null) {
      state = createInitialState();
      state.username = 'reddit-user-' + userId.slice(-8);
      state.saveGeneration = generation;
    } else {
      let stored: PlayerState;
      try {
        stored = parsePaymentPlayerState(raw);
        await appendPaymentDebugLog('grant:parsed-save', {
          userId,
          sku,
          orderId,
          attempt,
          storedCoins: stored.coins,
          storedShards: stored.shards,
          storedTotalRolls: stored.totalRolls,
          storedSaveGeneration: stored.saveGeneration ?? null,
          hasPaymentReceipts: Boolean(stored.paymentReceipts),
          paymentReceiptCount: stored.paymentReceipts ? Object.keys(stored.paymentReceipts).length : 0,
        });
      } catch (error) {
        await appendPaymentDebugLog('grant:parse-failed', {
          userId,
          sku,
          orderId,
          attempt,
          playerKey: pkey,
          rawType: typeof raw,
          rawIsNull: raw == null,
          rawLength: typeof raw === 'string' ? raw.length : null,
          rawPreview: typeof raw === 'string' ? raw.slice(0, 12000) : raw,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      const storedGeneration = Math.max(0, Math.floor(Number(stored.saveGeneration ?? 0)));

      // A generation mismatch means an admin wipe happened after this save was
      // created. Never resurrect that old save just because a payment arrived.
      // Start from the current generation and then apply the paid entitlement.
      if (storedGeneration !== generation) {
        state = createInitialState();
        state.username = stored.username ?? ('reddit-user-' + userId.slice(-8));
        state.saveGeneration = generation;
      } else {
        state = stored;
        state.saveGeneration = generation;
        state.username = state.username ?? ('reddit-user-' + userId.slice(-8));
      }
    }

    await appendPaymentDebugLog('grant:state-selected', {
      userId,
      sku,
      orderId,
      attempt,
      stateSaveGeneration: state.saveGeneration ?? null,
      stateCoins: state.coins,
      stateShards: state.shards,
    });

    state.paymentReceipts = state.paymentReceipts ?? {};
    const existingReceipt = state.paymentReceipts[orderId];
    if (
      existingReceipt === 'fulfilled' ||
      (existingReceipt && typeof existingReceipt === 'object' && existingReceipt.status === 'fulfilled')
    ) {
      await appendPaymentDebugLog('grant:already-fulfilled', { userId, sku, orderId, attempt });
      await txn.unwatch();
      return false;
    }
    if (
      existingReceipt === 'refunded' ||
      (existingReceipt && typeof existingReceipt === 'object' && existingReceipt.status === 'refunded')
    ) {
      await appendPaymentDebugLog('grant:already-refunded', { userId, sku, orderId, attempt });
      await txn.unwatch();
      return false;
    }

    state.shards = (state.shards ?? 0) + pack.shards;
    state.purchasedShards = (state.purchasedShards ?? 0) + pack.shards;
    state.lifetimeShards = (state.lifetimeShards ?? 0) + pack.shards;
    state.globalBoosterCredits = (state.globalBoosterCredits ?? 0) + pack.globalBoosterCredits;
    const receipt: PaymentReceipt = {
      status: 'fulfilled',
      shards: pack.shards,
      globalBoosterCredits: pack.globalBoosterCredits,
    };
    state.paymentReceipts[orderId] = receipt;

    await appendPaymentDebugLog('grant:about-to-write', {
      userId,
      sku,
      orderId,
      attempt,
      nextShards: state.shards,
      purchasedShards: state.purchasedShards,
      lifetimeShards: state.lifetimeShards,
    });

    await txn.multi();
    await txn.set(pkey, JSON.stringify(state));
    const committed = await txn.exec();
    if (committed !== null) {
      await appendPaymentDebugLog('grant:success', {
        userId,
        sku,
        orderId,
        attempt,
        committed: true,
      });
      return true;
    }

    await appendPaymentDebugLog('grant:write-conflict', {
      userId,
      sku,
      orderId,
      attempt,
    });
  }

  await appendPaymentDebugLog('grant:exhausted', { userId, sku, orderId });
  throw new Error('Could not safely fulfill the purchase. Please retry.');
}

export async function refundPurchasedPack(userId: string, sku: string, orderId: string): Promise<void> {
  const pack = paymentGoodsForSku(sku);
  const pkey = playerKeyFor(userId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const txn = await redis.watch(pkey);
    const raw = await redis.get(pkey);
    if (raw == null) {
      await txn.unwatch();
      return;
    }
    const state = parsePaymentPlayerState(raw);
    state.paymentReceipts = state.paymentReceipts ?? {};
    const receipt = state.paymentReceipts[orderId];
    if (!receipt) {
      await txn.unwatch();
      return;
    }
    const isFulfilled =
      receipt === 'fulfilled' ||
      (typeof receipt === 'object' && receipt.status === 'fulfilled');
    if (!isFulfilled) {
      await txn.unwatch();
      return;
    }

    // New receipts store the exact entitlement granted by this order. Old
    // status-only receipts migrate using the verified SKU payload.
    const grantedShards = typeof receipt === 'string' ? pack.shards : receipt.shards;    const refundableShards = Math.min(state.purchasedShards ?? 0, grantedShards);
    state.shards = Math.max(0, (state.shards ?? 0) - refundableShards);
    state.purchasedShards = Math.max(0, (state.purchasedShards ?? 0) - refundableShards);

    const grantedCredits = typeof receipt === 'string'
      ? pack.globalBoosterCredits
      : Math.max(0, Number(receipt.globalBoosterCredits ?? 0) || 0);
    const refundableCredits = Math.min(state.globalBoosterCredits ?? 0, grantedCredits);
    state.globalBoosterCredits = Math.max(0, (state.globalBoosterCredits ?? 0) - refundableCredits);

    state.paymentReceipts[orderId] = {
      status: 'refunded',
      shards: grantedShards,
      globalBoosterCredits: grantedCredits,
    };
    await txn.multi();
    await txn.set(pkey, JSON.stringify(state));
    const committed = await txn.exec();
    if (committed !== null) return;
  }
  throw new Error('Could not safely process the refund.');
}

export async function loadRaw(): Promise<PlayerState> {
  const userId = currentUserId();
  const playerKey = key();
  const generationKey = saveGenerationKeyFor(userId);
  const generationRaw = await redis.get(generationKey);
  const generation = Math.max(0, Number.parseInt(String(generationRaw ?? '0'), 10) || 0);
  const raw = await redis.get(playerKey);
  const username = context.username ?? `reddit-user-${userId.slice(-8)}`;
  await registerPlayer(userId, username);
  const perks = await getPlayerGuildPerks(username, userId);
  const globalBoosters = await getGlobalBoosters();


  if (!raw) {
    const s = createInitialState();
    s.username = username;
    s.saveGeneration = generation;
    s.guildPerks = perks;
    s.globalBoosters = globalBoosters;

    return s;
  }

  const parsed = parsePlayerStateValue(raw);
  if (!parsed) {
    throw new Error('Your Infinity Orbs save data could not be read. The stored save is not valid player data.');
  }

  // A wipe increments the generation before deleting the save. Any old request
  // that races the wipe can still write bytes, but those bytes are now invalid
  // and are discarded instead of resurrecting the old account.
  if ((parsed.saveGeneration ?? 0) !== generation) {
    const fresh = createInitialState();
    fresh.username = username;
    fresh.saveGeneration = generation;
    fresh.guildPerks = perks;

    return fresh;
  }

  const base = createInitialState();
  const cleanParsed = { ...(parsed as PlayerState & Record<string, unknown>) };
  const normalizedManualRolls = Math.max(
    0,
    Math.min(
      10,
      Number(
        parsed.manualRolls ??
        Math.min(Number(parsed.totalRolls ?? 0), 10),
      ) || 0,
    ),
  );
  const normalizedUpgrades = {
    ...base.upgrades,
    ...(parsed.upgrades ?? {}),
    // Auto Roll is free and unlocks automatically at 10 manual roll activations.
    auto: normalizedManualRolls >= 10 ? 1 : 0,
  };
  return {
    ...base,
    ...cleanParsed,
    upgrades: normalizedUpgrades,
    manualRolls: normalizedManualRolls,
    saveGeneration: generation,
    username,
    prestigeUpgrades: { ...base.prestigeUpgrades, ...(parsed.prestigeUpgrades ?? {}) },
    collection: parsed.collection ?? {},
    claimedAchievements: parsed.claimedAchievements ?? [],
    streak: { ...base.streak, ...(parsed.streak ?? {}) },
    dailyQuests: parsed.dailyQuests?.length ? parsed.dailyQuests : base.dailyQuests,
    weeklyQuests: parsed.weeklyQuests?.length ? parsed.weeklyQuests : base.weeklyQuests,
    unlockedCosmetics: parsed.unlockedCosmetics?.length ? parsed.unlockedCosmetics : base.unlockedCosmetics,
    sacrifices: {
      coinsSacrificed: parsed.sacrifices?.coinsSacrificed ?? base.sacrifices!.coinsSacrificed,
      shardsSacrificed: parsed.sacrifices?.shardsSacrificed ?? base.sacrifices!.shardsSacrificed,
      altarLevel: parsed.sacrifices?.altarLevel ?? base.sacrifices!.altarLevel,
      luckSurgeUntil: parsed.sacrifices?.luckSurgeUntil ?? base.sacrifices!.luckSurgeUntil,
    },
    masterySkills: { ...base.masterySkills!, ...(parsed.masterySkills ?? {}) } as Record<MasterySkillId, number>,
    masteryPoints: parsed.masteryPoints ?? base.masteryPoints ?? 1,
    guildPerks: perks,
    globalBoosters,
  };
}

function applyXp(s: PlayerState, amount: number): void {
  const oldLevel = Math.max(1, s.level || 1);
  s.xp += Math.max(0, Math.floor(amount));
  const earnedLevel = calculateLevelFromXp(s.xp).level;

  // A large XP reward can fill several future levels, but the player's actual
  // level advances at most once per state update. This keeps milestones arriving
  // in a deliberate sequence instead of dumping the entire progression at once.
  const newLevel = Math.min(oldLevel + 1, earnedLevel);
  s.level = Math.max(oldLevel, newLevel);
  if (s.level > oldLevel) {
    s.masteryPoints = (s.masteryPoints ?? 0) + 1;
  }
}

function applyQuestReward(s: PlayerState, quest: { rewardCoins: number; rewardShards?: number; rewardTokens?: number; rewardXp?: number; claimed: boolean }): { rewardCoins: number; rewardShards: number; rewardTokens: number } {
  quest.claimed = true;
  s.questsCompleted = (s.questsCompleted ?? 0) + 1;
  s.coins += quest.rewardCoins;
  const rewardShards = grantFreeShards(s, quest.rewardShards ?? 0);
  applyXp(s, quest.rewardXp ?? 0);
  return {
    rewardCoins: quest.rewardCoins,
    rewardShards,
    rewardTokens: quest.rewardTokens ?? 0,
  };
}

async function claimDailyStreakFromState(s: PlayerState): Promise<{ rewardCoins: number; rewardShards: number; day: number }> {
  const today = new Date().toISOString().slice(0, 10);
  if (s.streak.lastClaimDate === today) throw new Error('Already claimed daily reward for today.');

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s.streak.lastClaimDate === yesterday) s.streak.count++;
  else if (!s.streak.lastClaimDate) s.streak.count = 1;
  else s.streak.count = 1;

  s.streak.longestStreak = Math.max(s.streak.longestStreak, s.streak.count);
  s.streak.lastClaimDate = today;

  const day = ((s.streak.count - 1) % 7) + 1;
  const rewardCoins = day * 100;
  const rewardShards = grantFreeShards(s, day === 7 ? 5 : day === 3 ? 1 : 0);
  s.coins += rewardCoins;
  return { rewardCoins, rewardShards, day };
}

async function claimCommunityRewardFromState(s: PlayerState): Promise<{ rewardCoins: number; rewardXp: number; nextClaimAt: number; tier: number }> {
  const event = await getCommunityEvent();
  const tier = Math.max(1, event.tier || 1);
  const claimedTier = s.communityRewardClaimedTier ?? 0;
  if (tier <= claimedTier) {
    return { rewardCoins: 0, rewardXp: 0, nextClaimAt: 0, tier };
  }

  const rewardCoins = Math.round(1_000 * tier + 250 * (s.level || 1));
  const rewardXp = 75 * tier;
  s.communityRewardClaimedTier = tier;
  s.coins += rewardCoins;
  applyXp(s, rewardXp);
  return { rewardCoins, rewardXp, nextClaimAt: 0, tier };
}

async function processAutomation(s: PlayerState): Promise<void> {
  if (s.automations?.autoStreakClaim) {
    const today = new Date().toISOString().slice(0, 10);
    if (s.streak.lastClaimDate !== today) {
      await claimDailyStreakFromState(s);
    }
  }

  if (s.automations?.autoQuestClaim) {
    const quests = [...s.dailyQuests, ...s.weeklyQuests]
      .filter(q => q.unlocked !== false && !q.claimed && q.progress >= q.target)
      .slice(0, 25);
    for (const q of quests) {
      const result = applyQuestReward(s, q);
      if (result.rewardTokens > 0) {
        const username = context.username ?? ('reddit-user-' + currentUserId().slice(-8));
        void addGuildTokens(username, result.rewardTokens);
      }
    }
  }

  if (s.automations?.autoCommunityClaim) {
    await claimCommunityRewardFromState(s);
  }

  if (s.automations?.autoOfflineClaim && s.offlineRolls > 0) {
    const batches = s.offlineRolls;
    s.offlineRolls = 0;
    await applyRolls(s, batches, undefined, 'offline');
    s.lastRollAt = Date.now();
  }

  if (s.automations?.autoUpgrade) {
    autoBuyCheapest(s);
  }
}

async function syncRarityFlair(s: PlayerState): Promise<void> {
  const username = String(context.username ?? s.username ?? '').trim();
  const subredditName = String(context.subredditName ?? '').trim();
  if (!username || !subredditName) return;

  const highestRarity = Math.max(2, Math.floor(Number(s.highestRarity ?? 2) || 2));
  const flairText = getOrbInfo(highestRarity).tier;
  const flairKey = PLAYER_FLAIR_KEY_PREFIX + currentUserId();

  try {
    const current = await redis.get(flairKey);
    if (String(current ?? '') === flairText) return;

    await reddit.setUserFlair({
      subredditName,
      username,
      text: flairText,
    });
    await redis.set(flairKey, flairText);
  } catch (error) {
    console.error('[Rarity Flair] Failed to update user flair:', error);
  }
}

export async function getGlobalBoosterAnnouncement(): Promise<{
  id: GlobalBoosterId;
  name: string;
  username: string;
  activatedAt: number;
} | null> {
  try {
    const raw = await redis.get(GLOBAL_BOOSTER_ANNOUNCEMENT_KEY);
    if (!raw || typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw) as Partial<{
      id: GlobalBoosterId;
      name: string;
      username: string;
      activatedAt: number;
    }>;
    const activatedAt = Number(parsed.activatedAt ?? 0);
    if (!parsed.id || !GLOBAL_BOOSTERS[parsed.id] || !Number.isFinite(activatedAt)) return null;
    if (Date.now() - activatedAt > 10_000) return null;
    return {
      id: parsed.id,
      name: String(parsed.name ?? GLOBAL_BOOSTERS[parsed.id].name),
      username: String(parsed.username ?? 'Redditor'),
      activatedAt,
    };
  } catch {
    return null;
  }
}

export async function save(s: PlayerState) {
  const userId = currentUserId();
  const playerKey = key();
  const generationKey = saveGenerationKeyFor(userId);
  await ensureRedisStringKey(generationKey, '0');

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(playerKey, generationKey);
    const generationRaw = await redis.get(generationKey);
    const generation = Math.max(0, Number.parseInt(String(generationRaw ?? '0'), 10) || 0);
    const stateGeneration = Math.max(0, Math.floor(Number(s.saveGeneration ?? 0)));

    if (stateGeneration !== generation) {
      // This request started before an admin wipe. Discard its stale mutation
      // and adopt the fresh state already written by the wipe. Never let an
      // old request resurrect pre-wipe data, and never strand the player with
      // an avoidable invalidation error.
      const currentRaw = await redis.get(playerKey);
      const current = parseStoredJson<PlayerState>(currentRaw);
      const currentGeneration = current
        ? Math.max(0, Math.floor(Number(current.saveGeneration ?? -1)))
        : -1;
      const fresh = current && currentGeneration === generation
        ? current
        : createInitialState();
      fresh.username = fresh.username ?? context.username ?? undefined;
      fresh.saveGeneration = generation;
      Object.assign(s, fresh);
      await txn.unwatch();
      return;
    }

    s.saveGeneration = generation;
    await txn.multi();
    await txn.set(playerKey, JSON.stringify(s));
    const committed = await txn.exec();
    if (committed !== null) {
      await syncRarityFlair(s);
      return;
    }
  }

  throw new Error('Could not safely save player data. Please retry.');
}

function serverRandom(): number {
  const sample = new Uint32Array(1);
  globalThis.crypto.getRandomValues(sample);
  return sample[0] / 4_294_967_296;
}

function finiteNonNegativeInteger(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function advanceQuestProgress(s: PlayerState, type: 'roll' | 'rare' | 'value' | 'unique' | 'social' | 'share', amount: number) {
  for (const q of s.dailyQuests) {
    if (q.claimed) continue;
    if (type === 'roll' && q.id.includes('rolls')) q.progress = Math.min(q.target, q.progress + amount);
    if (type === 'rare' && q.id.includes('rare') && amount >= 100) q.progress = Math.min(q.target, q.progress + 1);
    if (type === 'unique' && q.id.includes('unique')) q.progress = Math.min(q.target, q.progress + Math.max(0, amount));
    if (type === 'social' && q.id.includes('social')) q.progress = Math.min(q.target, q.progress + 1);
  }
  for (const q of s.weeklyQuests) {
    if (type === 'rare' && amount >= 100) {
      const shareQuest = s.weeklyQuests.find(weekly => weekly.id === 'weekly-share');
      if (shareQuest) shareQuest.unlocked = true;
    }
    if (q.unlocked === false) continue;
    if (q.claimed) continue;
    if (type === 'roll' && q.id.includes('grind')) q.progress = Math.min(q.target, q.progress + amount);
    if (type === 'rare' && q.id.includes('epic') && amount >= 1000) q.progress = Math.min(q.target, q.progress + 1);
    if (type === 'value' && q.id.includes('guild')) q.progress = Math.min(q.target, q.progress + amount);
    // Only a genuine server-created share advances the share quest.
    if (type === 'share' && q.id.includes('share')) q.progress = Math.min(q.target, q.progress + 1);
  }
}

function checkPeriodicResets(s: PlayerState, now: number) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (s.lastDailyReset !== today) {
    s.dailyQuests = createInitialDailyQuests();
    s.lastDailyReset = today;
  }
  const currentWeek = weekKey(now);
  const lastWeek = s.lastWeeklyReset ? weekKey(new Date(s.lastWeeklyReset).getTime()) : -1;
  if (currentWeek !== lastWeek) {
    s.weeklyQuests = createInitialWeeklyQuests();
    s.lastWeeklyReset = today;
  }
}

export async function applyRolls(
  s: PlayerState,
  activationCount = 1,
  forcedRarity?: number,
  source: 'online' | 'offline' = 'online',
  rollCountOverride?: number
): Promise<{ bestOrb: Orb; batch: Orb[]; totalVal: number; coinsGained: number; shardsGained: number; xpGained: number }> {
  let bestRarity = 0;
  let totalVal = 0;
  let coinsGained = 0;
  let shardsGained = 0;
  let xpGained = 0;
  let uniqueGained = 0;
  const batch: Orb[] = [];
  const rarities: number[] = [];
  let rollCount = rollCountOverride ?? (rollsPerActivation(s) * activationCount);
  const now = Date.now();
  const rng = serverRandom;

  // Astral Magnetism proc: chance for multi-rolls to pull 2 bonus orbs
  const magnetLevel = s.prestigeUpgrades?.stellarMagnet ?? 0;
  if (rollCount > 1 && magnetLevel > 0 && rng() < 0.10 * magnetLevel) {
    rollCount += 2;
  }


  s.globalBoosters = await getGlobalBoosters();
  const globalBoosters = s.globalBoosters;
  const worldEvent = await getCommunityEvent();
  const communityLuck = worldEvent.buffMultiplier ?? 1.15;

  // luckMultiplier already includes the current global Luck booster.
  const baseLuck = luckMultiplier(s) * communityLuck;

  // Apex Fortune Mastery: chance on multi-roll to double the luck of that activation
  const apexChance = Math.min(1, (s.masterySkills?.apexFortune ?? 0) * 0.05);
  const isApex = rollCount > 1 && rng() < apexChance;
  const effectiveLuck = isApex ? baseLuck * 2 : baseLuck;

  const cm = critMultiplier(s);
  const levelBenefits = getLevelBenefits(s.level || 1);
  const valueMul = 1 + (s.upgrades.valueBonus ?? 0) * 0.10;

  for (let i = 0; i < rollCount; i++) {
    // Check Critical Roll (Base + Mastery + Guild perk)
    const critChance =
      (s.upgrades.critChance ?? 0) * 0.03 +
      (s.masterySkills?.critMastery ?? 0) * 0.03 +
      (s.guildPerks?.critRank ?? 0) * 0.015 +
      globalBoosterCritChanceBonus(globalBoosters.crit);
    const isCrit = rng() < Math.min(1, critChance);
    let effectiveCm = cm;
    if (isCrit) {
      s.totalCrits = (s.totalCrits ?? 0) + 1;
      const supernovaLevel = s.prestigeUpgrades?.supernova ?? 0;
      if (supernovaLevel > 0 && rng() < supernovaLevel * 0.10) {
        effectiveCm = cm * 2.5; // 5x base critical multiplier!
      }
    }

    // Continuum RNG generation with effective luck
    const minimumRarity = 2 + (s.prestigeUpgrades?.luckyFloor ?? 0);
    const rolledRarity = (forcedRarity && i === 0)
      ? forcedRarity
      : Math.max(minimumRarity, rollContinuum(effectiveLuck, rng));
    const baseRarity = Math.max(minimumRarity, rolledRarity);
    const rarity = isCrit ? Math.min(10_000_000_000, Math.round(baseRarity * effectiveCm)) : baseRarity;
    const finalVal = Math.round(rarity * valueMul);

    totalVal += finalVal;
    rarities.push(rarity);
    s.totalRolls++;
    s.currentRunRolls = (s.currentRunRolls ?? 0) + 1;
    s.collectionValue = (s.collectionValue ?? 0) + finalVal;
    s.lifetimeCollectionValue = (s.lifetimeCollectionValue ?? 0) + finalVal;

    const isNew = !s.collection[String(rarity)];
    if (isNew) uniqueGained++;
    s.collection[String(rarity)] = (s.collection[String(rarity)] ?? 0) + 1;

    if (rarity > s.highestRarity) {
      s.highestRarity = rarity;
      s.rollsSinceBest = 0;
    } else {
      s.rollsSinceBest = (s.rollsSinceBest ?? 0) + 1;
    }

    if (rarity > bestRarity) {
      bestRarity = rarity;
    }

    const xpBonusMul =
      (1 + (s.upgrades.xpBonus ?? 0) * 0.20) *
      levelBenefits.xpMultiplier;
    const earnedXp = Math.round(Math.min(300, 12 + Math.floor(Math.log10(rarity + 1) * 12)) * xpBonusMul);

    // Shards bonus for rare orbs (1,000+)
    let earnedShards = 0;
    if (rarity >= 1_000_000) earnedShards = 10;
    else if (rarity >= 100_000) earnedShards = 5;
    else if (rarity >= 10_000) earnedShards = 2;
    else if (rarity >= 1_000) earnedShards = 1;

    // Shard Chance upgrade + Mastery + Guild perk proc
    const shardProcChance = Math.min(
      1,
      (s.upgrades.shardChance ?? 0) * 0.0015 +
      (s.masterySkills?.shardAttunement ?? 0) * 0.001 +
      (s.guildPerks?.shardRank ?? 0) * 0.0005 +
      levelBenefits.shardChance
    );
    if (rng() < shardProcChance) {
      earnedShards += 1;
    }

    shardsGained += earnedShards;
    xpGained += earnedXp;

    const orbInfo = getOrbInfo(rarity);
    if (batch.length < 50) {
      batch.push({
        rarity,
        rolledAt: now,
        tier: orbInfo.tier,
        name: orbInfo.name,
        isNew,
        isCrit,
      });
    }
  }

  // Balanced Gold progression: top rolled orb gives 100% coins; extra orbs in multi-roll give 20% bonus coins
  rarities.sort((a, b) => b - a);
  const topCoins = Math.round(coinsForRarity(rarities[0]));
  const extraCoins = rarities.slice(1).reduce((acc, r) => acc + Math.max(1, Math.round(coinsForRarity(r) * 0.20)), 0);
  coinsGained = topCoins + extraCoins;

  // Level passives and other coin modifiers stack multiplicatively by source.
  const coinBonusMul =
    levelBenefits.coinsMultiplier *
    (1 + (s.upgrades.coinBonus ?? 0) * 0.15) *
    (1 + (s.masterySkills?.prosperity ?? 0) * 0.12) *
    (1 + (s.guildPerks?.coinRank ?? 0) * 0.10);
  coinsGained = Math.round(coinsGained * coinBonusMul);

  const lowRarityCoins = rarities
    .filter(r => r < 100)
    .reduce((sum, r) => sum + Math.max(1, Math.round(coinsForRarity(r))), 0);

  // Singularity Filter: +25% only to Common/Uncommon coin yield.
  const hasFilter = (s.prestigeUpgrades?.autoFilter ?? 0) > 0;
  if (hasFilter && lowRarityCoins > 0) {
    coinsGained += Math.round(lowRarityCoins * 0.25);
  }

  // Alchemical Transmutation: bonus low-rarity coins & shard procs only.
  const transLevel = s.prestigeUpgrades?.transmutation ?? 0;
  if (transLevel > 0) {
    coinsGained += Math.round(lowRarityCoins * (transLevel * 0.15));
    for (let i = 0; i < rollCount; i++) {
      if (rng() < 0.01 * transLevel) {
        shardsGained += 1;
      }
    }
  }

  // Offline Fortune only modifies rewards generated from the offline vault.
  if (source === 'offline' && (s.prestigeUpgrades?.offlineFortune ?? 0) > 0) {
    coinsGained = Math.round(coinsGained * (1 + (s.prestigeUpgrades.offlineFortune * 0.25)));
  }

  // Offline Overdrive was intended to improve offline rewards, not online rolls.
  if (source === 'offline' && (s.prestigeUpgrades?.offlineOverdrive ?? 0) > 0) {
    coinsGained = Math.round(coinsGained * (1 + (s.prestigeUpgrades.offlineOverdrive * 0.50)));
  }

  const guildTax = await applyGuildTax(coinsGained);
  coinsGained = Math.max(0, coinsGained - guildTax.taxedCoins);
  s.coins += coinsGained;
  shardsGained = grantFreeShards(s, shardsGained);

  // Ascension increases XP by 10× while preserving the existing level logic.
  const effectiveXpGained = isPremiumBoosterActive(s, 'ascension') ? xpGained * 10 : xpGained;
  s.xp += effectiveXpGained;
  xpGained = effectiveXpGained;

  // Rich EXP Level Progression. XP may skip future thresholds, but the
  // displayed/active level only advances one step at a time.
  const oldLevel = Math.max(1, s.level || 1);
  const earnedLevel = calculateLevelFromXp(s.xp).level;
  const newLevel = Math.max(oldLevel, Math.min(oldLevel + 1, earnedLevel));
  s.level = newLevel;
  if (newLevel > oldLevel) {
    s.masteryPoints = (s.masteryPoints ?? 0) + 1;
  }
  s.lifetimeCoins = (s.lifetimeCoins ?? 0) + coinsGained;

  // Singularity Tithe: award every threshold crossed, including large offline batches.
  const titheLevel = s.prestigeUpgrades?.singularityTithe ?? 0;
  if (titheLevel > 0) {
    const interval = Math.max(1, Math.floor(200 / titheLevel));
    const before = Math.floor((s.totalRolls - rollCount) / interval);
    const after = Math.floor(s.totalRolls / interval);
    if (after > before) s.cosmicDust = (s.cosmicDust ?? 0) + (after - before);
  }

  // Mastery Engine: permanent Mastery Point income from sustained rolling.
  const masteryEngineLevel = s.prestigeUpgrades?.masteryEngine ?? 0;
  if (masteryEngineLevel > 0) {
    const interval = Math.max(1, Math.floor(100 / masteryEngineLevel));
    const before = Math.floor((s.totalRolls - rollCount) / interval);
    const after = Math.floor(s.totalRolls / interval);
    if (after > before) s.masteryPoints = (s.masteryPoints ?? 0) + (after - before);
  }

  // Celestial Auto-Buyer Prestige Upgrade: auto-buy cheapest affordable upgrade
  const autoBuyerLevel = s.prestigeUpgrades?.autoBuyer ?? 0;
  if (autoBuyerLevel > 0 && s.coins > 50) {
    autoBuyCheapest(s);
  }

  advanceQuestProgress(s, 'roll', rollCount);
  if (bestRarity >= 100) advanceQuestProgress(s, 'rare', bestRarity);
  advanceQuestProgress(s, 'value', totalVal);
  advanceQuestProgress(s, 'unique', uniqueGained);

  void contribute(totalVal, rollCount);
  void addCommunityRolls(rollCount);

  const bestInfo = getOrbInfo(bestRarity);
  const bestOrb: Orb = {
    rarity: bestRarity,
    rolledAt: now,
    tier: bestInfo.tier,
    name: bestInfo.name,
    isNew: s.collection[String(bestRarity)] === 1,
  };

  return { bestOrb, batch, totalVal, coinsGained, shardsGained, xpGained };
}

export async function settleOffline(s: PlayerState): Promise<PlayerState> {
  const now = Date.now();
  checkPeriodicResets(s, now);
  resetFreeShardBudgetIfNeeded(s, now);
  s.onlinePlayers = await touchOnlinePresence();
  s.globalBoosters = await getGlobalBoosters();

  await processAutomation(s);

  const tickMs = effectiveOfflineTickMs(s);
  const diff = now - (s.lastSeenAt || now);
  if (diff >= tickMs) {
    const earned = Math.floor(diff / tickMs);
    const cap = offlineRollCap(s);
    s.offlineRolls = Math.min(cap, (s.offlineRolls || 0) + earned);
  }
  s.lastSeenAt = now;
  return s;
}

export interface CollectionPageItem {
  rarity: number;
  count: number;
}

export async function getCollectionPage(options: {
  offset?: number;
  limit?: number;
  tier?: string;
  sort?: 'rarity_desc' | 'rarity_asc' | 'count';
} = {}): Promise<{
  items: CollectionPageItem[];
  total: number;
  offset: number;
  limit: number;
}> {
  const s = await loadRaw();
  const offset = Math.max(0, Math.floor(Number(options.offset ?? 0)));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit ?? 60))));
  const sort = options.sort ?? 'rarity_desc';
  const tier = String(options.tier ?? 'all');

  let entries = Object.entries(s.collection ?? {})
    .map(([rarityStr, count]) => ({ rarity: Number(rarityStr), count: Number(count) }))
    .filter(item => Number.isFinite(item.rarity) && item.count > 0);

  if (tier !== 'all') {
    entries = entries.filter(item => getOrbInfo(item.rarity).tier === tier);
  }

  entries.sort((a, b) => {
    if (sort === 'rarity_asc') return a.rarity - b.rarity;
    if (sort === 'count') return b.count - a.count || b.rarity - a.rarity;
    return b.rarity - a.rarity;
  });

  return {
    items: entries.slice(offset, offset + limit),
    total: entries.length,
    offset,
    limit,
  };
}

export async function getState(): Promise<PlayerState> {
  try {
    // Keep the entire read/settle/save cycle inside the recovery boundary. A
    // wipe can race either loadRaw() or an automation save triggered by
    // settleOffline(), not only the final explicit save below.
    const s = await settleOffline(await loadRaw());
    await save(s);
    return s;
  } catch (error) {
    // /api/me is a recovery-safe read endpoint. If an admin wipe happened while
    // this request was in flight, discard the stale state and immediately reload
    // the fresh generation instead of trapping the player behind a reload error.
    if (error instanceof Error && error.message.includes('invalidated by an admin wipe')) {
      const fresh = await settleOffline(await loadRaw());
      await save(fresh);
      return fresh;
    }
    throw error;
  }
}

export async function getMe(): Promise<PlayerState> {
  const ban = await getGameBanStatus();
  const s = ban ? await loadRaw() : await getState();
  if (ban) {
    s.gameBan = {
      active: true,
      bannedAt: ban.bannedAt,
      bannedUntil: ban.bannedUntil,
      reason: ban.reason,
    };
  } else {
    delete s.gameBan;
  }
  return s;
}

export async function checkOffline(): Promise<PlayerState> {
  const s = await loadRaw();
  return settleOffline(s);
}

export async function roll(): Promise<RollResponse> {
  const s = await settleOffline(await loadRaw());
  const now = Date.now();
  const cd = cooldownMs(s);
  if (s.lastRollAt !== null && now - s.lastRollAt < cd) {
    throw new Error(`Cooldown: ${((cd - now + s.lastRollAt) / 1000).toFixed(1)}s`);
  }

  const { bestOrb, batch, totalVal, coinsGained, shardsGained, xpGained } = await applyRolls(s);

  // Only direct manual roll activations count toward the Auto Roll unlock.
  s.manualRolls = Math.min(10, (s.manualRolls ?? 0) + 1);
  if (s.manualRolls >= 10) {
    s.upgrades.auto = 1;
  }

  s.lastRollAt = now;
  s.lastSeenAt = now;
  await save(s);
  await recordLeaderboard(s);

  return {
    orb: bestOrb,
    batch,
    totalValueGained: totalVal,
    totalRollValue: totalVal,
    coinsGained,
    shardsGained,
    xpGained,
    state: s,
    rollsRemainingUntilNext: cd,
    dramaticReveal: bestOrb.rarity >= 100,
  };
}

export async function claimOffline(): Promise<RollResponse> {
  const s = await settleOffline(await loadRaw());
  if (s.offlineRolls <= 0) throw new Error('No offline rolls waiting.');
  const batches = s.offlineRolls;
  s.offlineRolls = 0;
  const { bestOrb, batch, totalVal, coinsGained, shardsGained, xpGained } = await applyRolls(s, batches, undefined, 'offline');
  const now = Date.now();
  s.lastRollAt = now;
  s.lastSeenAt = now;
  await save(s);
  await recordLeaderboard(s);

  return {
    orb: bestOrb,
    batch,
    totalValueGained: totalVal,
    totalRollValue: totalVal,
    coinsGained,
    shardsGained,
    xpGained,
    state: s,
    rollsRemainingUntilNext: cooldownMs(s),
    dramaticReveal: bestOrb.rarity >= 100,
  };
}

export async function buyUpgrade(id: UpgradeId): Promise<PlayerState> {
  const s = await settleOffline(await loadRaw());
  const level = s.upgrades[id] ?? 0;

  // Auto Roll is free, but the server still enforces its 10-manual-roll unlock.
  if (id === 'auto') {
    if ((s.manualRolls ?? 0) < 10) {
      throw new Error(`Auto Roll unlocks after 10 manual rolls (${s.manualRolls ?? 0}/10).`);
    }
    s.upgrades.auto = 1;
    await save(s);
    return s;
  }

  const cost = upgradeCost(id, level);
  if (!Number.isFinite(cost)) {
    throw new Error(`${id === 'speed' ? 'Roll Speed' : 'This upgrade'} is already at its maximum level.`);
  }
  if (s.coins < cost) {
    throw new Error(`Need ${cost.toLocaleString()} Coins.`);
  }
  s.coins -= cost;
  s.upgrades[id] = (s.upgrades[id] ?? 0) + 1;
  await save(s);
  return s;
}

export function autoBuyCheapest(s: PlayerState): boolean {
  const upgradeIds: UpgradeId[] = [
    'speed', 'multi', 'clusterRoll', 'auto', 'luck', 'coinBonus',
    'shardChance', 'xpBonus', 'critChance', 'critPower', 'offlineRate', 'valueBonus'
  ];
  let bestId: UpgradeId | null = null;
  let lowestCost = Infinity;

  for (const id of upgradeIds) {
    if (id === 'auto') continue;
    const lvl = s.upgrades[id] ?? 0;
    const cost = upgradeCost(id, lvl);
    if (cost <= s.coins && cost < lowestCost) {
      lowestCost = cost;
      bestId = id;
    }
  }

  if (bestId && Number.isFinite(lowestCost) && s.coins >= lowestCost) {
    s.coins -= lowestCost;
    s.upgrades[bestId] = (s.upgrades[bestId] ?? 0) + 1;
    return true;
  }
  return false;
}

export async function buyAllUpgrades(): Promise<{ state: PlayerState; totalSpent: number; upgradedCount: number }> {
  const s = await settleOffline(await loadRaw());
  const upgradeIds: UpgradeId[] = [
    'speed', 'multi', 'clusterRoll', 'auto', 'luck', 'coinBonus',
    'shardChance', 'xpBonus', 'critChance', 'critPower', 'offlineRate', 'valueBonus'
  ];

  let totalSpent = 0;
  let upgradedCount = 0;
  const MAX_PURCHASES_PER_REQUEST = 5_000;

  // Sweep one level across every affordable upgrade, then repeat until no upgrade
  // can be bought. This makes the button genuinely "Upgrade All" rather than
  // "buy the cheapest thing until the wallet is empty."
  let changed = true;
  while (changed && upgradedCount < MAX_PURCHASES_PER_REQUEST) {
    changed = false;

    for (const id of upgradeIds) {
      if (upgradedCount >= MAX_PURCHASES_PER_REQUEST) break;

      const level = s.upgrades[id] ?? 0;
      let cost = upgradeCost(id, level);

      if (id === 'auto') continue;

      if (!Number.isFinite(cost) || cost > s.coins) continue;

      s.coins -= cost;
      s.upgrades[id] = level + 1;
      totalSpent += cost;
      upgradedCount++;
      changed = true;
    }
  }

  if (upgradedCount > 0) {
    await save(s);
  }

  return { state: s, totalSpent, upgradedCount };
}

export async function claimDailyStreak(): Promise<{ state: PlayerState; rewardCoins: number; rewardShards: number; day: number }> {
  const s = await settleOffline(await loadRaw());
  const result = await claimDailyStreakFromState(s);
  await save(s);
  return { state: s, ...result };
}

export async function claimQuest(type: 'daily' | 'weekly', id: string): Promise<{ state: PlayerState; rewardCoins: number; rewardShards: number; rewardTokens: number }> {
  const s = await settleOffline(await loadRaw());
  const list = type === 'daily' ? s.dailyQuests : s.weeklyQuests;
  const quest = list.find(q => q.id === id);
  if (!quest) throw new Error('Quest not found.');
  if (quest.unlocked === false) throw new Error('Quest is not unlocked yet.');
  if (quest.claimed) throw new Error('Quest already claimed.');
  if (quest.progress < quest.target) throw new Error('Quest requirement not met.');

  const reward = applyQuestReward(s, quest);

  if (quest.rewardTokens && quest.rewardTokens > 0) {
    const username = context.username ?? `reddit-user-${currentUserId().slice(-8)}`;
    void addGuildTokens(username, quest.rewardTokens);
  }

  await save(s);
  return {
    state: s,
    rewardCoins: reward.rewardCoins,
    rewardShards: reward.rewardShards,
    rewardTokens: reward.rewardTokens,
  };
}

export async function prestige(): Promise<{ state: PlayerState; cosmicDustEarned: number; dustGained: number }> {
  const s = await settleOffline(await loadRaw());
  const dustEarned = calculateCosmicDust(s);
  if (dustEarned <= 0 || (s.collectionValue ?? 0) < 1_000_000) {
    throw new Error('Requires at least 1,000,000 Collection Value in current run.');
  }

  s.cosmicDust = (s.cosmicDust ?? 0) + dustEarned;
  s.prestigeCount = (s.prestigeCount ?? 0) + 1;
  s.masteryPoints = (s.masteryPoints ?? 0) + 3;

  // Cosmic Inheritance Prestige Upgrade: retain 10% of coins and shards per level!
  const inheritanceLevel = s.prestigeUpgrades?.cosmicInheritance ?? 0;
  const keepPct = Math.min(0.50, inheritanceLevel * 0.10);
  const keptCoins = Math.max(50, Math.floor(s.coins * keepPct));
  const keptShards = Math.floor((s.shards ?? 0) * keepPct);

  // Strict reset of current run collection value, coins, and base upgrades
  s.collectionValue = 0;
  s.coins = keptCoins;
  s.shards = keptShards;
  s.upgrades = createInitialState().upgrades;
  s.offlineRolls = 0;
  s.rollsSinceBest = 0;
  s.currentRunRolls = 0;

  if (!s.claimedAchievements.includes('first-prestige')) {
    s.claimedAchievements.push('first-prestige');
  }

  await save(s);
  return { state: s, cosmicDustEarned: dustEarned, dustGained: dustEarned };
}

export async function buyPrestigeUpgrade(id: PrestigeUpgradeId): Promise<PlayerState> {
  const s = await settleOffline(await loadRaw());
  const info = PRESTIGE_UPGRADES[id];
  if (!info) throw new Error('Unknown prestige upgrade.');
  if (!s.prestigeUpgrades) {
    s.prestigeUpgrades = createInitialState().prestigeUpgrades;
  }
  const current = s.prestigeUpgrades[id] ?? 0;
  if (current >= info.maxLevel) {
    throw new Error(`Upgrade ${info.name} is already at max level (${info.maxLevel}).`);
  }
  const cost = prestigeUpgradeCost(id, current);
  if (s.cosmicDust < cost) {
    throw new Error(`Need ${cost} Cosmic Dust.`);
  }

  s.cosmicDust -= cost;
  s.prestigeUpgrades[id] = current + 1;
  await save(s);
  return s;
}

export async function sacrificeToAltar(coins: number, shards: number): Promise<{ state: PlayerState; altarLeveledUp: boolean; luckSurgeExtended: boolean }> {
  const s = await settleOffline(await loadRaw());
  const numCoins = finiteNonNegativeInteger(coins);
  const numShards = finiteNonNegativeInteger(shards);

  if (numCoins < 100 && numShards <= 0) {
    throw new Error('Sacrifice at least 100 Coins or 1 Shard.');
  }
  if (s.coins < numCoins) throw new Error('Not enough Coins to sacrifice.');
  if ((s.shards ?? 0) < numShards) throw new Error('Not enough Shards to sacrifice.');

  if (!s.sacrifices) {
    s.sacrifices = { coinsSacrificed: 0, shardsSacrificed: 0, altarLevel: 0, luckSurgeUntil: 0 };
  }

  s.coins -= numCoins;
  s.shards = (s.shards ?? 0) - numShards;

  const prevAltarLevel = s.sacrifices.altarLevel ?? 0;
  s.sacrifices.coinsSacrificed = (s.sacrifices.coinsSacrificed ?? 0) + numCoins;
  s.sacrifices.shardsSacrificed = (s.sacrifices.shardsSacrificed ?? 0) + numShards;

  // Level up altar devotion based on cumulative sacrifices
  const newAltarLevel = Math.floor(Math.sqrt((s.sacrifices.coinsSacrificed ?? 0) / 250));
  const altarLeveledUp = newAltarLevel > prevAltarLevel;
  s.sacrifices.altarLevel = newAltarLevel;

  // Shards grant / extend temporary high-yield Luck Surge (+25% bonus luck)
  let luckSurgeExtended = false;
  if (numShards > 0) {
    const surgeDurationMs = numShards * 15 * 60 * 1000; // 15 mins per shard
    s.sacrifices.luckSurgeUntil = Math.max(Date.now(), s.sacrifices.luckSurgeUntil ?? 0) + surgeDurationMs;
    luckSurgeExtended = true;
  }

  // Altar level ups award Mastery Points!
  if (altarLeveledUp) {
    s.masteryPoints = (s.masteryPoints ?? 0) + (newAltarLevel - prevAltarLevel);
  }

  await save(s);
  return { state: s, altarLeveledUp, luckSurgeExtended };
}

export async function upgradeMasterySkill(skillId: MasterySkillId): Promise<PlayerState> {
  const s = await settleOffline(await loadRaw());
  const skill = MASTERY_SKILLS[skillId];
  if (!skill) throw new Error('Unknown mastery skill.');

  if (!s.masterySkills) {
    s.masterySkills = {
      continuumLuck: 0,
      prosperity: 0,
      shardAttunement: 0,
      critMastery: 0,
      chronoFlow: 0,
      infiniteVault: 0,
      cosmicAttunement: 0,
      celestialSurge: 0,
      pityAccelerant: 0,
      apexFortune: 0,
      celestialVolley: 0,
    };
  }

  const currentLevel = s.masterySkills[skillId] ?? 0;
  if (currentLevel >= skill.maxLevel) {
    throw new Error(`Mastery skill ${skill.name} is already at max level (${skill.maxLevel}).`);
  }

  const cost = masterySkillCost(skillId, currentLevel);
  if ((s.masteryPoints ?? 0) < cost) {
    throw new Error(`Requires ${cost} Mastery Points.`);
  }

  s.masteryPoints = (s.masteryPoints ?? 0) - cost;
  s.masterySkills[skillId] = currentLevel + 1;
  await save(s);
  return s;
}

export async function synthesizeDust(): Promise<{ state: PlayerState; dustEarned: number }> {
  const s = await settleOffline(await loadRaw());
  if ((s.prestigeUpgrades?.shardSynthesis ?? 0) < 1) {
    throw new Error('Astral Forge prestige upgrade is required to synthesize Cosmic Dust.');
  }
  if ((s.shards ?? 0) < SHARD_SYNTHESIS_COST) {
    throw new Error(`Synthesizing requires at least ${SHARD_SYNTHESIS_COST} Shards.`);
  }

  spendShards(s, SHARD_SYNTHESIS_COST);
  s.cosmicDust = (s.cosmicDust ?? 0) + 1;
  await save(s);
  return { state: s, dustEarned: 1 };
}

export async function buyCosmetic(id: string): Promise<PlayerState> {
  const s = await settleOffline(await loadRaw());
  const cosmetic = COSMETICS_LIST.find(c => c.id === id);
  if (!cosmetic) throw new Error('Cosmetic not found.');
  if (s.unlockedCosmetics.includes(id)) {
    s.activeCosmetic = id;
    await save(s);
    return s;
  }

  if (s.coins < cosmetic.costCoins || s.shards < cosmetic.costShards) {
    throw new Error('Not enough Coins or Shards.');
  }

  s.coins -= cosmetic.costCoins;
  spendShards(s, cosmetic.costShards);
  s.unlockedCosmetics.push(id);
  s.activeCosmetic = id;
  await save(s);
  return s;
}

async function claimWorldBoosterActivation(
  s: PlayerState,
  id: GlobalBoosterId,
  useCredit: boolean,
): Promise<{
  state: PlayerState;
  snapshot: GlobalBoosterSnapshot;
  usedCredit: boolean;
  announcement: {
    id: GlobalBoosterId;
    name: string;
    username: string;
    activatedAt: number;
  };
}> {
  const cost = GLOBAL_BOOSTERS[id].costShards;
  const userId = currentUserId();

  await appendGlobalBoosterDebugLog('player:activation-start', {
    userId,
    username: context.username ?? null,
    id,
    useCredit,
    costShards: cost,
    currentShards: s.shards,
    currentCredits: s.globalBoosterCredits ?? 0,
    playerGlobalState: s.globalBoosters ?? null,
  });

  if (useCredit) {
    if ((s.globalBoosterCredits ?? 0) <= 0) {
      await appendGlobalBoosterDebugLog('player:activation-rejected-no-credit', {
        userId,
        id,
        credits: s.globalBoosterCredits ?? 0,
      });
      throw new Error('No free Global Booster activations remain.');
    }
    s.globalBoosterCredits = (s.globalBoosterCredits ?? 0) - 1;
  } else {
    if ((s.shards ?? 0) < cost) {
      await appendGlobalBoosterDebugLog('player:activation-rejected-no-shards', {
        userId,
        id,
        shards: s.shards,
        required: cost,
      });
    }
    spendShards(s, cost);
  }

  await appendGlobalBoosterDebugLog('player:currency-deducted', {
    userId,
    id,
    useCredit,
    shardsAfter: s.shards,
    creditsAfter: s.globalBoosterCredits ?? 0,
  });

  try {
    const snapshot = await updateGlobalBooster(id);
    s.globalBoosters = snapshot;

    await appendGlobalBoosterDebugLog('player:before-save', {
      userId,
      id,
      useCredit,
      snapshot,
      shards: s.shards,
      credits: s.globalBoosterCredits ?? 0,
    });

    await save(s);

    await appendGlobalBoosterDebugLog('player:activation-success', {
      userId,
      id,
      useCredit,
      snapshot,
      shardsAfter: s.shards,
      creditsAfter: s.globalBoosterCredits ?? 0,
    });

    const activatedAt = Date.now();
    const activatedBy = String(context.username ?? s.username ?? 'Redditor').trim() || 'Redditor';
    await redis.set(GLOBAL_BOOSTER_ANNOUNCEMENT_KEY, JSON.stringify({
      id,
      name: GLOBAL_BOOSTERS[id].name,
      username: activatedBy,
      activatedAt,
    }));

    return {
      state: s,
      snapshot,
      usedCredit: useCredit,
      announcement: {
        id,
        name: GLOBAL_BOOSTERS[id].name,
        username: activatedBy,
        activatedAt,
      },
    };
  } catch (error) {
    if (useCredit) s.globalBoosterCredits = (s.globalBoosterCredits ?? 0) + 1;
    else s.shards = (s.shards ?? 0) + cost;

    await appendGlobalBoosterDebugLog('player:activation-failed', {
      userId,
      id,
      useCredit,
      errorName: error instanceof Error ? error.name : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      refundedShards: useCredit ? 0 : cost,
      refundedCredit: useCredit,
    });

    throw error;
  }
}

export async function activateGlobalBooster(
  id: GlobalBoosterId,
  useCredit = false,
): Promise<{
  state: PlayerState;
  snapshot: GlobalBoosterSnapshot;
  usedCredit: boolean;
  announcement: {
    id: GlobalBoosterId;
    name: string;
    username: string;
    activatedAt: number;
  };
}> {
  if (!GLOBAL_BOOSTERS[id]) throw new Error('Unknown Global Booster.');

  const userId = currentUserId();
  await appendGlobalBoosterDebugLog('player:request', {
    userId,
    username: context.username ?? null,
    id,
    useCredit,
  });

  const s = await settleOffline(await loadRaw());

  await appendGlobalBoosterDebugLog('player:loaded-state', {
    userId,
    id,
    useCredit,
    shards: s.shards,
    credits: s.globalBoosterCredits ?? 0,
    globalBoosters: s.globalBoosters ?? null,
  });

  return claimWorldBoosterActivation(s, id, useCredit);
}

export async function activatePremiumBooster(id: PremiumBoosterId): Promise<PlayerState> {
  const s = await settleOffline(await loadRaw());
  const info = PREMIUM_BOOSTERS[id];
  if (!info) throw new Error('Unknown premium booster.');
  if (!s.activeBoosters) s.activeBoosters = {};
  if ((s.shards ?? 0) < info.costShards) {
    throw new Error(info.name + ' requires ' + info.costShards + ' Shards.');
  }

  const now = Date.now();
  spendShards(s, info.costShards);
  s.activeBoosters[id] = Math.max(now, s.activeBoosters[id] ?? 0) + info.durationMs;
  await save(s);
  return s;
}

export async function buyAutomation(id: AutomationId): Promise<PlayerState> {
  const s = await settleOffline(await loadRaw());
  const info = AUTOMATIONS[id];
  if (!info) throw new Error('Unknown automation.');
  if (s.automations?.[id]) throw new Error(info.name + ' is already unlocked.');
  if ((s.shards ?? 0) < info.costShards) {
    throw new Error(info.name + ' requires ' + info.costShards + ' Shards.');
  }

  spendShards(s, info.costShards);
  s.automations = { ...(s.automations ?? {}), [id]: true };
  await save(s);
  return s;
}

export async function claimCommunityReward(): Promise<{ state: PlayerState; rewardCoins: number; rewardXp: number; nextClaimAt: number; tier: number }> {
  const s = await settleOffline(await loadRaw());
  const result = await claimCommunityRewardFromState(s);
  if (result.rewardCoins <= 0) throw new Error('No new Community Reward is available.');
  await save(s);
  return { state: s, ...result };
}

export async function startOrbFrenzy(options: {
  bypassDailyLimit?: boolean;
  forcedRarity?: number;
  adminTest?: boolean;
} = {}): Promise<{ state: PlayerState; postId: string; url: string; rarity: number }> {
  const s = await settleOffline(await loadRaw());
  const today = new Date().toISOString().slice(0, 10);
  if (!options.bypassDailyLimit && s.lastFrenzyDate === today) {
    throw new Error('Orb Frenzy is already used today.');
  }

  // Frenzy now stays inside the current game post. The owner gets one normal
  // roll to determine the Frenzy rarity, then the game expands and unleashes
  // the full Frenzy volley in the normal game window.
  const forcedRarity = options.forcedRarity == null
    ? undefined
    : Math.max(2, Math.floor(Number(options.forcedRarity)));
  const result = await applyRolls(s, 1, forcedRarity, 'online', 1);

  const postId = context.postId ?? 'no-post';
  const postKey = FRENZY_POST_PREFIX + postId;
  await redis.set(postKey, JSON.stringify({
    ownerId: currentUserId(),
    ownerUsername: context.username ?? 'Redditor',
    rarity: result.bestOrb.rarity,
    subredditName: context.subredditName ?? '',
    createdAt: Date.now(),
    adminTest: options.adminTest === true,
    inGame: true,
    consumedAt: null,
  }));

  s.lastFrenzyDate = today;
  s.lastRollAt = Date.now();
  s.lastSeenAt = Date.now();
  await save(s);

  return {
    state: s,
    postId: context.postId ?? '',
    rarity: result.bestOrb.rarity,
    url: '',
  };
}

export async function getOrbFrenzyInfo(): Promise<{
  rarity: number;
  ownerUsername: string;
  createdAt: number;
  claimedToday: boolean;
  isOwner: boolean;
  postId: string;
  inGame?: boolean;
  consumedAt?: number | null;
}> {
  const postId = context.postId;
  if (!postId) throw new Error('This is not an Orb Frenzy post.');
  const raw = await redis.get(FRENZY_POST_PREFIX + postId);
  if (!raw) throw new Error('Orb Frenzy post data was not found.');
  const data = parseStoredJson<{
    ownerId: string; ownerUsername: string; rarity: number; createdAt: number; inGame?: boolean; consumedAt?: number;
  }>(raw);
  if (!data) throw new Error('Orb Frenzy data is corrupted.');
  const today = new Date().toISOString().slice(0, 10);
  const s = await getMe();
  return {
    rarity: data.rarity,
    ownerUsername: data.ownerUsername,
    createdAt: data.createdAt,
    claimedToday: s.lastFrenzyClaimDate === today,
    isOwner: data.ownerId === currentUserId(),
    postId,
    inGame: data.inGame === true,
    consumedAt: data.consumedAt ?? null,
  };
}

export async function claimOrbFrenzy(options: {
  allowAdminTestOwner?: boolean;
  postId?: string;
} = {}): Promise<RollResponse> {
  const postId = options.postId ?? context.postId;
  if (options.postId && options.allowAdminTestOwner !== true) {
    throw new Error('Explicit Frenzy post targeting is admin-only.');
  }
  if (!postId) throw new Error('This is not an Orb Frenzy post.');
  const raw = await redis.get(FRENZY_POST_PREFIX + postId);
  if (!raw) throw new Error('Orb Frenzy post data was not found.');

  const data = parseStoredJson<{
    ownerId: string;
    ownerUsername: string;
    rarity: number;
    subredditName: string;
    adminTest?: boolean;
    inGame?: boolean;
    consumedAt?: number;
  }>(raw);
  if (!data) throw new Error('Orb Frenzy data is corrupted.');

  if (data.inGame === true) {
    if (data.ownerId !== currentUserId()) {
      throw new Error('This in-game Orb Frenzy belongs to another player.');
    }
    if (data.consumedAt) {
      throw new Error('This Orb Frenzy has already been unleashed.');
    }
  } else if (
    data.ownerId === currentUserId() &&
    !(options.allowAdminTestOwner === true && data.adminTest === true)
  ) {
    throw new Error('You cannot claim your own Orb Frenzy.');
  }

  const s = await settleOffline(await loadRaw());
  const today = new Date().toISOString().slice(0, 10);
  if (s.lastFrenzyClaimDate === today) {
    throw new Error('You already claimed a Frenzy reward today.');
  }

  const baseCount = Math.max(1, data.rarity);
  const frenzyVolleyEfficiency = (s.prestigeUpgrades?.frenzyVolley ?? 0) > 0
    ? Math.max(0, rollsPerActivation(s) - 1) * 0.20
    : 0;
  const count = Math.max(
    1,
    Math.min(50_000_000, Math.floor(baseCount * (1 + frenzyVolleyEfficiency))),
  );

  const critChance = Math.min(
    1,
    (s.upgrades.critChance ?? 0) * 0.03 +
    (s.masterySkills?.critMastery ?? 0) * 0.03 +
    (s.guildPerks?.critRank ?? 0) * 0.015 +
    globalBoosterCritChanceBonus(s.globalBoosters?.crit),
  );
  const critCount = sampleBinomial(count, critChance);

  const supernovaLevel = s.prestigeUpgrades?.supernova ?? 0;
  const supernovaCount = supernovaLevel > 0
    ? sampleBinomial(critCount, Math.min(1, supernovaLevel * 0.10))
    : 0;

  const normalCritCount = Math.max(0, critCount - supernovaCount);
  const normalCritRarity = Math.min(10_000_000_000, Math.round(data.rarity * critMultiplier(s)));
  const supernovaRarity = Math.min(10_000_000_000, Math.round(data.rarity * critMultiplier(s) * 2.5));

  const groups = [
    { count: count - critCount, rarity: data.rarity },
    { count: normalCritCount, rarity: normalCritRarity },
    { count: supernovaCount, rarity: supernovaRarity },
  ].filter(group => group.count > 0);

  const valueMul = 1 + (s.upgrades.valueBonus ?? 0) * 0.10;
  const maxSafe = Number.MAX_SAFE_INTEGER;
  const safeMultiplyAdd = (sum: number, count: number, value: number): number => {
    if (sum >= maxSafe || count <= 0 || value <= 0) return Math.min(maxSafe, sum);
    if (count > Math.floor((maxSafe - sum) / value)) return maxSafe;
    return sum + count * value;
  };
  const rawValue = groups.reduce(
    (sum, group) => safeMultiplyAdd(sum, group.count, group.rarity),
    0,
  );
  const finalValue = rawValue >= maxSafe / valueMul
    ? maxSafe
    : Math.min(maxSafe, Math.round(rawValue * valueMul));

  const coinTotals = groups.reduce(
    (sum, group) => sum + group.count * Math.max(1, Math.round(coinsForRarity(group.rarity))),
    0,
  );
  const topRarity = Math.max(...groups.map(group => group.rarity));
  const topCoin = Math.max(1, Math.round(coinsForRarity(topRarity)));
  let coinsGained = Math.max(
    1,
    Math.round(topCoin + Math.max(0, coinTotals - topCoin) * 0.20),
  );

  const levelBenefits = getLevelBenefits(s.level || 1);
  coinsGained = Math.round(
    coinsGained *
    levelBenefits.coinsMultiplier *
    (1 + (s.upgrades.coinBonus ?? 0) * 0.15) *
    (1 + (s.masterySkills?.prosperity ?? 0) * 0.12) *
    (1 + (s.guildPerks?.coinRank ?? 0) * 0.10) *
    (isPremiumBoosterActive(s, 'prosperity') ? 10 : 1),
  );

  const xpForRarity = (rarity: number) =>
    Math.round(
      Math.min(300, 12 + Math.floor(Math.log10(rarity + 1) * 12)) *
      (1 + (s.upgrades.xpBonus ?? 0) * 0.20) *
      levelBenefits.xpMultiplier *
      (isPremiumBoosterActive(s, 'ascension') ? 10 : 1),
    );
  const xpGained = Math.min(
    Number.MAX_SAFE_INTEGER,
    groups.reduce((sum, group) => sum + group.count * xpForRarity(group.rarity), 0),
  );

  const shardChance = Math.min(
    1,
    (s.upgrades.shardChance ?? 0) * 0.0015 +
    (s.masterySkills?.shardAttunement ?? 0) * 0.001 +
    (s.guildPerks?.shardRank ?? 0) * 0.0005 +
    levelBenefits.shardChance,
  );
  const procShards = sampleBinomial(count, shardChance);
  const rarityShards = groups.reduce((sum, group) => {
    if (group.rarity >= 1_000_000) return sum + group.count * 10;
    if (group.rarity >= 100_000) return sum + group.count * 5;
    if (group.rarity >= 10_000) return sum + group.count * 2;
    if (group.rarity >= 1_000) return sum + group.count;
    return sum;
  }, 0);
  const shardsGained = grantFreeShards(s, rarityShards + procShards);

  const previousHighest = s.highestRarity;
  s.totalRolls += count;
  s.currentRunRolls = (s.currentRunRolls ?? 0) + count;
  s.collectionValue = Math.min(Number.MAX_SAFE_INTEGER, (s.collectionValue ?? 0) + finalValue);
  s.lifetimeCollectionValue = Math.min(Number.MAX_SAFE_INTEGER, (s.lifetimeCollectionValue ?? 0) + finalValue);
  s.totalCrits = (s.totalCrits ?? 0) + critCount;
  const guildTax = await applyGuildTax(coinsGained);
  coinsGained = Math.max(0, coinsGained - guildTax.taxedCoins);
  s.coins += coinsGained;
  s.lifetimeCoins = (s.lifetimeCoins ?? 0) + coinsGained;
  s.lastFrenzyClaimDate = today;

  if (data.inGame === true) {
    await redis.set(FRENZY_POST_PREFIX + postId, JSON.stringify({
      ...data,
      consumedAt: Date.now(),
    }));
  }

  for (const group of groups) {
    const keyForRarity = String(group.rarity);
    s.collection[keyForRarity] = (s.collection[keyForRarity] ?? 0) + group.count;
  }

  const bestRarity = topRarity;
  const uniqueGained = groups.reduce(
    (total, group) => total + (s.collection[String(group.rarity)] ? 0 : 1),
    0,
  );
  s.highestRarity = Math.max(s.highestRarity, bestRarity);
  s.rollsSinceBest = bestRarity > previousHighest ? 0 : (s.rollsSinceBest ?? 0) + count;

  const oldLevel = Math.max(1, s.level || 1);
  s.xp += xpGained;
  const earnedLevel = calculateLevelFromXp(s.xp).level;
  const newLevel = Math.max(oldLevel, Math.min(oldLevel + 1, earnedLevel));
  s.level = newLevel;
  if (newLevel > oldLevel) {
    s.masteryPoints = (s.masteryPoints ?? 0) + 1;
  }

  advanceQuestProgress(s, 'roll', count);
  advanceQuestProgress(s, 'rare', bestRarity);
  advanceQuestProgress(s, 'value', finalValue);
  advanceQuestProgress(s, 'unique', uniqueGained);
  void contribute(finalValue, count);
  void addCommunityRolls(count);

  await save(s);

  const orbInfo = getOrbInfo(bestRarity);
  const bestOrb: Orb = {
    rarity: bestRarity,
    rolledAt: Date.now(),
    tier: orbInfo.tier,
    name: orbInfo.name,
    isNew: true,
    isCrit: bestRarity > data.rarity,
  };

  return {
    orb: bestOrb,
    batch: [bestOrb],
    totalValueGained: finalValue,
    totalRollValue: finalValue,
    coinsGained,
    shardsGained,
    xpGained,
    state: s,
    rollsRemainingUntilNext: cooldownMs(s),
    dramaticReveal: bestRarity >= 100,
    frenzyCount: count,
  };
}


function sampleBinomial(n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n < 2_000) {
    let count = 0;
    for (let i = 0; i < n; i++) if (serverRandom() < p) count++;
    return count;
  }
  const mean = n * p;
  const variance = n * p * (1 - p);
  const standardDeviation = Math.sqrt(variance);
  const u1 = Math.max(1e-12, serverRandom());
  const u2 = serverRandom();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.min(n, Math.round(mean + standardDeviation * gaussian)));
}

export async function activateTurbo(): Promise<PlayerState> {
  const s = await settleOffline(await loadRaw());
  const costShards = 5;
  if (s.shards < costShards) {
    throw new Error('Turbo Roll requires 5 Shards.');
  }
  spendShards(s, costShards);
  const durationMs = (s.prestigeUpgrades?.chronoOverdrive ?? 0) > 0 ? 60 * 60 * 1000 : 30 * 60 * 1000;
  s.turboRollUntil = Math.max(Date.now(), s.turboRollUntil ?? 0) + durationMs;
  await save(s);
  return s;
}

export async function recordSocialVisit(s: PlayerState) {
  const today = new Date().toISOString().slice(0, 10);
  if (s.socialActivityDate === today) return;
  s.socialActivityDate = today;
  advanceQuestProgress(s, 'social', 1);
  await save(s);
}

export async function recordShareAction(s: PlayerState) {
  const now = Date.now();
  if (s.lastShareAt && now - s.lastShareAt < 30_000) {
    throw new Error('Please wait before sharing another orb.');
  }
  s.lastShareAt = now;
  advanceQuestProgress(s, 'share', 1);
  await save(s);
}
