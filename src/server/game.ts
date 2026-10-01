import { redis, context } from './devvit-mock.js';
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
  type GlobalBoosterId,
  type GlobalBoosterSnapshot,
  PREMIUM_BOOSTERS,
  AUTOMATIONS,
  GLOBAL_BOOSTERS,
  GLOBAL_BOOSTER_STACK_MS,
  GLOBAL_BOOSTER_MAX_TIER,
  createInitialGlobalBoosters,
  decayGlobalBoosterState,
  activateGlobalBoosterStack,
  globalBoosterCritChanceBonus,
  PURCHASE_PACKS,
  grantFreeShards,
  spendShards,
  resetFreeShardBudgetIfNeeded,
  isPremiumBoosterActive,
  MASTERY_SKILLS,
  masterySkillCost,
  getLevelBenefits,
} from '../shared/game.js';
import {
  contribute,
  recordLeaderboard,
  addGuildTokens,
  getPlayerGuildPerks,
  addCommunityRolls,
  getCommunityEvent,
} from './social.js';


const key = () => `player:${context.userId ?? 'unknown'}`;
const ONLINE_PLAYERS_KEY = 'io:online:players';
const ONLINE_WINDOW_MS = 30_000;

async function touchOnlinePresence(): Promise<number> {
  const userId = context.userId;
  if (!userId) return 1;
  const now = Date.now();
  await redis.zAdd(ONLINE_PLAYERS_KEY, { member: userId, score: now });
  await redis.zRemRangeByScore(ONLINE_PLAYERS_KEY, 0, now - ONLINE_WINDOW_MS);
  return Math.max(1, await redis.zCard(ONLINE_PLAYERS_KEY));
}

export async function getOnlinePlayers(): Promise<number> {
  return touchOnlinePresence();
}

const GLOBAL_BOOSTERS_KEY = 'io:world-boosters';
const FRENZY_POST_PREFIX = 'io:frenzy:post:';

function playerKeyFor(userId: string): string {
  return `player:${userId}`;
}

function normalizeGlobalBoosterSnapshot(raw: string | null, now: number): GlobalBoosterSnapshot {
  const base = createInitialGlobalBoosters(now);
  if (!raw) return base;
  let parsed: Partial<GlobalBoosterSnapshot>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  return {
    luck: decayGlobalBoosterState(parsed.luck ?? base.luck, now),
    speed: decayGlobalBoosterState(parsed.speed ?? base.speed, now),
    crit: decayGlobalBoosterState(parsed.crit ?? base.crit, now),
  };
}

export async function getGlobalBoosters(): Promise<GlobalBoosterSnapshot> {
  const now = Date.now();
  const raw = await redis.get(GLOBAL_BOOSTERS_KEY);
  const snapshot = normalizeGlobalBoosterSnapshot(raw, now);
  await redis.set(GLOBAL_BOOSTERS_KEY, JSON.stringify(snapshot));
  return snapshot;
}

async function updateGlobalBooster(id: GlobalBoosterId): Promise<GlobalBoosterSnapshot> {
  const now = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const txn = await redis.watch(GLOBAL_BOOSTERS_KEY);
    const raw = await txn.get(GLOBAL_BOOSTERS_KEY);
    const current = normalizeGlobalBoosterSnapshot(raw, now);
    current[id] = activateGlobalBoosterStack(current[id]);
    await txn.multi();
    await txn.set(GLOBAL_BOOSTERS_KEY, JSON.stringify(current));
    const committed = await txn.exec();
    if (committed !== null) return current;
  }
  throw new Error('The World Booster was activated by another player. Please try again.');
}

function paymentGoodsForSku(sku: string) {
  const pack = PURCHASE_PACKS.find(p => p.sku === sku);
  if (!pack) throw new Error('Unknown purchase product.');
  return pack;
}

export async function grantPurchasedPack(userId: string, sku: string, orderId: string): Promise<boolean> {
  const pack = paymentGoodsForSku(sku);
  const pkey = playerKeyFor(userId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const txn = await redis.watch(pkey);
    const raw = await txn.get(pkey);
    const state = raw ? JSON.parse(raw) as PlayerState : createInitialState();
    state.paymentReceipts = state.paymentReceipts ?? {};
    if (state.paymentReceipts[orderId] === 'fulfilled') {
      await txn.unwatch();
      return false;
    }
    if (state.paymentReceipts[orderId] === 'refunded') {
      await txn.unwatch();
      return false;
    }
    state.shards = (state.shards ?? 0) + pack.shards;
    state.purchasedShards = (state.purchasedShards ?? 0) + pack.shards;
    state.lifetimeShards = (state.lifetimeShards ?? 0) + pack.shards;
    state.globalBoosterCredits = (state.globalBoosterCredits ?? 0) + pack.globalBoosterCredits;
    state.paymentReceipts[orderId] = 'fulfilled';
    const receiptKeys = Object.keys(state.paymentReceipts);
    if (receiptKeys.length > 100) {
      delete state.paymentReceipts[receiptKeys[0]];
    }
    await txn.multi();
    await txn.set(pkey, JSON.stringify(state));
    const committed = await txn.exec();
    if (committed !== null) return true;
  }
  throw new Error('Could not safely fulfill the purchase. Please retry.');
}

export async function refundPurchasedPack(userId: string, sku: string, orderId: string): Promise<void> {
  const pack = paymentGoodsForSku(sku);
  const pkey = playerKeyFor(userId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const txn = await redis.watch(pkey);
    const raw = await txn.get(pkey);
    if (!raw) {
      await txn.unwatch();
      return;
    }
    const state = JSON.parse(raw) as PlayerState;
    state.paymentReceipts = state.paymentReceipts ?? {};
    const receipt = state.paymentReceipts[orderId];
    if (receipt !== 'fulfilled') {
      await txn.unwatch();
      return;
    }
    const refundableShards = Math.min(state.purchasedShards ?? 0, pack.shards);
    state.shards = Math.max(0, (state.shards ?? 0) - refundableShards);
    state.purchasedShards = Math.max(0, (state.purchasedShards ?? 0) - refundableShards);
    const refundableCredits = Math.min(state.globalBoosterCredits ?? 0, pack.globalBoosterCredits);
    state.globalBoosterCredits = Math.max(0, (state.globalBoosterCredits ?? 0) - refundableCredits);
    state.paymentReceipts[orderId] = 'refunded';
    await txn.multi();
    await txn.set(pkey, JSON.stringify(state));
    const committed = await txn.exec();
    if (committed !== null) return;
  }
  throw new Error('Could not safely process the refund.');
}

async function claimWorldBoosterActivation(
  s: PlayerState,
  id: GlobalBoosterId,
  useCredit: boolean,
): Promise<{ state: PlayerState; snapshot: GlobalBoosterSnapshot; usedCredit: boolean }> {
  const cost = GLOBAL_BOOSTERS[id].costShards;
  if (useCredit) {
    if ((s.globalBoosterCredits ?? 0) <= 0) throw new Error('No free World Booster activations remain.');
    s.globalBoosterCredits--;
  } else {
    spendShards(s, cost);
  }

  try {
    const snapshot = await updateGlobalBooster(id);
    s.globalBoosters = snapshot;
    await save(s);
    return { state: s, snapshot, usedCredit: useCredit };
  } catch (error) {
    if (useCredit) s.globalBoosterCredits = (s.globalBoosterCredits ?? 0) + 1;
    else s.shards = (s.shards ?? 0) + cost;
    throw error;
  }
}

export async function loadRaw(): Promise<PlayerState> {
  const raw = await redis.get(key());
  const username = context.username ?? `reddit-user-${(context.userId ?? 'unknown').slice(-8)}`;
  const perks = await getPlayerGuildPerks(username);
  const globalBoosters = await getGlobalBoosters();
  if (!raw) {
    const s = createInitialState();
    s.guildPerks = perks;
    s.globalBoosters = globalBoosters;
    return s;
  }
  const parsed = JSON.parse(raw) as Partial<PlayerState>;
  const base = createInitialState();
  return {
    ...base,
    ...parsed,
    upgrades: { ...base.upgrades, ...(parsed.upgrades ?? {}) },
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
    globalBoosters,
    guildPerks: perks,
  };
}

function applyXp(s: PlayerState, amount: number): void {
  const oldLevel = s.level || 1;
  s.xp += Math.max(0, Math.floor(amount));
  const levelInfo = calculateLevelFromXp(s.xp);
  s.level = levelInfo.level;
  if (s.level > oldLevel) {
    s.masteryPoints = (s.masteryPoints ?? 0) + (s.level - oldLevel);
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
        const username = context.username ?? ('reddit-user-' + (context.userId ?? 'unknown').slice(-8));
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

export async function save(s: PlayerState) {
  await redis.set(key(), JSON.stringify(s));
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
    if (type === 'unique' && q.id.includes('unique')) q.progress = Math.min(q.target, Object.keys(s.collection).length);
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
  const currentWeek = Math.floor(now / 604_800_000);
  const lastWeek = s.lastWeeklyReset ? Math.floor(new Date(s.lastWeeklyReset).getTime() / 604_800_000) : 0;
  if (currentWeek !== lastWeek) {
    s.weeklyQuests = createInitialWeeklyQuests();
    s.lastWeeklyReset = today;
  }
}

export async function applyRolls(
  s: PlayerState,
  activationCount = 1,
  forcedRarity?: number,
  source: 'online' | 'offline' = 'online'
): Promise<{ bestOrb: Orb; batch: Orb[]; totalVal: number; coinsGained: number; shardsGained: number; xpGained: number }> {
  let bestRarity = 0;
  let totalVal = 0;
  let coinsGained = 0;
  let shardsGained = 0;
  let xpGained = 0;
  const batch: Orb[] = [];
  const rarities: number[] = [];
  let rollCount = rollsPerActivation(s) * activationCount;
  const now = Date.now();
  const rng = serverRandom;

  // Astral Magnetism proc: chance for multi-rolls to pull 2 bonus orbs
  const magnetLevel = s.prestigeUpgrades?.stellarMagnet ?? 0;
  if (rollCount > 1 && magnetLevel > 0 && rng() < 0.10 * magnetLevel) {
    rollCount += 2;
  }

  const worldEvent = await getCommunityEvent();
  const communityLuck = worldEvent.buffMultiplier ?? 1.15;
  const baseLuck = luckMultiplier(s) * communityLuck;

  // Apex Fortune Mastery: chance on multi-roll to double the luck of that activation
  const apexChance = Math.min(1, (s.masterySkills?.apexFortune ?? 0) * 0.05);
  const isApex = rollCount > 1 && rng() < apexChance;
  const effectiveLuck = isApex ? baseLuck * 2 : baseLuck;

  const cm = critMultiplier(s);
  const levelBenefits = getLevelBenefits(calculateLevelFromXp(s.xp || 0).level);
  const valueMul = 1 + (s.upgrades.valueBonus ?? 0) * 0.10;

  for (let i = 0; i < rollCount; i++) {
    // Check Critical Roll (Base + Mastery + Guild perk)
    const critChance =
      (s.upgrades.critChance ?? 0) * 0.03 +
      (s.masterySkills?.critMastery ?? 0) * 0.03 +
      (s.guildPerks?.critRank ?? 0) * 0.015 +
      (s.globalBoosters?.crit ? globalBoosterCritChanceBonus(s.globalBoosters.crit) : 0);
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
    const earnedXp = Math.round(Math.min(200, 5 + Math.floor(Math.log10(rarity + 1) * 8)) * xpBonusMul);

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

  s.coins += coinsGained;
  shardsGained = grantFreeShards(s, shardsGained);

  // Ascension increases XP by 10× while preserving the existing level logic.
  const effectiveXpGained = isPremiumBoosterActive(s, 'ascension') ? xpGained * 10 : xpGained;
  s.xp += effectiveXpGained;
  xpGained = effectiveXpGained;

  // Rich EXP Level Progression
  const oldLevel = s.level || 1;
  const levelInfo = calculateLevelFromXp(s.xp);
  s.level = levelInfo.level;
  if (s.level > oldLevel) {
    const levelGained = s.level - oldLevel;
    s.masteryPoints = (s.masteryPoints ?? 0) + levelGained;
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
  advanceQuestProgress(s, 'unique', 0);

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

export async function getState(): Promise<PlayerState> {
  const s = await settleOffline(await loadRaw());
  await save(s);
  return s;
}

export const getMe = getState;

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
  const cost = upgradeCost(id, level);
  if (id === 'auto' && level === 0 && s.totalRolls < 10) {
    throw new Error('Auto Roll unlocks after 10 total rolls.');
  }
  if (!Number.isFinite(cost) || s.coins < cost) {
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
    if (id === 'auto') {
      if ((s.upgrades.auto ?? 0) === 0 && s.totalRolls >= 10 && s.coins >= AUTO_UNLOCK_COST) {
        if (AUTO_UNLOCK_COST < lowestCost) {
          lowestCost = AUTO_UNLOCK_COST;
          bestId = id;
        }
      }
      continue;
    }
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

      if (id === 'auto' && level === 0) {
        if (s.totalRolls < 10) continue;
        cost = AUTO_UNLOCK_COST;
      }

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
    const username = context.username ?? `reddit-user-${(context.userId ?? 'unknown').slice(-8)}`;
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

export async function activateGlobalBooster(id: GlobalBoosterId, useCredit = false): Promise<{ state: PlayerState; snapshot: GlobalBoosterSnapshot; usedCredit: boolean }> {
  const s = await settleOffline(await loadRaw());
  if (!GLOBAL_BOOSTERS[id]) throw new Error('Unknown World Booster.');
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

  s.shards -= info.costShards;
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

export async function startOrbFrenzy(): Promise<{ state: PlayerState; postId: string; url: string; rarity: number }> {
  const s = await settleOffline(await loadRaw());
  const today = new Date().toISOString().slice(0, 10);
  if (s.lastFrenzyDate === today) throw new Error('Orb Frenzy is already used today.');

  // A Frenzy is a single normal roll. The resulting highest orb is posted,
  // so there is no client-side choice to hide a weak result.
  const result = await applyRolls(s, 1, undefined, 'online', 1);
  const subredditName = context.subredditName;
  if (!subredditName) throw new Error('Orb Frenzy requires a Reddit post context.');

  const text = `Orb Frenzy! I rolled a 1/${result.orb.rarity.toLocaleString()} Orb. Other players can click this post once per day to unleash the Frenzy.`;
  const post = await reddit.submitCustomPost({
    runAs: 'USER',
    subredditName,
    title: `⚡ Orb Frenzy: 1/${result.orb.rarity.toLocaleString()}`,
    entry: 'frenzy',
    userGeneratedContent: { text },
  });

  const postKey = FRENZY_POST_PREFIX + post.id;
  await redis.set(postKey, JSON.stringify({
    ownerId: context.userId ?? 'unknown',
    ownerUsername: context.username ?? 'Redditor',
    rarity: result.orb.rarity,
    subredditName,
    createdAt: Date.now(),
  }));

  s.lastFrenzyDate = today;
  s.lastRollAt = Date.now();
  s.lastSeenAt = Date.now();
  s.globalBoosters = await getGlobalBoosters();
  await save(s);

  return {
    state: s,
    postId: post.id,
    rarity: result.orb.rarity,
    url: `https://reddit.com/r/${subredditName}/comments/${post.id}`,
  };
}

export async function getOrbFrenzyInfo(): Promise<{
  rarity: number;
  ownerUsername: string;
  createdAt: number;
  claimedToday: boolean;
  isOwner: boolean;
  postId: string;
}> {
  const postId = context.postId;
  if (!postId) throw new Error('This is not an Orb Frenzy post.');
  const raw = await redis.get(FRENZY_POST_PREFIX + postId);
  if (!raw) throw new Error('Orb Frenzy post data was not found.');
  const data = JSON.parse(raw) as {
    ownerId: string; ownerUsername: string; rarity: number; createdAt: number;
  };
  const today = new Date().toISOString().slice(0, 10);
  const s = await getMe();
  return {
    rarity: data.rarity,
    ownerUsername: data.ownerUsername,
    createdAt: data.createdAt,
    claimedToday: s.lastFrenzyClaimDate === today,
    isOwner: data.ownerId === (context.userId ?? 'unknown'),
    postId,
  };
}

export async function claimOrbFrenzy(): Promise<RollResponse> {
  const postId = context.postId;
  if (!postId) throw new Error('This is not an Orb Frenzy post.');
  const raw = await redis.get(FRENZY_POST_PREFIX + postId);
  if (!raw) throw new Error('Orb Frenzy post data was not found.');

  const data = JSON.parse(raw) as {
    ownerId: string;
    ownerUsername: string;
    rarity: number;
    subredditName: string;
  };

  if (data.ownerId === (context.userId ?? 'unknown')) {
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

  const globalCritChance = s.globalBoosters?.crit
    ? globalBoosterCritChanceBonus(s.globalBoosters.crit)
    : 0;
  const critChance = Math.min(
    1,
    (s.upgrades.critChance ?? 0) * 0.03 +
    (s.masterySkills?.critMastery ?? 0) * 0.03 +
    (s.guildPerks?.critRank ?? 0) * 0.015 +
    globalCritChance,
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
  const rawValue = groups.reduce(
    (sum, group) => sum + group.count * group.rarity,
    0,
  );
  const finalValue = Math.min(Number.MAX_SAFE_INTEGER, Math.round(rawValue * valueMul));

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

  const levelBenefits = getLevelBenefits(calculateLevelFromXp(s.xp || 0).level);
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
      Math.min(200, 5 + Math.floor(Math.log10(rarity + 1) * 8)) *
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
  s.coins += coinsGained;
  s.lifetimeCoins = (s.lifetimeCoins ?? 0) + coinsGained;
  s.lastFrenzyClaimDate = today;

  for (const group of groups) {
    const keyForRarity = String(group.rarity);
    s.collection[keyForRarity] = (s.collection[keyForRarity] ?? 0) + group.count;
  }

  const bestRarity = topRarity;
  s.highestRarity = Math.max(s.highestRarity, bestRarity);
  s.rollsSinceBest = bestRarity > previousHighest ? 0 : (s.rollsSinceBest ?? 0) + count;

  const oldLevel = s.level || 1;
  s.xp += xpGained;
  const newLevel = calculateLevelFromXp(s.xp).level;
  s.level = newLevel;
  if (newLevel > oldLevel) {
    s.masteryPoints = (s.masteryPoints ?? 0) + (newLevel - oldLevel);
  }

  advanceQuestProgress(s, 'roll', count);
  advanceQuestProgress(s, 'rare', bestRarity);
  advanceQuestProgress(s, 'value', finalValue);
  advanceQuestProgress(s, 'unique', 0);
  void contribute(finalValue, count);
  void addCommunityRolls(count);

  s.globalBoosters = await getGlobalBoosters();
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
