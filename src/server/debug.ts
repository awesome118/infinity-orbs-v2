import { Router } from 'express';
import {
  applyRolls,
  claimOrbFrenzy,
  loadRaw,
  save,
  startOrbFrenzy,
} from './game.js';
import { context, redis, reddit } from './devvit-mock.js';
import { setCommunityEventConfig } from './social.js';
import { cooldownMs, createInitialState, calculateLevelFromXp, COSMETICS_LIST, PRESTIGE_UPGRADES, MASTERY_SKILLS } from '../shared/game.js';
import { recordLeaderboard } from './social.js';

const DEBUG_USERS = new Set([
  'shadow_fen',
]);

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

debugRouter.get('/status', (_req, res) => {
  res.json({
    isAdmin: true,
    username: context.username ?? null,
    userId: context.userId ?? null,
    subredditName: context.subredditName ?? null,
    postId: context.postId ?? null,
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

async function currentSubreddit() {
  const name = String(context.subredditName ?? '').trim().replace(/^r\//i, '');
  if (!name) throw new Error('This admin action requires a subreddit context.');
  return reddit.getSubredditByName(name);
}

async function removeLeaderboardEntry(username: string): Promise<void> {
  const raw = await redis.get('io:leaderboard');
  if (!raw) return;
  const board = JSON.parse(raw) as Array<{ username?: string }>;
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

async function wipeUser(username: string): Promise<{ username: string; userId: string }> {
  const name = targetUsername(username);
  const userId = await resolveUserId(name);
  await redis.del(`player:${userId}`);
  await removeLeaderboardEntry(name);
  return { username: name, userId };
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
    s.masterySkills![id as keyof typeof s.masterySkills] = info.maxLevel;
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

async function setGlobalBooster(id: string, tier: number, minutes: number) {
  if (!['luck', 'speed', 'crit'].includes(id)) throw new Error('Invalid global booster.');
  const safeTier = Math.max(0, Math.min(10, nonNegativeInteger(tier, 0)));
  const remainingMs = safeTier === 0 ? 0 : Math.max(1, nonNegativeInteger(minutes, 30)) * 60_000;
  const state = {
    tier: safeTier,
    remainingMs,
    updatedAt: Date.now(),
  };
  await redis.set(`io:world-booster:${id}`, JSON.stringify(state));
  return state;
}

// Read-only identity/context endpoint.
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
    const { coins = 0, shards = 0, dust = 0 } = req.body || {};
    const s = await loadRaw();
    s.coins = Math.max(0, s.coins + finiteInteger(coins));
    s.shards = Math.max(0, (s.shards ?? 0) + finiteInteger(shards));
    s.cosmicDust = Math.max(0, (s.cosmicDust ?? 0) + finiteInteger(dust));
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Set a single top-level state field, plus selected nested state groups.
// This intentionally uses an allowlist rather than Object.assign(req.body), so
// admin tooling cannot accidentally overwrite payment receipts or other metadata.
debugRouter.post('/state', async (req, res) => {
  try {
    const s = await loadRaw();
    const body = req.body || {};

    const numericFields = [
      'coins', 'shards', 'cosmicDust', 'xp', 'totalRolls', 'totalCrits',
      'lifetimeCoins', 'lifetimeShards', 'highestRarity', 'collectionValue',
      'lifetimeCollectionValue', 'offlineRolls', 'prestigeCount', 'rollsSinceBest',
      'turboRollUntil', 'onlinePlayers', 'globalBoosterCredits', 'purchasedShards',
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
        if (id in body.masterySkills) s.masterySkills![id as keyof typeof s.masterySkills] =
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
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to set state.' });
  }
});

debugRouter.post('/preset', async (req, res) => {
  try {
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
    } else {
      throw new Error('Unknown admin preset.');
    }

    await save(s);
    await recordLeaderboard(s);
    res.json({ ok: true, preset, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to apply preset.' });
  }
});

debugRouter.post('/reset-cooldown', async (_req, res) => {
  try {
    const s = await loadRaw();
    s.lastRollAt = 0;
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/unlock-upgrades', async (_req, res) => {
  try {
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/unlock-everything', async (_req, res) => {
  try {
    const s = await loadRaw();
    setMaxProgression(s);
    await save(s);
    await recordLeaderboard(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to unlock everything.' });
  }
});

debugRouter.post('/add-offline', async (req, res) => {
  try {
    const amount = finiteInteger(req.body?.amount ?? 50);
    const s = await loadRaw();
    s.offlineRolls = Math.min(1_000, Math.max(0, (s.offlineRolls ?? 0) + amount));
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/offline-set', async (req, res) => {
  try {
    const s = await loadRaw();
    s.offlineRolls = Math.min(1_000, nonNegativeInteger(req.body?.amount));
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/reset-daily', async (_req, res) => {
  try {
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/force-roll', async (req, res) => {
  try {
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
  } catch (e: any) {
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
    const s = await loadRaw();
    s.lastFrenzyDate = '';
    s.lastFrenzyClaimDate = '';
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

debugRouter.post('/global-booster', async (req, res) => {
  try {
    const id = String(req.body?.id ?? '');
    const state = await setGlobalBooster(id, req.body?.tier, req.body?.minutes);
    res.json({ ok: true, id, state });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to set Global Booster.' });
  }
});

// Reddit moderation.
debugRouter.get('/moderation/banned', async (_req, res) => {
  try {
    const subreddit = await currentSubreddit();
    const listing = await subreddit.getBannedUsers().all();
    const users = listing.map((user: any) => ({
      username: user?.username ?? user?.name ?? null,
      id: user?.id ?? null,
    })).filter((user: any) => user.username);
    res.json({ subreddit: subreddit.name, users });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load banned users.' });
  }
});

debugRouter.post('/moderation/ban', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const durationValue = req.body?.duration;
    const duration = durationValue === '' || durationValue == null ? undefined : Math.max(0, finiteInteger(durationValue));
    const subreddit = await currentSubreddit();
    await subreddit.banUser({
      username,
      duration,
      reason: String(req.body?.reason ?? 'Infinity Orbs admin action').slice(0, 300),
      message: String(req.body?.message ?? '').slice(0, 500),
      note: String(req.body?.note ?? 'Infinity Orbs admin console').slice(0, 300),
    });
    res.json({ ok: true, action: 'ban', username, duration: duration ?? null });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to ban user.' });
  }
});

debugRouter.post('/moderation/unban', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const subreddit = await currentSubreddit();
    await subreddit.unbanUser(username);
    res.json({ ok: true, action: 'unban', username });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to unban user.' });
  }
});

debugRouter.post('/moderation/mute', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const subreddit = await currentSubreddit();
    await subreddit.muteUser(username);
    res.json({ ok: true, action: 'mute', username });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to mute user.' });
  }
});

debugRouter.post('/moderation/unmute', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const subreddit = await currentSubreddit();
    await subreddit.unmuteUser(username);
    res.json({ ok: true, action: 'unmute', username });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to unmute user.' });
  }
});

debugRouter.post('/moderation/approve', async (req, res) => {
  try {
    const username = targetUsername(req.body?.username);
    const subreddit = await currentSubreddit();
    await subreddit.approveUser(username);
    res.json({ ok: true, action: 'approve', username });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to approve user.' });
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
    const subreddit = await currentSubreddit();
    const result = await wipeUser(username);
    await subreddit.unbanUser(username);
    res.json({ ok: true, action: 'wipe-and-unban', ...result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to wipe and unban user.' });
  }
});

// Reset the current admin's save. Keep this separate from targeted wipes so the
// console's most destructive action is still obvious.
debugRouter.post('/reset-all', async (_req, res) => {
  try {
    const fresh = createInitialState();
    fresh.username = context.username ?? fresh.username;
    await save(fresh);
    await recordLeaderboard(fresh);
    res.json({ ok: true, state: fresh });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
