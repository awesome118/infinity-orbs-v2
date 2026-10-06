import { Router } from 'express';
import {
  applyRolls,
  claimOrbFrenzy,
  loadRaw,
  save,
  listPlayers,
  startOrbFrenzy,
  getGameBanStatus,
  listGameBans,
  banGameUser,
  unbanGameUser,
  getDeveloperAnnouncement,
  setDeveloperAnnouncement,
  getPaymentDebugLogs,
  clearPaymentDebugLogs,
  getSaveDebugLogs,
  clearSaveDebugLogs,
  setGlobalBoosterDebugState,
  getGlobalBoosterDebugLogs,
  clearGlobalBoosterDebugLogs,
  getCcuPeaks,
  setFakeCcuBonus,
  sendPushNotificationTest,
  getPlayerSpyLogs,
  clearPlayerSpyLogs,
  getFollowPromptStats,
} from './game.js';
import { withPlayerMutationLock, withPlayerMutationLockFor } from './player-lock.js';
import { context, redis, reddit } from './devvit-mock.js';
import {
  setCommunityEventConfig,
  listGuildChatSpy,
  muteGuildChatUser,
  unmuteGuildChatUser,
} from './social.js';
import { cooldownMs, createInitialState, calculateLevelFromXp, COSMETICS_LIST, PRESTIGE_UPGRADES, MASTERY_SKILLS } from '../shared/game.js';
import { recordLeaderboard } from './social.js';

const DEBUG_USERS = new Set([
  'shadow_fen',
]);

// Bump this whenever the game-moderation transport changes so an admin can
// immediately tell whether the running Devvit bundle contains the Redis-only
// game-ban implementation instead of an older Reddit-moderation build.
const GAME_MODERATION_VERSION = 'redis-game-ban-v3';

function normalizeUsername(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^\/u\//i, '')
    .replace(/^u\//i, '')
    .toLowerCase();
}

export function isDebugUser(): boolean {
  return DEBUG_USERS.has(normalizeUsername(context.username));
}

export const debugRouter = Router();

// Never trust the client to decide whether the admin console is available.
// Every admin endpoint is protected server-side.
debugRouter.use((_req, res, next) => {
  if (!isDebugUser()) return res.status(404).json({ error: 'Not found.' });
  next();
});

debugRouter.get('/payment-logs', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Math.floor(Number(req.query.limit ?? 200) || 200)));
    res.json({ logs: await getPaymentDebugLogs(limit) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load payment debug logs.' });
  }
});

debugRouter.post('/payment-logs/clear', async (_req, res) => {
  try {
    await clearPaymentDebugLogs();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to clear payment debug logs.' });
  }
});

debugRouter.get('/save-logs', async (req, res) => {
  try {
    const username = String(req.query?.username ?? '').trim();
    const userId = username ? await resolveUserId(targetUsername(username)) : undefined;
    const limit = Math.max(1, Math.min(500, Math.floor(Number(req.query?.limit ?? 500) || 500)));
    const logs = await getSaveDebugLogs(userId, limit);
    res.json({
      username: username || null,
      userId: userId ?? null,
      logCount: logs.length,
      logs,
      generatedAt: Date.now(),
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to load save diagnostics.' });
  }
});

debugRouter.post('/save-logs/clear', async (_req, res) => {
  try {
    await clearSaveDebugLogs();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to clear save diagnostics.' });
  }
});

debugRouter.get('/global-booster-logs', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(300, Math.floor(Number(req.query.limit ?? 300) || 300)));
    res.json({ logs: await getGlobalBoosterDebugLogs(limit) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load Global Booster logs.' });
  }
});

debugRouter.post('/global-booster-logs/clear', async (_req, res) => {
  try {
    await clearGlobalBoosterDebugLogs();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to clear Global Booster logs.' });
  }
});

debugRouter.post('/global-booster', async (req, res) => {
  try {
    const id = String(req.body?.id ?? '');
    const state = await setGlobalBoosterDebugState(id as any, req.body?.tier, req.body?.minutes);
    res.json({ ok: true, id, state });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to set Global Booster.' });
  }
});

debugRouter.get('/follow-reward', async (_req, res) => {
  try {
    res.json(await getFollowRewardStats());
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load follow reward statistics.' });
  }
});

debugRouter.get('/ccu', async (_req, res) => {
  try {
    res.json(await getCcuPeaks());
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load CCU statistics.' });
  }
});

debugRouter.post('/ccu/fake', async (req, res) => {
  try {
    const bonus = await setFakeCcuBonus(Number(req.body?.bonus ?? 0));
    res.json({ ok: true, fakeCcuBonus: bonus });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to set fake CCU.' });
  }
});

debugRouter.post('/push-test', async (_req, res) => {
  try {
    await sendPushNotificationTest();
    res.json({ ok: true, message: 'Push test notification enqueued.' });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to send push test notification.' });
  }
});

debugRouter.get('/follow-stats', async (_req, res) => {
  try {
    res.json(await getFollowPromptStats());
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load follow statistics.' });
  }
});

debugRouter.get('/status', async (_req, res) => {
  res.json({
    isAdmin: true,
    username: context.username ?? null,
    userId: context.userId ?? null,
    subredditName: context.subredditName ?? null,
    postId: context.postId ?? null,
    gameModerationVersion: GAME_MODERATION_VERSION,
    gameBan: await getGameBanStatus(),
  });
});

function finiteInteger(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  return Math.max(0, finiteInteger(value, fallback));
}

function targetUsername(value: unknown): string {
  const name = normalizeUsername(value);
  if (!name) throw new Error('A Reddit username is required.');
  return name;
}

async function removeLeaderboardEntry(username: string): Promise<void> {
  const raw = await redis.get('io:leaderboard');
  if (!raw) return;
  const board = (() => {
    if (typeof raw !== 'string') return Array.isArray(raw) ? raw as unknown as Array<{ username?: string }> : [];
    try {
      return JSON.parse(raw) as Array<{ username?: string }>;
    } catch {
      return [];
    }
  })();
  const normalized = normalizeUsername(username);
  await redis.set(
    'io:leaderboard',
    JSON.stringify(board.filter(entry => normalizeUsername(entry.username) !== normalized)),
  );
}

async function resolveUserId(username: string): Promise<string> {
  if (normalizeUsername(context.username) === normalizeUsername(username) && context.userId) {
    return context.userId;
  }
  const user = await reddit.getUserByUsername(username);
  const id = user?.id;
  if (!id) throw new Error(`Reddit user "u/${username}" was not found.`);
  return id;
}

async function wipeUser(username: string): Promise<{ username: string; userId: string; generation: number }> {
  const name = targetUsername(username);
  const userId = await resolveUserId(name);

  return withPlayerMutationLockFor(userId, async () => {
  const generationKey = `player-generation:${userId}`;
  const playerKey = `player:${userId}`;

  const currentRaw = await redis.get(generationKey);
  const currentGeneration = Math.max(0, Number.parseInt(String(currentRaw ?? '0'), 10) || 0);
  const generation = currentGeneration + 1;

  // Invalidate the old generation first, then replace the save with a fresh
  // starting state instead of merely deleting it. This makes a wipe observable
  // immediately even when the target player is actively online. Any in-flight
  // request carrying the old generation still fails the generation check and
  // cannot write the old state back over the reset.
  const fresh = createInitialState();
  fresh.username = name;
  fresh.saveGeneration = generation;

  await redis.set(generationKey, String(generation));
  await redis.set(playerKey, JSON.stringify(fresh));
  await removeLeaderboardEntry(name);
  // A plain wipe is a full account reset. Remove any existing game ban so the
  // wiped player can immediately start a fresh save. The dedicated wipe-and-ban
  // endpoint applies a new ban after this function returns.
  await unbanGameUser(userId);

  const persisted = await redis.get(playerKey);
  if (persisted == null) {
    throw new Error(`Wipe failed: player save for u/${name} was not persisted.`);
  }

  return { username: name, userId, generation };
  });
}

function setMaxProgression(s: Awaited<ReturnType<typeof loadRaw>>): void {
  const now = Date.now();

  s.coins = 1_000_000_000_000;
  s.shards = 100_000;
  s.cosmicDust = 100_000;
  s.xp = 1_000_000_000;
  s.level = calculateLevelFromXp(s.xp).level;
  s.totalRolls = 1_000_000;
  s.totalCrits = 100_000;
  s.lifetimeCoins = Math.max(s.lifetimeCoins ?? 0, s.coins);
  s.lifetimeShards = Math.max(s.lifetimeShards ?? 0, s.shards);
  s.highestRarity = 100_000_000;
  s.collectionValue = 1_000_000_000_000;
  s.lifetimeCollectionValue = Math.max(s.lifetimeCollectionValue ?? 0, s.collectionValue);
  s.offlineRolls = 1_000;
  s.rollsSinceBest = 0;
  s.prestigeCount = 10;
  s.masteryPoints = 10_000;
  s.currentRunRolls = s.totalRolls;
  s.questsCompleted = 1_000;
  s.guildContribution = Math.max(s.guildContribution ?? 0, 1_000_000);
  s.lastRollAt = 0;
  s.lastSeenAt = now;
  s.lastFrenzyDate = '';
  s.lastFrenzyClaimDate = '';
  s.turboRollUntil = now + 24 * 60 * 60 * 1000;

  s.upgrades = {
    speed: 20,
    multi: 20,
    clusterRoll: 20,
    auto: 1,
    luck: 20,
    coinBonus: 20,
    shardChance: 20,
    xpBonus: 20,
    critChance: 20,
    critPower: 20,
    offlineRate: 20,
    valueBonus: 20,
  };

  for (const [id, info] of Object.entries(PRESTIGE_UPGRADES)) {
    s.prestigeUpgrades[id as keyof typeof s.prestigeUpgrades] = info.maxLevel;
  }
  for (const [id, info] of Object.entries(MASTERY_SKILLS)) {
    (s.masterySkills as Record<string, number>)[id] = info.maxLevel;
  }

  s.automations = {
    autoQuestClaim: true,
    autoStreakClaim: true,
    autoCommunityClaim: true,
    autoOfflineClaim: true,
    autoUpgrade: true,
  };

  s.activeBoosters = {
    fortune: now + 60 * 60 * 1000,
    hyperdrive: now + 60 * 60 * 1000,
    barrage: now + 60 * 60 * 1000,
    prosperity: now + 60 * 60 * 1000,
    ascension: now + 60 * 60 * 1000,
  };

  s.unlockedCosmetics = COSMETICS_LIST.map(c => c.id);
  s.activeCosmetic = s.unlockedCosmetics[0] ?? 'default';

  for (const rarity of [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000]) {
    s.collection[String(rarity)] = 1_000;
  }

  for (const quest of [...s.dailyQuests, ...s.weeklyQuests]) {
    quest.unlocked = true;
    quest.progress = quest.target;
    quest.claimed = false;
  }
}

// Read-only identity/context endpoint.
debugRouter.get('/announcement', async (_req, res) => {
  try {
    res.json(await getDeveloperAnnouncement());
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load developer announcement.' });
  }
});

debugRouter.post('/announcement', async (req, res) => {
  try {
    const announcement = await setDeveloperAnnouncement(
      String(req.body?.message ?? ''),
      context.username ?? 'Developer',
    );
    res.json({ announcement });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to update developer announcement.' });
  }
});

debugRouter.get('/guild-chat-spy', async (_req, res) => {
  try {
    res.json(await listGuildChatSpy());
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load Guild Chat spy data.' });
  }
});

debugRouter.post('/guild-chat/mute', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const userId = await resolveUserId(username);
    const mute = await muteGuildChatUser(userId, username, context.username ?? 'shadow_fen');
    res.json({ ok: true, action: 'guild-chat-mute', mute });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to mute Guild Chat user.' });
  }
});

debugRouter.post('/guild-chat/unmute', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const userId = await resolveUserId(username);
    const changed = await unmuteGuildChatUser(userId);
    res.json({ ok: true, action: 'guild-chat-unmute', username, userId, changed });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to unmute Guild Chat user.' });
  }
});

debugRouter.get('/players', async (_req, res) => {
  try {
    res.json({ players: await listPlayers() });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load player list.' });
  }
});

debugRouter.get('/player-spy', async (req, res) => {
  try {
    const username = targetUsername(req.query?.username);
    const userId = await resolveUserId(username);
    const limit = Math.max(1, Math.min(500, Math.floor(Number(req.query?.limit ?? 500) || 500)));
    const logs = await getPlayerSpyLogs(userId, limit);
    res.json({
      username,
      userId,
      logCount: logs.length,
      logs,
      generatedAt: Date.now(),
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Could not load Player Spy logs.' });
  }
});

debugRouter.post('/player-spy/clear', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const userId = await resolveUserId(username);
    await clearPlayerSpyLogs(userId);
    res.json({ ok: true, username, userId });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Could not clear Player Spy logs.' });
  }
});

debugRouter.get('/moderation/save', async (req, res) => {
  try {
    const name = targetUsername(req.query?.username);
    const userId = await resolveUserId(name);
    const generationRaw = await redis.get('player-generation:' + userId);
    const raw = await redis.get('player:' + userId);
    let save: Record<string, unknown> | null = null;
    if (raw) {
      try {
        save = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        save = null;
      }
    }
    const bans = await listGameBans();
    const ban = bans.find(entry => entry.userId === userId) ?? null;
    res.json({
      username: name,
      userId,
      generation: Number.parseInt(String(generationRaw ?? '0'), 10) || 0,
      ban,
      exists: raw != null,
      save: save
        ? {
            level: Number(save.level ?? 1),
            xp: Number(save.xp ?? 0),
            saveGeneration: Number(save.saveGeneration ?? 0),
            coins: Number(save.coins ?? 0),
            shards: Number(save.shards ?? 0),
            totalRolls: Number(save.totalRolls ?? 0),
            highestRarity: Number(save.highestRarity ?? 0),
          }
        : null,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Could not inspect player save.' });
  }
});

debugRouter.post('/moderation/hard-reset', async (req, res) => {
  try {
    const result = await wipeUser(req.body?.username);
    res.json({ ok: true, action: 'hard-reset', ...result });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Could not reset player save.' });
  }
});

debugRouter.get('/context', (_req, res) => {
  res.json({
    username: context.username ?? null,
    userId: context.userId ?? null,
    subredditName: context.subredditName ?? null,
    postId: context.postId ?? null,
  });
});

// Community event controls.
debugRouter.post('/event', async (req, res) => {
  try {
    const { goal, progress, addRolls, tier, buffMultiplier, reset } = req.body || {};
    const updated = await setCommunityEventConfig({ goal, progress, addRolls, tier, buffMultiplier, reset });
    res.json({ event: updated });
  } catch (e: any) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to update community event.' });
  }
});

// Currency controls.
debugRouter.post('/currency', async (req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const { coins = 0, shards = 0, dust = 0 } = req.body || {};
    const s = await loadRaw();
    s.coins = Math.max(0, s.coins + finiteInteger(coins));
    s.shards = Math.max(0, (s.shards ?? 0) + finiteInteger(shards));
    s.cosmicDust = Math.max(0, (s.cosmicDust ?? 0) + finiteInteger(dust));
    await save(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Set a single top-level state field, plus selected nested state groups.
// This intentionally uses an allowlist rather than Object.assign(req.body), so
// admin tooling cannot accidentally overwrite payment receipts or other metadata.
debugRouter.post('/state', async (req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const s = await loadRaw();
    const body = req.body || {};

    const numericFields = [
      'coins', 'shards', 'cosmicDust', 'xp', 'totalRolls', 'totalCrits',
      'lifetimeCoins', 'lifetimeShards', 'highestRarity', 'collectionValue',
      'lifetimeCollectionValue', 'offlineRolls', 'prestigeCount', 'rollsSinceBest',
      'turboRollUntil', 'onlinePlayers', 'purchasedShards',
      'currentRunRolls', 'questsCompleted', 'guildContribution', 'masteryPoints',
      'communityRewardClaimedAt', 'communityRewardClaimedTier',
    ];

    for (const field of numericFields) {
      if (field in body) (s as any)[field] = nonNegativeInteger(body[field]);
    }

    if ('lastRollAt' in body) {
      s.lastRollAt = body.lastRollAt === null ? null : nonNegativeInteger(body.lastRollAt);
    }
    if ('lastSeenAt' in body) s.lastSeenAt = nonNegativeInteger(body.lastSeenAt);
    for (const field of ['lastFrenzyDate', 'lastFrenzyClaimDate', 'lastDailyReset', 'lastWeeklyReset', 'lastFreeShardReset']) {
      if (typeof body[field] === 'string') (s as any)[field] = body[field];
    }

    if (body.upgrades && typeof body.upgrades === 'object') {
      for (const id of Object.keys(s.upgrades)) {
        if (id in body.upgrades) s.upgrades[id as keyof typeof s.upgrades] = nonNegativeInteger(body.upgrades[id]);
      }
    }

    if (body.prestigeUpgrades && typeof body.prestigeUpgrades === 'object') {
      for (const id of Object.keys(s.prestigeUpgrades)) {
        if (id in body.prestigeUpgrades) s.prestigeUpgrades[id as keyof typeof s.prestigeUpgrades] =
          nonNegativeInteger(body.prestigeUpgrades[id]);
      }
    }

    if (body.masterySkills && typeof body.masterySkills === 'object') {
      for (const id of Object.keys(s.masterySkills ?? {})) {
        if (id in body.masterySkills) (s.masterySkills as Record<string, number>)[id] =
          nonNegativeInteger(body.masterySkills[id]);
      }
    }

    if (body.automations && typeof body.automations === 'object') {
      s.automations = { ...(s.automations ?? {}) };
      for (const id of ['autoQuestClaim', 'autoStreakClaim', 'autoCommunityClaim', 'autoOfflineClaim', 'autoUpgrade']) {
        if (id in body.automations) s.automations[id as keyof NonNullable<typeof s.automations>] = Boolean(body.automations[id]);
      }
    }

    if (body.activeBoosters && typeof body.activeBoosters === 'object') {
      s.activeBoosters = { ...(s.activeBoosters ?? {}) };
      for (const id of ['fortune', 'hyperdrive', 'barrage', 'prosperity', 'ascension']) {
        if (id in body.activeBoosters) s.activeBoosters[id as keyof NonNullable<typeof s.activeBoosters>] =
          nonNegativeInteger(body.activeBoosters[id]);
      }
    }

    if (body.sacrifices && typeof body.sacrifices === 'object') {
      s.sacrifices = {
        coinsSacrificed: nonNegativeInteger(body.sacrifices.coinsSacrificed, s.sacrifices?.coinsSacrificed ?? 0),
        shardsSacrificed: nonNegativeInteger(body.sacrifices.shardsSacrificed, s.sacrifices?.shardsSacrificed ?? 0),
        altarLevel: nonNegativeInteger(body.sacrifices.altarLevel, s.sacrifices?.altarLevel ?? 0),
        luckSurgeUntil: nonNegativeInteger(body.sacrifices.luckSurgeUntil, s.sacrifices?.luckSurgeUntil ?? 0),
      };
    }

    if (Array.isArray(body.unlockedCosmetics)) {
      s.unlockedCosmetics = body.unlockedCosmetics.filter((v: unknown) => typeof v === 'string').slice(0, 500);
    }

    if (body.collection && typeof body.collection === 'object') {
      const next: Record<string, number> = {};
      for (const [key, value] of Object.entries(body.collection)) {
        const amount = nonNegativeInteger(value);
        if (amount > 0) next[String(key)] = amount;
      }
      s.collection = next;
    }

    if ('xp' in body) s.level = calculateLevelFromXp(s.xp).level;
    if (body.questState === 'ready') {
      for (const quest of [...s.dailyQuests, ...s.weeklyQuests]) {
        quest.unlocked = true;
        quest.progress = quest.target;
        quest.claimed = false;
      }
    }
    if (body.questState === 'reset') {
      for (const quest of [...s.dailyQuests, ...s.weeklyQuests]) {
        quest.progress = 0;
        quest.claimed = false;
      }
    }

    await save(s);
    await recordLeaderboard(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to set state.' });
  }
});

debugRouter.post('/preset', async (req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const preset = String(req.body?.preset ?? '').trim();
    const s = await loadRaw();
    const fresh = createInitialState();

    if (preset === 'fresh') {
      Object.assign(s, fresh);
      s.username = context.username ?? s.username;
    } else if (preset === 'max') {
      setMaxProgression(s);
    } else if (preset === 'frenzy-ready') {
      s.lastFrenzyDate = '';
      s.lastFrenzyClaimDate = '';
      s.lastRollAt = 0;
    } else if (preset === 'offline-ready') {
      s.offlineRolls = 1_000;
      s.lastSeenAt = Date.now();
    } else if (preset === 'quests-ready') {
      for (const quest of [...s.dailyQuests, ...s.weeklyQuests]) {
        quest.unlocked = true;
        quest.progress = quest.target;
        quest.claimed = false;
      }
    } else if (preset === 'prestige-ready') {
      s.collectionValue = Math.max(s.collectionValue, 250_000_000);
      s.lifetimeCollectionValue = Math.max(s.lifetimeCollectionValue, s.collectionValue);
      s.lastRollAt = 0;
    } else if (preset === 'booster-test') {
      const now = Date.now();
      s.activeBoosters = {
        fortune: now + 60 * 60 * 1000,
        hyperdrive: now + 60 * 60 * 1000,
        barrage: now + 60 * 60 * 1000,
        prosperity: now + 60 * 60 * 1000,
        ascension: now + 60 * 60 * 1000,
      };
      s.lastRollAt = 0;
    } else if (preset === 'upgrades-max') {
      s.upgrades = {
        speed: 20, multi: 20, clusterRoll: 20, auto: 1, luck: 20,
        coinBonus: 20, shardChance: 20, xpBonus: 20, critChance: 20,
        critPower: 20, offlineRate: 20, valueBonus: 20,
      };
    } else if (preset === 'upgrades-reset') {
      s.upgrades = {
        speed: 0, multi: 0, clusterRoll: 0, auto: 1, luck: 0,
        coinBonus: 0, shardChance: 0, xpBonus: 0, critChance: 0,
        critPower: 0, offlineRate: 0, valueBonus: 0,
      };
    } else if (preset === 'prestige-max') {
      for (const [id, info] of Object.entries(PRESTIGE_UPGRADES)) {
        s.prestigeUpgrades[id as keyof typeof s.prestigeUpgrades] = info.maxLevel;
      }
    } else if (preset === 'prestige-reset') {
      for (const id of Object.keys(s.prestigeUpgrades)) {
        s.prestigeUpgrades[id as keyof typeof s.prestigeUpgrades] = 0;
      }
    } else if (preset === 'mastery-max') {
      for (const [id, info] of Object.entries(MASTERY_SKILLS)) {
        (s.masterySkills as Record<string, number>)[id] = info.maxLevel;
      }
    } else if (preset === 'mastery-reset') {
      for (const id of Object.keys(s.masterySkills ?? {})) {
        (s.masterySkills as Record<string, number>)[id] = 0;
      }
      s.masteryPoints = 0;
    } else if (preset === 'automations-on') {
      s.automations = {
        autoQuestClaim: true, autoStreakClaim: true, autoCommunityClaim: true,
        autoOfflineClaim: true, autoUpgrade: true,
      };
    } else if (preset === 'automations-off') {
      s.automations = {};
    } else if (preset === 'boosters-off') {
      s.activeBoosters = {};
    } else if (preset === 'collection-clear') {
      s.collection = {};
      s.collectionValue = 0;
      s.highestRarity = 0;
      s.rollsSinceBest = 0;
    } else if (preset === 'quests-reset') {
      for (const quest of [...s.dailyQuests, ...s.weeklyQuests]) {
        quest.progress = 0;
        quest.claimed = false;
      }
    } else if (preset === 'streak-reset') {
      s.streak = { count: 1, lastClaimDate: '', longestStreak: 1 };
    } else if (preset === 'offline-clear') {
      s.offlineRolls = 0;
    } else {
      throw new Error('Unknown admin preset.');
    }

    await save(s);
    await recordLeaderboard(s);
    res.json({ ok: true, preset, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to apply preset.' });
  }
});

debugRouter.post('/reset-cooldown', async (_req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const s = await loadRaw();
    s.lastRollAt = 0;
    await save(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/unlock-upgrades', async (_req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const s = await loadRaw();
    s.upgrades = {
      speed: 20,
      multi: 20,
      clusterRoll: 20,
      auto: 1,
      luck: 20,
      coinBonus: 20,
      shardChance: 20,
      xpBonus: 20,
      critChance: 20,
      critPower: 20,
      offlineRate: 20,
      valueBonus: 20,
    };
    await save(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/unlock-everything', async (_req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const s = await loadRaw();
    setMaxProgression(s);
    await save(s);
    await recordLeaderboard(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to unlock everything.' });
  }
});

debugRouter.post('/add-offline', async (req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const amount = finiteInteger(req.body?.amount ?? 50);
    const s = await loadRaw();
    s.offlineRolls = Math.min(1_000, Math.max(0, (s.offlineRolls ?? 0) + amount));
    await save(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/offline-set', async (req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const s = await loadRaw();
    s.offlineRolls = Math.min(1_000, nonNegativeInteger(req.body?.amount));
    await save(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/reset-daily', async (_req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const s = await loadRaw();
    s.lastFrenzyDate = '';
    s.lastFrenzyClaimDate = '';
    s.lastDailyReset = '';
    s.lastWeeklyReset = '';
    s.lastFreeShardReset = '';
    s.streak.lastClaimDate = '';
    s.freeShardsEarnedToday = 0;
    for (const quest of [...s.dailyQuests, ...s.weeklyQuests]) {
      quest.progress = 0;
      quest.claimed = false;
    }
    await save(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/force-roll', async (req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const s = await loadRaw();
    const forcedRarity = Math.max(2, finiteInteger(req.body?.rarity, 1_000));
    const { bestOrb, batch, totalVal, coinsGained, shardsGained, xpGained } = await applyRolls(s, 1, forcedRarity);
    const now = Date.now();
    s.lastRollAt = now;
    s.lastSeenAt = now;
    await save(s);
    await recordLeaderboard(s);

    res.json({
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
    });
        });} catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/frenzy/start', async (req, res) => {
  try {
    const forcedRarity = req.body?.rarity == null ? undefined : Math.max(2, finiteInteger(req.body.rarity));
    const result = await startOrbFrenzy({ bypassDailyLimit: true, forcedRarity, adminTest: true });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to trigger admin Frenzy.' });
  }
});

debugRouter.post('/frenzy/claim', async (req, res) => {
  try {
    const postId = String(req.body?.postId ?? '').trim();
    if (!postId) throw new Error('Frenzy post ID is required.');
    res.json(await claimOrbFrenzy({ allowAdminTestOwner: true, postId }));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to claim admin Frenzy.' });
  }
});

debugRouter.post('/frenzy/reset', async (_req, res) => {
  try {
      await withPlayerMutationLock(async () => {
    const s = await loadRaw();
    s.lastFrenzyDate = '';
    s.lastFrenzyClaimDate = '';
    await save(s);
    res.json({ ok: true, state: s });
        });} catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// Game moderation. These actions affect Infinity Orbs accounts only.
// No subreddit moderation API is used here.
debugRouter.get('/moderation/banned', async (_req, res) => {
  try {
    const users = await listGameBans();
    res.json({ users });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load banned game accounts.' });
  }
});

debugRouter.post('/moderation/self-game-ban', async (req, res) => {
  try {
    if (!context.userId) throw new Error('The current game session has no user ID.');
    const durationValue = req.body?.durationDays;
    const durationDays = durationValue === '' || durationValue == null
      ? undefined
      : Math.max(1, finiteInteger(durationValue));
    const ban = await banGameUser({
      userId: context.userId,
      username: normalizeUsername(context.username),
      durationDays,
      reason: String(req.body?.reason ?? 'Self-ban test').slice(0, 300),
      bannedBy: context.username ?? 'shadow_fen',
    });
    res.json({ ok: true, action: 'self-game-ban', ban });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to ban the current game account.' });
  }
});

debugRouter.post('/moderation/ban', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const userId = await resolveUserId(username);
    const durationValue = req.body?.durationDays;
    const durationDays = durationValue === '' || durationValue == null
      ? undefined
      : Math.max(1, finiteInteger(durationValue));
    const ban = await banGameUser({
      userId,
      username,
      durationDays,
      reason: String(req.body?.reason ?? 'Game moderation action').slice(0, 300),
      bannedBy: context.username ?? 'shadow_fen',
    });
    res.json({ ok: true, action: 'game-ban', ban });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to ban game account.' });
  }
});

debugRouter.post('/moderation/unban', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const userId = await resolveUserId(username);
    const changed = await unbanGameUser(userId);
    res.json({ ok: true, action: 'game-unban', username, userId, changed });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to unban game account.' });
  }
});

debugRouter.post('/moderation/wipe-game', async (req, res) => {
  try {
    const result = await wipeUser(req.body?.username);
    res.json({ ok: true, action: 'wipe-game', ...result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to wipe player data.' });
  }
});

debugRouter.post('/moderation/wipe-and-unban', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const userId = await resolveUserId(username);
    const result = await wipeUser(username);
    await unbanGameUser(userId);
    res.json({ ok: true, action: 'wipe-and-unban', ...result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to wipe and unban game account.' });
  }
});

debugRouter.post('/moderation/wipe-and-ban', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const userId = await resolveUserId(username);
    const result = await wipeUser(username);
    const durationValue = req.body?.durationDays;
    const durationDays = durationValue === '' || durationValue == null
      ? undefined
      : Math.max(1, finiteInteger(durationValue));
    const ban = await banGameUser({
      userId,
      username,
      durationDays,
      reason: String(req.body?.reason ?? 'Game moderation action').slice(0, 300),
      bannedBy: context.username ?? 'shadow_fen',
    });
    res.json({ ok: true, action: 'wipe-and-ban', ...result, ban });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to wipe and ban game account.' });
  }
});

// Reset the current admin's save. Keep this separate from targeted wipes so the
// console's most destructive action is still obvious.
debugRouter.post('/reset-all', async (_req, res) => {
  try {
    await withPlayerMutationLock(async () => {
      const userId = String(context.userId ?? '').trim();
      if (!userId) throw new Error('REDDIT_LOGIN_REQUIRED');

      const generationKey = `player-generation:${userId}`;
      const playerKey = `player:${userId}`;
      const currentRaw = await redis.get(generationKey);
      const currentGeneration = Math.max(
        0,
        Number.parseInt(String(currentRaw ?? '0'), 10) || 0,
      );
      const generation = currentGeneration + 1;

      // Reset All is an account reset, not a normal save. Never pass a pristine
      // revision-0 state to save(), because that can only conflict with an
      // existing progressed account and can leave a stale request fighting the
      // reset. Bump the generation first so every older request becomes stale.
      const fresh = createInitialState();
      fresh.username = context.username ?? fresh.username;
      fresh.saveGeneration = generation;
      fresh.stateRevision = 0;

      await redis.set(generationKey, String(generation));
      await redis.set(playerKey, JSON.stringify(fresh));
      await redis.del(`io:roll-ticket:${userId}`);
      await removeLeaderboardEntry(fresh.username ?? context.username ?? '');

      const persisted = await redis.get(playerKey);
      if (persisted == null) {
        throw new Error('Reset failed: player save was not persisted.');
      }

      res.json({ ok: true, state: fresh });
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to reset player state.' });
  }
});
