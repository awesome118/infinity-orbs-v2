export type UpgradeId =
  | 'speed'
  | 'multi'
  | 'clusterRoll'
  | 'auto'
  | 'luck'
  | 'coinBonus'
  | 'shardChance'
  | 'xpBonus'
  | 'critChance'
  | 'critPower'
  | 'offlineRate'
  | 'valueBonus';

export type MasterySkillId =
  | 'continuumLuck'
  | 'prosperity'
  | 'shardAttunement'
  | 'critMastery'
  | 'chronoFlow'
  | 'infiniteVault'
  | 'cosmicAttunement'
  | 'celestialSurge'
  | 'pityAccelerant'
  | 'apexFortune'
  | 'celestialVolley';

export interface MasterySkillInfo {
  name: string;
  desc: string;
  maxLevel: number;
  costMultiplier: number;
}

export const MASTERY_SKILLS: Record<MasterySkillId, MasterySkillInfo> = {
  continuumLuck: {
    name: 'Continuum Attunement',
    desc: '+10% luck multiplier per level.',
    maxLevel: 50,
    costMultiplier: 1,
  },
  prosperity: {
    name: 'Midas Touch',
    desc: '+12% coins earned per level.',
    maxLevel: 30,
    costMultiplier: 1,
  },
  shardAttunement: {
    name: 'Shard Resonance',
    desc: '+0.1% shard drop chance on rolls per level.',
    maxLevel: 25,
    costMultiplier: 2,
  },
  critMastery: {
    name: 'Critical Overdrive',
    desc: '+3% critical chance and +0.3x crit multiplier per level.',
    maxLevel: 25,
    costMultiplier: 2,
  },
  chronoFlow: {
    name: 'Chrono Flow',
    desc: '-120ms cooldown floor per level.',
    maxLevel: 20,
    costMultiplier: 2,
  },
  infiniteVault: {
    name: 'Vault Architecture',
    desc: '+200 offline roll capacity per level.',
    maxLevel: 30,
    costMultiplier: 1,
  },
  cosmicAttunement: {
    name: 'Cosmic Affinity',
    desc: '+8% cosmic dust earned on prestige per level.',
    maxLevel: 20,
    costMultiplier: 3,
  },
  celestialSurge: {
    name: 'Codex Devotion',
    desc: '+2% permanent luck for every 5 unique orbs discovered per level.',
    maxLevel: 10,
    costMultiplier: 3,
  },
  pityAccelerant: {
    name: 'Pity Calibration',
    desc: 'Pity luck meter requires 2 fewer dry rolls per level.',
    maxLevel: 5,
    costMultiplier: 4,
  },
  apexFortune: {
    name: 'Apex Fortune',
    desc: '5% chance per level on multi-rolls to double the luck of that activation.',
    maxLevel: 15,
    costMultiplier: 3,
  },
  celestialVolley: {
    name: 'Celestial Volley',
    desc: '+1 additional orb rolled per activation per level.',
    maxLevel: 5,
    costMultiplier: 4,
  },
};

export function masterySkillCost(id: MasterySkillId, currentLevel: number): number {
  const mult = MASTERY_SKILLS[id]?.costMultiplier ?? 1;
  return Math.max(1, Math.round(mult * (1 + currentLevel * 1.5)));
}

export type PremiumBoosterId =
  | 'fortune'
  | 'hyperdrive'
  | 'barrage'
  | 'prosperity'
  | 'ascension';

export type AutomationId =
  | 'autoQuestClaim'
  | 'autoStreakClaim'
  | 'autoCommunityClaim'
  | 'autoOfflineClaim'
  | 'autoUpgrade';

export interface PremiumBoosterInfo {
  name: string;
  desc: string;
  costShards: number;
  durationMs: number;
}

export const PREMIUM_BOOSTERS: Record<PremiumBoosterId, PremiumBoosterInfo> = {
  fortune: { name: 'Fortune Surge', desc: 'Multiplies Luck by 10× while active. RNG still decides every roll.', costShards: 75, durationMs: 30 * 60 * 1000 },
  hyperdrive: { name: 'Hyperdrive', desc: 'Cuts roll cooldown to 25% of its normal value while active.', costShards: 75, durationMs: 30 * 60 * 1000 },
  barrage: { name: 'Orb Barrage', desc: 'Adds 25 extra orbs to every activation while active.', costShards: 100, durationMs: 30 * 60 * 1000 },
  prosperity: { name: 'Prosperity Field', desc: 'Multiplies Coin rewards by 10× while active.', costShards: 50, durationMs: 30 * 60 * 1000 },
  ascension: { name: 'Ascension', desc: 'Multiplies roll XP by 10× while active.', costShards: 75, durationMs: 30 * 60 * 1000 },
};

export const AUTOMATIONS: Record<AutomationId, { name: string; desc: string; costShards: number }> = {
  autoQuestClaim: { name: 'Auto-Complete Quests', desc: 'Automatically claims completed daily and weekly quest rewards.', costShards: 750 },
  autoStreakClaim: { name: 'Auto-Claim Streak', desc: 'Automatically claims the daily streak reward when it becomes available.', costShards: 500 },
  autoCommunityClaim: { name: 'Auto-Claim Community Rewards', desc: 'Automatically claims each newly reached Community Reward tier.', costShards: 1_000 },
  autoOfflineClaim: { name: 'Auto-Claim Offline Rolls', desc: 'Automatically claims accumulated offline rolls when you return to the game.', costShards: 750 },
  autoUpgrade: { name: 'Auto-Complete Upgrades', desc: 'Automatically purchases one affordable standard upgrade whenever the game processes your state.', costShards: 1_500 },
};

export const FREE_SHARD_DAILY_CAP = 20;

export function todayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function resetFreeShardBudgetIfNeeded(s: PlayerState, now = Date.now()): void {
  const today = todayKey(now);
  if (s.lastFreeShardReset !== today) {
    s.lastFreeShardReset = today;
    s.freeShardsEarnedToday = 0;
  }
}

export function grantFreeShards(s: PlayerState, requested: number, now = Date.now()): number {
  resetFreeShardBudgetIfNeeded(s, now);
  const amount = Math.max(0, Math.floor(requested));
  const available = Math.max(0, FREE_SHARD_DAILY_CAP - (s.freeShardsEarnedToday ?? 0));
  const granted = Math.min(amount, available);
  if (granted > 0) {
    s.shards = (s.shards ?? 0) + granted;
    s.lifetimeShards = (s.lifetimeShards ?? 0) + granted;
    s.freeShardsEarnedToday = (s.freeShardsEarnedToday ?? 0) + granted;
  }
  return granted;
}


export function spendShards(s: PlayerState, requested: number): number {
  const amount = Math.max(0, Math.floor(requested));
  if ((s.shards ?? 0) < amount) throw new Error('Not enough Shards.');
  s.shards -= amount;
  const paidPortion = Math.min(amount, s.purchasedShards ?? 0);
  if (paidPortion > 0) s.purchasedShards = (s.purchasedShards ?? 0) - paidPortion;
  return amount;
}
export function isPremiumBoosterActive(s: PlayerState, id: PremiumBoosterId, now = Date.now()): boolean {
  return (s.activeBoosters?.[id] ?? 0) > now;
}

export function premiumBoosterRemainingMs(s: PlayerState, id: PremiumBoosterId, now = Date.now()): number {
  return Math.max(0, (s.activeBoosters?.[id] ?? 0) - now);
}

export function onlinePlayerLuckMultiplier(onlinePlayers: number): number {
  const count = Math.max(1, Math.floor(onlinePlayers));
  return Math.round((1 + Math.log2(count) * 0.10) * 100) / 100;
}

export type GlobalBoosterId = 'luck' | 'speed' | 'crit';

export interface GlobalBoosterInfo {
  name: string;
  desc: string;
  costShards: number;
}

export interface GlobalBoosterState {
  tier: number;
  remainingMs: number;
  updatedAt: number;
}

export type GlobalBoosterSnapshot = Record<GlobalBoosterId, GlobalBoosterState>;

export const GLOBAL_BOOSTER_STACK_MS = 30 * 60 * 1000;
export const GLOBAL_BOOSTER_MAX_TIER = 10;
export const GLOBAL_BOOSTER_DRAIN_MULTIPLIER = (tier: number): number =>
  Math.max(1, 1 + (Math.max(1, Math.min(GLOBAL_BOOSTER_MAX_TIER, tier)) - 1) * 0.5);

export const GLOBAL_BOOSTERS: Record<GlobalBoosterId, GlobalBoosterInfo> = {
  luck: {
    name: 'Global Luck',
    desc: 'Improves Luck for everyone.',
    costShards: 25,
  },
  speed: {
    name: 'Global Speed',
    desc: 'Reduces roll cooldown for everyone.',
    costShards: 25,
  },
  crit: {
    name: 'Global Crit',
    desc: 'Improves Crit Chance and Crit Damage for everyone.',
    costShards: 25,
  },
};

export function createInitialGlobalBoosters(now = Date.now()): GlobalBoosterSnapshot {
  return {
    luck: { tier: 0, remainingMs: 0, updatedAt: now },
    speed: { tier: 0, remainingMs: 0, updatedAt: now },
    crit: { tier: 0, remainingMs: 0, updatedAt: now },
  };
}

export function globalBoosterLuckMultiplier(state: GlobalBoosterState): number {
  if (state.tier <= 0 || state.remainingMs <= 0) return 1;
  return 1 + 0.20 * state.tier;
}

export function globalBoosterSpeedMultiplier(state: GlobalBoosterState): number {
  if (state.tier <= 0 || state.remainingMs <= 0) return 1;
  return Math.max(0.35, 1 - 0.05 * state.tier);
}

export function globalBoosterCritChanceBonus(state: GlobalBoosterState): number {
  if (state.tier <= 0 || state.remainingMs <= 0) return 0;
  return 0.02 * state.tier;
}

export function globalBoosterCritDamageBonus(state: GlobalBoosterState): number {
  if (state.tier <= 0 || state.remainingMs <= 0) return 0;
  return 0.10 * state.tier;
}

export function decayGlobalBoosterState(state: GlobalBoosterState, now = Date.now()): GlobalBoosterState {
  if (state.remainingMs <= 0 || state.tier <= 0) {
    return { tier: 0, remainingMs: 0, updatedAt: now };
  }
  const elapsed = Math.max(0, now - (state.updatedAt || now));
  const drained = state.remainingMs - elapsed * GLOBAL_BOOSTER_DRAIN_MULTIPLIER(state.tier);
  return drained <= 0
    ? { tier: 0, remainingMs: 0, updatedAt: now }
    : { ...state, remainingMs: drained, updatedAt: now };
}

export function activateGlobalBoosterStack(
  state: GlobalBoosterState,
  now = Date.now(),
): GlobalBoosterState {
  const decayed = decayGlobalBoosterState(state, now);
  let tier = decayed.tier <= 0 ? 1 : decayed.tier;
  const remainingMs = decayed.remainingMs + GLOBAL_BOOSTER_STACK_MS;

  // A stack adds exactly 30 minutes of charge. When that fills the current
  // tier's bar, the booster tiers up. Overflow carries into the new tier.
  while (tier < GLOBAL_BOOSTER_MAX_TIER && remainingMs > tier * GLOBAL_BOOSTER_STACK_MS) {
    tier++;
  }

  return {
    tier,
    remainingMs,
    updatedAt: now,
  };
}

export function globalBoosterProgress(state: GlobalBoosterState): number {
  if (state.remainingMs <= 0 || state.tier <= 0) return 0;
  const capacity = state.tier * GLOBAL_BOOSTER_STACK_MS;
  return Math.round(Math.min(1, state.remainingMs / capacity) * 100);
}

export interface PurchasePack {
  sku: string;
  name: string;
  description: string;
  priceGold: number;
  shards: number;
  globalBoosterCredits: number;
}

export const PURCHASE_PACKS: PurchasePack[] = [
  {
    sku: 'shards-100',
    name: '100 Shards + 1 Global Boost',
    description: '100 Shards and 1 free Global Booster activation.',
    priceGold: 50,
    shards: 100,
    globalBoosterCredits: 1,
  },
  {
    sku: 'shards-600',
    name: '600 Shards + 8 Global Boosts',
    description: '600 Shards and 8 free Global Booster activations.',
    priceGold: 250,
    shards: 600,
    globalBoosterCredits: 8,
  },
  {
    sku: 'shards-1400',
    name: '1,400 Shards + 20 Global Boosts',
    description: '1,400 Shards and 20 free Global Booster activations.',
    priceGold: 500,
    shards: 1_400,
    globalBoosterCredits: 20,
  },
];

export const ORB_FRENZY_DAILY_KEY_OFFSET = 0;

export type PrestigeUpgradeId =
  | 'permLuck'
  | 'permSpeed'
  | 'vaultCap'
  | 'dustBounty'
  | 'sonarPing'
  | 'instantReveal'
  | 'autoOverclock'
  | 'autoFilter'
  | 'resonanceMeter'
  | 'stellarMagnet'
  | 'chronoOverdrive'
  | 'transmutation'
  | 'shardSynthesis'
  | 'astralBarrage'
  | 'cosmicInheritance'
  | 'autoBuyer'
  | 'supernova'
  | 'altarResonator'
  | 'offlineOverdrive'
  | 'singularityTithe'
  | 'luckyFloor'
  | 'astralArsenal'
  | 'deepVault'
  | 'masteryEngine'
  | 'steadyHands'
  | 'offlineFortune'
  | 'frenzyVolley';

export interface Orb {
  rarity: number;
  rolledAt: number;
  tier: string;
  name: string;
  isNew?: boolean;
  isCrit?: boolean;
}

export interface QuestItem {
  id: string;
  title: string;
  desc: string;
  target: number;
  unlocked?: boolean;
  progress: number;
  rewardCoins: number;
  rewardShards?: number;
  rewardTokens?: number;
  rewardXp?: number;
  claimed: boolean;
}

export interface PlayerStreak {
  count: number;
  lastClaimDate: string; // YYYY-MM-DD
  longestStreak: number;
}

export interface PlayerState {
  username?: string;
  gameBan?: {
    active: true;
    bannedAt: number;
    bannedUntil: number | null;
    reason: string;
  };
  coins: number;
  shards: number;
  cosmicDust: number;
  level: number;
  xp: number;
  totalRolls: number;
  totalCrits: number;
  lifetimeCoins: number;
  lifetimeShards: number;
  highestRarity: number;
  collectionValue: number;
  lifetimeCollectionValue: number;
  collection: Record<string, number>;
  collectionCount?: number;
  lastRollAt: number | null;
  lastSeenAt: number;
  offlineRolls: number;
  claimedAchievements: string[];
  upgrades: Record<UpgradeId, number>;
  prestigeCount: number;
  prestigeUpgrades: Record<PrestigeUpgradeId, number>;
  streak: PlayerStreak;
  dailyQuests: QuestItem[];
  weeklyQuests: QuestItem[];
  lastDailyReset: string;
  lastWeeklyReset: string;
  rollsSinceBest: number;
  activeCosmetic: string;
  unlockedCosmetics: string[];
  turboRollUntil: number; // timestamp
  activeBoosters?: Partial<Record<PremiumBoosterId, number>>;
  automations?: Partial<Record<AutomationId, boolean>>;
  onlinePlayers?: number;
  communityRewardClaimedAt?: number;
  freeShardsEarnedToday?: number;
  lastFreeShardReset?: string;
  globalBoosterCredits?: number;
  purchasedShards?: number;
  globalBoosters?: GlobalBoosterSnapshot;
  lastFrenzyDate?: string;
  lastFrenzyClaimDate?: string;
  communityRewardClaimedTier?: number;
  paymentReceipts?: Record<string, 'fulfilled' | 'refunded'>;
  currentRunRolls?: number;
  questsCompleted?: number;
  guildContribution?: number;
  sacrifices?: {
    coinsSacrificed: number;
    shardsSacrificed: number;
    altarLevel: number;
    luckSurgeUntil?: number; // timestamp
  };
  masteryPoints?: number;
  masterySkills?: Record<MasterySkillId, number>;
  socialActivityDate?: string;
  lastShareAt?: number;
  guildPerks?: {
    luckRank: number;
    speedRank: number;
    vaultRank: number;
    shardRank?: number;
    critRank?: number;
    coinRank?: number;
  };
}

export interface RollResponse {
  orb: Orb;
  batch: Orb[];
  totalValueGained: number;
  totalRollValue: number;
  coinsGained: number;
  shardsGained: number;
  xpGained: number;
  state: PlayerState;
  rollsRemainingUntilNext: number;
  dramaticReveal: boolean;
  frenzyCount?: number;
}

export type RarityTierName =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Epic'
  | 'Legendary'
  | 'Mythic'
  | 'Relic'
  | 'Divine'
  | 'Transcendent';

export interface RarityTierInfo {
  rarity: number;
  name: string;
  tier: RarityTierName;
  approxChance: string;
  color: string;
  bgGradient: string;
}

export function getOrbTier(rarity: number): RarityTierName {
  if (rarity >= 100_000_000) return 'Transcendent';
  if (rarity >= 10_000_000) return 'Divine';
  if (rarity >= 1_000_000) return 'Relic';
  if (rarity >= 100_000) return 'Mythic';
  if (rarity >= 10_000) return 'Legendary';
  if (rarity >= 1_000) return 'Epic';
  if (rarity >= 100) return 'Rare';
  if (rarity >= 10) return 'Uncommon';
  return 'Common';
}

const TIER_NAMES: Record<RarityTierName, string[]> = {
  Common: ['Spark Orb', 'Mist Orb', 'Pebble Orb', 'Ember Orb', 'Dew Orb', 'Echo Orb'],
  Uncommon: ['Tide Orb', 'Vapor Orb', 'Gale Orb', 'Frost Orb', 'Amethyst Orb', 'Verdant Orb'],
  Rare: ['Chrono Orb', 'Prism Orb', 'Thunder Orb', 'Aurora Orb', 'Plasma Orb', 'Quartz Orb'],
  Epic: ['Aether Orb', 'Solaris Orb', 'Eclipse Orb', 'Radiant Orb', 'Abyssal Orb', 'Inferno Orb'],
  Legendary: ['Nova Orb', 'Starlight Orb', 'Quasar Orb', 'Vortex Orb', 'Nebula Orb', 'Supernova Orb'],
  Mythic: ['Singularity Orb', 'Cosmic Core Orb', 'Hypernova Orb', 'Dark Star Orb', 'Astral Rift Orb'],
  Relic: ['Infinite Relic', 'Omega Fragment', 'Primordial Core', 'Eternal Horizon', 'Void Monolith'],
  Divine: ['Divine Eternity', 'Celestial Pantheon', 'Omnipresent Eye', 'Seraphic Sphere'],
  Transcendent: ['The Absolute Zero', 'Infinity Point', 'Cosmic Monolith', 'Genesis Void'],
};

const TIER_COLORS: Record<RarityTierName, { color: string; bgGradient: string }> = {
  Common: {
    color: '#94a3b8',
    bgGradient: 'radial-gradient(circle at 35% 30%, #cbd5e1, #64748b 60%, #1e293b)',
  },
  Uncommon: {
    color: '#38bdf8',
    bgGradient: 'radial-gradient(circle at 35% 30%, #7dd3fc, #0284c7 60%, #0c4a6e)',
  },
  Rare: {
    color: '#c084fc',
    bgGradient: 'radial-gradient(circle at 35% 30%, #d8b4fe, #9333ea 60%, #581c87)',
  },
  Epic: {
    color: '#fb923c',
    bgGradient: 'radial-gradient(circle at 35% 30%, #fed7aa, #ea580c 60%, #7c2d12)',
  },
  Legendary: {
    color: '#4ade80',
    bgGradient: 'radial-gradient(circle at 35% 30%, #86efac, #16a34a 60%, #14532d)',
  },
  Mythic: {
    color: '#a855f7',
    bgGradient: 'radial-gradient(circle at 35% 30%, #d8b4fe, #7e22ce 60%, #3b0764)',
  },
  Relic: {
    color: '#f59e0b',
    bgGradient: 'radial-gradient(circle at 35% 30%, #fde68a, #d97706 60%, #451a03)',
  },
  Divine: {
    color: '#38bdf8',
    bgGradient: 'radial-gradient(circle at 35% 30%, #e0f2fe, #0284c7 40%, #4f46e5 80%)',
  },
  Transcendent: {
    color: '#ffffff',
    bgGradient: 'radial-gradient(circle at 35% 30%, #ffffff, #a855f7 35%, #06b6d4 70%, #030712 100%)',
  },
};

export function getOrbInfo(rarity: number): RarityTierInfo {
  const tier = getOrbTier(rarity);
  const names = TIER_NAMES[tier];
  const name = names[Math.abs(Math.floor(rarity)) % names.length];
  const { color, bgGradient } = TIER_COLORS[tier];

  return {
    rarity,
    name,
    tier,
    approxChance: `1 / ${rarity.toLocaleString()}`,
    color,
    bgGradient,
  };
}

/**
 * Continuous Rarity Distribution (Continuum RNG)
 * P(R >= r) = (2 * luck) / r
 * Generates dynamic, exciting varieties of orbs at all luck stages,
 * without clustering 33% of rolls on 1/2.
 */
export function rollContinuum(luck: number, random: () => number = Math.random): number {
  // Pareto distribution with P(R >= r) = (2 * luck) / r.
  // This matches the displayed tier odds and, critically, does not collapse most rolls to 1/2.
  const u = Math.max(1e-12, Math.min(1 - 1e-12, random()));
  const effectiveLuck = Math.max(1, luck);
  const rarity = Math.floor((2 * effectiveLuck) / u);
  return Math.min(10_000_000_000, Math.max(2, rarity));
}

export interface ContinuumTierMilestone {
  tier: RarityTierName;
  minRarity: number;
  label: string;
  approxChance: string;
  coinsPerOrb: string;
  color: string;
}

export const CONTINUUM_TIERS: ContinuumTierMilestone[] = [
  { tier: 'Common', minRarity: 2, label: '1 / 2 - 1 / 9', approxChance: '~80.0%', coinsPerOrb: '2 - 9 Coins', color: '#94a3b8' },
  { tier: 'Uncommon', minRarity: 10, label: '1 / 10 - 1 / 99', approxChance: '~18.0%', coinsPerOrb: '10 - 99 Coins', color: '#38bdf8' },
  { tier: 'Rare', minRarity: 100, label: '1 / 100 - 1 / 999', approxChance: '~1.8%', coinsPerOrb: '100 - 999 Coins', color: '#c084fc' },
  { tier: 'Epic', minRarity: 1000, label: '1 / 1,000 - 1 / 9,999', approxChance: '~0.18%', coinsPerOrb: '1,000 - 9,999 Coins', color: '#fb923c' },
  { tier: 'Legendary', minRarity: 10000, label: '1 / 10,000 - 1 / 99,999', approxChance: '~0.018%', coinsPerOrb: '10,000 - 99,999 Coins', color: '#4ade80' },
  { tier: 'Mythic', minRarity: 100000, label: '1 / 100,000 - 1 / 999,999', approxChance: '~0.0018%', coinsPerOrb: '100,000 - 999,999 Coins', color: '#a855f7' },
  { tier: 'Relic', minRarity: 1000000, label: '1 / 1,000,000 - 1 / 9,999,999', approxChance: '~0.00018%', coinsPerOrb: '1,000,000 - 9,999,999 Coins', color: '#f59e0b' },
  { tier: 'Divine', minRarity: 10000000, label: '1 / 10,000,000 - 1 / 99,999,999', approxChance: '~0.000018%', coinsPerOrb: '10,000,000 - 99,999,999 Coins', color: '#38bdf8' },
  { tier: 'Transcendent', minRarity: 100000000, label: '1 / 100,000,000+', approxChance: '~0.000002%', coinsPerOrb: '100,000,000+ Coins', color: '#ffffff' },
];

export interface CosmeticItem {
  id: string;
  name: string;
  desc: string;
  costCoins: number;
  costShards: number;
}

export const COSMETICS_LIST: CosmeticItem[] = [
  { id: 'default', name: 'Classic', desc: 'Default orb skin.', costCoins: 0, costShards: 0 },
  { id: 'galaxy', name: 'Galaxy', desc: 'Galaxy orb skin.', costCoins: 1000, costShards: 0 },
  { id: 'solar', name: 'Solar', desc: 'Solar orb skin.', costCoins: 5000, costShards: 5 },
  { id: 'cyber', name: 'Cyber', desc: 'Cyberpunk orb skin.', costCoins: 15000, costShards: 15 },
  { id: 'emerald', name: 'Emerald', desc: 'Emerald orb skin.', costCoins: 50000, costShards: 30 },
  { id: 'divine', name: 'Prismatic', desc: 'Prismatic orb skin.', costCoins: 250000, costShards: 100 },
];

export const COSMETICS = COSMETICS_LIST;

export interface PrestigeUpgradeInfo {
  name: string;
  desc: string;
  category: 'core' | 'qol' | 'alchemy';
  maxLevel: number;
  costPerLevel: number;
  qol?: boolean;
}

export const PRESTIGE_UPGRADES: Record<PrestigeUpgradeId, PrestigeUpgradeInfo> = {
  permLuck: {
    name: 'Permanent Luck',
    desc: '+10% luck multiplier per level.',
    category: 'core',
    maxLevel: 10,
    costPerLevel: 2,
  },
  permSpeed: {
    name: 'Permanent Speed Floor',
    desc: '-300ms cooldown floor per level.',
    category: 'core',
    maxLevel: 5,
    costPerLevel: 3,
  },
  vaultCap: {
    name: 'Vault Expansion',
    desc: '+250 offline roll capacity per level.',
    category: 'core',
    maxLevel: 5,
    costPerLevel: 1,
  },
  dustBounty: {
    name: 'Cosmic Dust Bounty',
    desc: '+15% Cosmic Dust from prestige per level.',
    category: 'core',
    maxLevel: 5,
    costPerLevel: 5,
  },
  sonarPing: {
    name: 'Silent Alert Mode',
    desc: 'Mute normal rolls. Play audio alert on Rare+ orbs.',
    category: 'qol',
    maxLevel: 1,
    costPerLevel: 2,
    qol: true,
  },
  instantReveal: {
    name: 'Skip Animations',
    desc: 'Skip roll animation delays.',
    category: 'qol',
    maxLevel: 1,
    costPerLevel: 2,
    qol: true,
  },
  autoOverclock: {
    name: 'Auto-Roll Speed',
    desc: 'Auto-roll cooldown is 5% shorter per level.',
    category: 'qol',
    maxLevel: 5,
    costPerLevel: 2,
    qol: true,
  },
  autoFilter: {
    name: 'Common Salvage',
    desc: '+25% coins from Common and Uncommon rolls.',
    category: 'qol',
    maxLevel: 1,
    costPerLevel: 3,
    qol: true,
  },
  resonanceMeter: {
    name: 'Dry Streak Luck',
    desc: '+2% luck per stack for dry streaks; stacks begin every 18 rolls.',
    category: 'qol',
    maxLevel: 3,
    costPerLevel: 3,
    qol: true,
  },
  stellarMagnet: {
    name: 'Multi-Roll Extra',
    desc: '10% chance per level to roll +2 extra orbs on multi-roll.',
    category: 'core',
    maxLevel: 5,
    costPerLevel: 3,
  },
  chronoOverdrive: {
    name: 'Turbo Duration',
    desc: 'Turbo lasts 60m with 30% cooldown reduction.',
    category: 'alchemy',
    maxLevel: 2,
    costPerLevel: 4,
    qol: true,
  },
  transmutation: {
    name: 'Transmutation',
    desc: '+15% coins and 1% shard chance on low rarity rolls per level.',
    category: 'alchemy',
    maxLevel: 5,
    costPerLevel: 3,
  },
  shardSynthesis: {
    name: 'Dust Synthesis',
    desc: 'Convert 10 Shards into 1 Cosmic Dust.',
    category: 'alchemy',
    maxLevel: 1,
    costPerLevel: 4,
    qol: true,
  },
  astralBarrage: {
    name: 'Astral Barrage',
    desc: '+1 permanent extra orb rolled per activation per level.',
    category: 'core',
    maxLevel: 5,
    costPerLevel: 4,
  },
  cosmicInheritance: {
    name: 'Cosmic Inheritance',
    desc: 'Keep 10% of Coins and Shards through prestige per level.',
    category: 'alchemy',
    maxLevel: 5,
    costPerLevel: 3,
    qol: true,
  },
  autoBuyer: {
    name: 'Celestial Auto-Buyer',
    desc: 'Automatically purchases cheapest affordable standard upgrade on roll.',
    category: 'qol',
    maxLevel: 1,
    costPerLevel: 5,
    qol: true,
  },
  supernova: {
    name: 'Supernova Burst',
    desc: 'Critical rolls have a 10% chance per level to trigger a 5x Supernova multiplier.',
    category: 'core',
    maxLevel: 5,
    costPerLevel: 3,
  },
  altarResonator: {
    name: 'Altar Resonator',
    desc: '+25% greater luck multiplier from Altar sacrifices per level.',
    category: 'alchemy',
    maxLevel: 4,
    costPerLevel: 3,
  },
  offlineOverdrive: {
    name: 'Offline Overdrive',
    desc: 'Offline rolls generate 50% faster and grant 50% more Coins per level.',
    category: 'qol',
    maxLevel: 3,
    costPerLevel: 3,
    qol: true,
  },
  singularityTithe: {
    name: 'Singularity Tithe',
    desc: 'Passively generate +1 Cosmic Dust every 200 rolls per level.',
    category: 'alchemy',
    maxLevel: 3,
    costPerLevel: 5,
  },
  luckyFloor: {
    name: 'Lucky Floor',
    desc: '+1 minimum orb rarity per level.',
    category: 'core',
    maxLevel: 10,
    costPerLevel: 3,
  },
  astralArsenal: {
    name: 'Astral Arsenal',
    desc: '+1 orb per activation per level.',
    category: 'core',
    maxLevel: 5,
    costPerLevel: 5,
  },
  deepVault: {
    name: 'Deep Vault',
    desc: '+250 offline roll capacity per level.',
    category: 'qol',
    maxLevel: 5,
    costPerLevel: 2,
    qol: true,
  },
  masteryEngine: {
    name: 'Mastery Engine',
    desc: 'Gain +1 Mastery Point every 100 rolls per level.',
    category: 'core',
    maxLevel: 5,
    costPerLevel: 4,
  },
  steadyHands: {
    name: 'Steady Hands',
    desc: '-100ms cooldown floor per level.',
    category: 'qol',
    maxLevel: 5,
    costPerLevel: 3,
    qol: true,
  },
  frenzyVolley: {
    name: 'Frenzy Volley',
    desc: 'Very high-tier upgrade: every additional multiball counts at 20% efficiency during Orb Frenzy.',
    category: 'core',
    maxLevel: 1,
    costPerLevel: 2500,
    qol: true,
  },
  offlineFortune: {
    name: 'Offline Fortune',
    desc: '+25% offline Coins per level.',
    category: 'qol',
    maxLevel: 4,
    costPerLevel: 3,
    qol: true,
  },
};

export function createInitialDailyQuests(): QuestItem[] {
  return [
    { id: 'daily-rolls-25', title: 'Roll 25 Times', desc: 'Perform 25 rolls', target: 25, progress: 0, rewardCoins: 100, rewardXp: 50, claimed: false },
    { id: 'daily-rolls-100', title: 'Roll 100 Times', desc: 'Perform 100 rolls', target: 100, progress: 0, rewardCoins: 500, rewardShards: 1, rewardXp: 150, claimed: false },
    { id: 'daily-rare-100', title: 'Find Rare Orb', desc: 'Obtain an orb with 1/100+ rarity', target: 1, progress: 0, rewardCoins: 300, rewardXp: 100, claimed: false },
    { id: 'daily-unique-3', title: 'Unique Orbs', desc: 'Obtain 3 unique orbs today', target: 3, progress: 0, rewardCoins: 200, rewardXp: 80, claimed: false },
    { id: 'daily-social', title: 'Guild Activity', desc: 'View guild or leaderboard', target: 1, progress: 0, rewardCoins: 150, rewardTokens: 10, rewardXp: 50, claimed: false },
  ];
}

export function createInitialWeeklyQuests(): QuestItem[] {
  return [
    { id: 'weekly-grind', title: 'Weekly Rolls', desc: 'Perform 1,000 rolls this week', target: 1000, progress: 0, rewardCoins: 5000, rewardShards: 5, rewardXp: 600, claimed: false },
    { id: 'weekly-epic', title: 'Find Epic Orb', desc: 'Obtain an Epic orb (1/1,000+)', target: 1, progress: 0, rewardCoins: 3000, rewardShards: 3, rewardXp: 400, claimed: false },
    { id: 'weekly-guild', title: 'Collection Value', desc: 'Contribute 10,000 collection value', target: 10000, progress: 0, rewardCoins: 4000, rewardTokens: 50, rewardXp: 500, claimed: false },
    { id: 'weekly-share', title: 'Share Post', desc: 'Share an orb to Reddit after discovering a Rare+ orb.', target: 1, progress: 0, rewardCoins: 1500, rewardShards: 2, rewardXp: 200, claimed: false, unlocked: false },
  ];
}

export function createInitialState(now = Date.now()): PlayerState {
  const today = new Date(now).toISOString().slice(0, 10);
  return {
    coins: 50,
    shards: 5,
    cosmicDust: 0,
    level: 1,
    xp: 0,
    totalRolls: 0,
    totalCrits: 0,
    lifetimeCoins: 50,
    lifetimeShards: 5,
    highestRarity: 0,
    collectionValue: 0,
    lifetimeCollectionValue: 0,
    collection: {},
    lastRollAt: null,
    lastSeenAt: now,
    offlineRolls: 0,
    claimedAchievements: [],
    upgrades: {
      speed: 0,
      multi: 0,
      clusterRoll: 0,
      auto: 0,
      luck: 0,
      coinBonus: 0,
      shardChance: 0,
      xpBonus: 0,
      critChance: 0,
      critPower: 0,
      offlineRate: 0,
      valueBonus: 0,
    },
    prestigeCount: 0,
    prestigeUpgrades: {
      permLuck: 0,
      permSpeed: 0,
      vaultCap: 0,
      dustBounty: 0,
      sonarPing: 0,
      instantReveal: 0,
      autoOverclock: 0,
      autoFilter: 0,
      resonanceMeter: 0,
      stellarMagnet: 0,
      chronoOverdrive: 0,
      transmutation: 0,
      shardSynthesis: 0,
      astralBarrage: 0,
      cosmicInheritance: 0,
      autoBuyer: 0,
      supernova: 0,
      altarResonator: 0,
      offlineOverdrive: 0,
      singularityTithe: 0,
      luckyFloor: 0,
      astralArsenal: 0,
      deepVault: 0,
      masteryEngine: 0,
      steadyHands: 0,
      offlineFortune: 0,
      frenzyVolley: 0,
    },
    streak: { count: 1, lastClaimDate: '', longestStreak: 1 },
    dailyQuests: createInitialDailyQuests(),
    weeklyQuests: createInitialWeeklyQuests(),
    lastDailyReset: today,
    lastWeeklyReset: today,
    rollsSinceBest: 0,
    activeCosmetic: 'default',
    unlockedCosmetics: ['default'],
    turboRollUntil: 0,
    activeBoosters: {},
    automations: {},
    onlinePlayers: 1,
    communityRewardClaimedAt: 0,
    freeShardsEarnedToday: 0,
    lastFreeShardReset: today,
    globalBoosterCredits: 0,
    purchasedShards: 0,
    globalBoosters: createInitialGlobalBoosters(now),
    lastFrenzyDate: '',
    lastFrenzyClaimDate: '',
    communityRewardClaimedTier: 0,
    currentRunRolls: 0,
    questsCompleted: 0,
    guildContribution: 0,
    sacrifices: {
      coinsSacrificed: 0,
      shardsSacrificed: 0,
      altarLevel: 0,
      luckSurgeUntil: 0,
    },
    masteryPoints: 0,
    masterySkills: {
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
    },
    guildPerks: { luckRank: 0, speedRank: 0, vaultRank: 0 },
  };
}

// Level Progression and Milestones System
export interface LevelMilestonePerk {
  level: number;
  name: string;
  desc: string;
  bonusBalls?: number;
  bonusLuckMultiplier?: number;
  bonusCoinsMultiplier?: number;
  bonusXpMultiplier?: number;
  bonusShardChance?: number;
}

export const LEVEL_MILESTONES: LevelMilestonePerk[] = [
  { level: 5, name: 'Novice Seeker', desc: '+15% XP earned on all rolls', bonusXpMultiplier: 1.15 },
  { level: 10, name: 'Shard Sifter', desc: '+5% chance for bonus Shards', bonusShardChance: 0.05 },
  { level: 15, name: 'Chrono Adept', desc: 'Cooldown floor reduced by 150ms' },
  { level: 20, name: 'Alchemical Affinity', desc: 'Altar Sacrifices are 15% more potent' },
  { level: 25, name: 'Twin Orb Conductor', desc: '+1 Extra Orb per activation!', bonusBalls: 1 },
  { level: 35, name: "Fortune's Blessing", desc: '1.20× Multiplicative Luck boost!', bonusLuckMultiplier: 1.20 },
  { level: 50, name: 'Orb Titan', desc: '+1 Extra Orb per activation & 1.30× Coins!', bonusBalls: 1, bonusCoinsMultiplier: 1.30 },
  { level: 75, name: 'Astral Conduit', desc: '1.35× Multiplicative Luck boost!', bonusLuckMultiplier: 1.35 },
  { level: 100, name: 'Transcendent Paragon', desc: '+2 Extra Orbs per activation & 1.50× Luck boost!', bonusBalls: 2, bonusLuckMultiplier: 1.50 },
  { level: 150, name: 'Grand Conductor', desc: '+2 Extra Orbs per activation & +20% XP!', bonusBalls: 2, bonusXpMultiplier: 1.20 },
  { level: 200, name: 'Void Fortune', desc: '1.50× Multiplicative Luck boost!', bonusLuckMultiplier: 1.50 },
  { level: 300, name: 'Golden Age', desc: '1.50× Multiplicative Coin boost!', bonusCoinsMultiplier: 1.50 },
  { level: 400, name: 'Orb Battalion', desc: '+2 Extra Orbs per activation!', bonusBalls: 2 },
  { level: 500, name: 'Astral Zenith', desc: '1.75× Luck and +10% Shard Chance!', bonusLuckMultiplier: 1.75, bonusShardChance: 0.10 },
  { level: 750, name: 'Infinite Arsenal', desc: '+3 Extra Orbs per activation!', bonusBalls: 3 },
  { level: 1000, name: 'Infinity Master', desc: '2.00× Luck and 2.00× Coins!', bonusLuckMultiplier: 2.00, bonusCoinsMultiplier: 2.00 },
];

export function xpRequiredForLevel(level: number): number {
  return Math.floor(100 * Math.pow(Math.max(1, level), 1.35));
}

export interface LevelBenefits {
  bonusBalls: number;
  luckMultiplier: number;
  coinsMultiplier: number;
  xpMultiplier: number;
  shardChance: number;
  cooldownReductionMs: number;
  altarEffectMultiplier: number;
}

export function getLevelBenefits(level: number): LevelBenefits {
  let bonusBalls = 0;
  let luckMultiplier = 1 + Math.max(0, level - 1) * 0.015;
  let coinsMultiplier = 1 + Math.max(0, level - 1) * 0.03;
  let xpMultiplier = 1;
  let shardChance = 0;
  let cooldownReductionMs = 0;
  let altarEffectMultiplier = 1;

  for (const milestone of LEVEL_MILESTONES) {
    if (level < milestone.level) continue;
    bonusBalls += milestone.bonusBalls ?? 0;
    luckMultiplier *= milestone.bonusLuckMultiplier ?? 1;
    coinsMultiplier *= milestone.bonusCoinsMultiplier ?? 1;
    xpMultiplier *= milestone.bonusXpMultiplier ?? 1;
    shardChance += milestone.bonusShardChance ?? 0;
    if (milestone.level === 15) cooldownReductionMs += 150;
    if (milestone.level === 20) altarEffectMultiplier *= 1.15;
  }

  return {
    bonusBalls,
    luckMultiplier,
    coinsMultiplier,
    xpMultiplier,
    shardChance,
    cooldownReductionMs,
    altarEffectMultiplier,
  };
}

export function calculateLevelFromXp(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
} {
  let lvl = 1;
  let accumulated = 0;
  while (true) {
    const req = xpRequiredForLevel(lvl);
    if (totalXp < accumulated + req) {
      const currentLevelXp = Math.max(0, totalXp - accumulated);
      const progressPercent = Math.min(100, Math.round((currentLevelXp / req) * 100));
      return { level: lvl, currentLevelXp, nextLevelXp: req, progressPercent };
    }
    accumulated += req;
    lvl++;
    if (lvl > 1000) break;
  }
  return { level: lvl, currentLevelXp: 0, nextLevelXp: 1000, progressPercent: 100 };
}

// Altar Multipliers: Coin and Shard multipliers are MULTIPLICATIVE with each other!
export function calculateAltarMultipliers(s: PlayerState): {
  coinMultiplier: number;
  shardMultiplier: number;
  surgeMultiplier: number;
  totalAltarMultiplier: number;
} {
  const sacrifices = s.sacrifices ?? { coinsSacrificed: 0, shardsSacrificed: 0, altarLevel: 0 };
  const resonatorBonus = 1 + (s.prestigeUpgrades?.altarResonator ?? 0) * 0.25;

  // Coin devotion: scales smoothly with altar level and log of sacrificed coins
  const altarEffectMultiplier = getLevelBenefits(calculateLevelFromXp(s.xp || 0).level).altarEffectMultiplier;
  const coinDevotion =
    (sacrifices.altarLevel * 0.08 +
      Math.min(5, Math.log10(1 + (sacrifices.coinsSacrificed || 0) / 250) * 0.35)) *
    altarEffectMultiplier;
  const coinMultiplier = 1 + coinDevotion * resonatorBonus;

  // Shard devotion: 6% luck per shard sacrificed
  const shardDevotion = (s.sacrifices?.shardsSacrificed || 0) * 0.06 * altarEffectMultiplier;
  const shardMultiplier = 1 + shardDevotion * resonatorBonus;

  // Surge multiplier: 1.5x during active surge
  const isSurgeActive = Boolean(sacrifices.luckSurgeUntil && Date.now() < sacrifices.luckSurgeUntil);
  const surgeMultiplier = isSurgeActive ? 1.50 : 1.0;

  // Multiplicative with each other!
  const totalAltarMultiplier = Math.round(coinMultiplier * shardMultiplier * surgeMultiplier * 100) / 100;

  return {
    coinMultiplier: Math.round(coinMultiplier * 100) / 100,
    shardMultiplier: Math.round(shardMultiplier * 100) / 100,
    surgeMultiplier,
    totalAltarMultiplier,
  };
}

// Roll speed is deliberately a long-term investment: 20 levels, 150ms per level,
 // for a maximum 3.0s reduction from this run upgrade.
export const BASE_COOLDOWN_MS = 15_000;
export const AUTO_UNLOCK_COST = 200;
export const MAX_OFFLINE_ROLLS = 1_000;
export const OFFLINE_TICK_MS = 60_000; // 1 offline roll every 60 seconds

export const SHARD_SYNTHESIS_COST = 10;

export function effectiveOfflineTickMs(s: PlayerState): number {
  const rateReduction = (s.upgrades.offlineRate ?? 0) * 0.08;
  const overdriveMul = 1 + (s.prestigeUpgrades?.offlineOverdrive ?? 0) * 0.50;
  const premiumOfflineMul = isPremiumBoosterActive(s, 'hyperdrive') ? 0.75 : 1;
  return Math.max(10_000, Math.round((OFFLINE_TICK_MS / overdriveMul) * premiumOfflineMul * (1 - Math.min(0.6, rateReduction))));
}

export function critMultiplier(s: PlayerState): number {
  const masteryCritPower = (s.masterySkills?.critMastery ?? 0) * 0.30;
  const globalCrit = s.globalBoosters?.crit;
  return 2.0 + (s.upgrades.critPower ?? 0) * 0.25 + masteryCritPower +
    (globalCrit ? globalBoosterCritDamageBonus(globalCrit) : 0);
}

export function cooldownMs(s: PlayerState, isAuto = false): number {
  const permReduction = (s.prestigeUpgrades?.permSpeed ?? 0) * 300;
  const guildSpeedReduction = (s.guildPerks?.speedRank ?? 0) * 100;
  const masteryChronoReduction = (s.masterySkills?.chronoFlow ?? 0) * 120;
  const steadyHandsReduction = (s.prestigeUpgrades?.steadyHands ?? 0) * 100;
  const levelBenefits = getLevelBenefits(calculateLevelFromXp(s.xp || 0).level);
  const levelReduction = levelBenefits.cooldownReductionMs;

  // Roll speed: 20 levels × 150ms = 3.0s total maximum reduction.
  const speedLevel = Math.min(20, Math.max(0, s.upgrades.speed ?? 0));
  const coinReduction = speedLevel * 150;

  const floor = Math.max(800, 2000 - permReduction - guildSpeedReduction - masteryChronoReduction - steadyHandsReduction - levelReduction);
  let cd = Math.max(floor, BASE_COOLDOWN_MS - coinReduction);

  if (isAuto && (s.prestigeUpgrades?.autoOverclock ?? 0) > 0) {
    const overclockFactor = 1 - (s.prestigeUpgrades.autoOverclock * 0.05);
    cd = Math.max(700, Math.round(cd * overclockFactor));
  }
  if (s.turboRollUntil && Date.now() < s.turboRollUntil) {
    const turboReduction = (s.prestigeUpgrades?.chronoOverdrive ?? 0) > 0 ? 0.65 : 0.75;
    cd = Math.max(600, Math.round(cd * turboReduction));
  }
  const globalSpeed = s.globalBoosters?.speed;
  if (globalSpeed) {
    cd = Math.max(300, Math.round(cd * globalBoosterSpeedMultiplier(globalSpeed)));
  }
  if (isPremiumBoosterActive(s, 'hyperdrive')) {
    cd = Math.max(400, Math.round(cd * 0.25));
  }
  return Math.round(cd);
}

// Multi roll upgrade is strictly LINEAR (+1 ball per level), plus multiple sources of +1 ball!
export function rollsPerActivation(s: PlayerState): number {
  let balls = 1;
  // 1. Standard Multi upgrade: linear +1 ball per level
  balls += (s.upgrades.multi ?? 0);
  // 2. Advanced Cluster Roll upgrade: +1 ball per level
  balls += (s.upgrades.clusterRoll ?? 0);
  // 3. Prestige Astral Barrage: +1 ball per level
  balls += (s.prestigeUpgrades?.astralBarrage ?? 0);
  // 4. Astral Mastery Celestial Volley: +1 ball per level
  balls += (s.masterySkills?.celestialVolley ?? 0);
  // 5. Level milestones and permanent prestige arsenal
  const lvl = calculateLevelFromXp(s.xp || 0).level;
  balls += getLevelBenefits(lvl).bonusBalls;
  balls += (s.prestigeUpgrades?.astralArsenal ?? 0);
  if (isPremiumBoosterActive(s, 'barrage')) balls += 25;
  return Math.max(1, balls);
}

export function autoUnlocked(s: PlayerState): boolean {
  return (s.upgrades.auto ?? 0) > 0;
}

// All sources of luck are MULTIPLICATIVE!
export function luckMultiplier(s: PlayerState): number {
  // 1. Base Upgrade Luck
  const upgradeLuck = 1 + (s.upgrades.luck ?? 0) * 0.10;

  // 2. Prestige Permanent Luck
  const prestigeLuck = 1 + (s.prestigeUpgrades?.permLuck ?? 0) * 0.10;

  // 3. Level Perks Luck
  const levelInfo = calculateLevelFromXp(s.xp || 0);
  const totalLevelLuck = getLevelBenefits(levelInfo.level).luckMultiplier;

  // 4. Sacrificial Altar Luck (Coins and Shards multiplicative with each other!)
  const { totalAltarMultiplier } = calculateAltarMultipliers(s);

  // 5. Astral Mastery Skill Luck
  const masteryBaseLuck = 1 + (s.masterySkills?.continuumLuck ?? 0) * 0.05;
  const codexTier = Math.floor(Object.keys(s.collection || {}).length / 5);
  const codexLuck = 1 + (s.masterySkills?.celestialSurge ?? 0) * (codexTier * 0.02);
  const totalMasteryLuck = masteryBaseLuck * codexLuck;

  // 6. Guild Perk Luck
  const guildLuck = 1 + (s.guildPerks?.luckRank ?? 0) * 0.05;

  // 7. Dry streak Resonance Pity Luck
  let resonanceLuck = 1.0;
  if ((s.prestigeUpgrades?.resonanceMeter ?? 0) > 0) {
    const dryRolls = s.rollsSinceBest ?? 0;
    const interval = Math.max(6, 18 - (s.masterySkills?.pityAccelerant ?? 0) * 2);
    const stacks = Math.min(100, Math.floor(dryRolls / interval));
    resonanceLuck = 1 + (s.prestigeUpgrades.resonanceMeter * 0.02) * stacks;
  }

  // ALL SOURCES OF LUCK ARE MULTIPLICATIVE WITH EACH OTHER!
  const onlineLuck = onlinePlayerLuckMultiplier(s.onlinePlayers ?? 1);
  const premiumLuck = isPremiumBoosterActive(s, 'fortune') ? 10 : 1;
  const globalLuckState = s.globalBoosters?.luck;
  const globalLuck = globalLuckState ? globalBoosterLuckMultiplier(globalLuckState) : 1;

  const total =
    upgradeLuck *
    prestigeLuck *
    totalLevelLuck *
    totalAltarMultiplier *
    totalMasteryLuck *
    guildLuck *
    resonanceLuck *
    onlineLuck *
    premiumLuck *
    globalLuck;

  return Math.round(total * 100) / 100;
}

export function offlineRollCap(s: PlayerState): number {
  const permVaultBonus = (s.prestigeUpgrades?.vaultCap ?? 0) * 250;
  const guildVaultBonus = (s.guildPerks?.vaultRank ?? 0) * 100;
  const masteryVaultBonus = (s.masterySkills?.infiniteVault ?? 0) * 200;
  const deepVaultBonus = (s.prestigeUpgrades?.deepVault ?? 0) * 250;
  return Math.min(
    MAX_OFFLINE_ROLLS,
    Math.round((30 + (s.upgrades.auto ?? 0) * 20) * (1 + (s.upgrades.speed ?? 0) * 0.04)) +
      permVaultBonus +
      guildVaultBonus +
      masteryVaultBonus +
      deepVaultBonus
  );
}

/**
 * Paced coin progression formula.
 */
export function coinsForRarity(rarity: number): number {
  if (rarity <= 1) return 1;
  return Math.max(1, Math.round(Math.pow(rarity, 0.68)));
}

/**
 * Sustainable upgrade costs
 */
export function upgradeCost(id: UpgradeId, level: number): number {
  if (id === 'auto') return level ? Infinity : AUTO_UNLOCK_COST;
  // Roll Speed has a deliberate cap: 20 levels, totaling at most 3 seconds.
  if (id === 'speed' && level >= 20) return Infinity;
  const configs: Record<Exclude<UpgradeId, 'auto'>, { base: number; mult: number }> = {
    speed: { base: 45, mult: 1.65 },
    multi: { base: 120, mult: 1.75 },
    clusterRoll: { base: 250, mult: 1.85 },
    luck: { base: 75, mult: 1.55 },
    coinBonus: { base: 50, mult: 1.45 },
    shardChance: { base: 150, mult: 1.60 },
    xpBonus: { base: 45, mult: 1.40 },
    critChance: { base: 100, mult: 1.55 },
    critPower: { base: 120, mult: 1.55 },
    offlineRate: { base: 90, mult: 1.50 },
    valueBonus: { base: 80, mult: 1.50 },
  };
  const { base, mult } = configs[id];
  return Math.floor(base * Math.pow(mult, level));
}

// Prestige formula: floor(sqrt(Collection Value / 1,000,000))
export function calculatePrestigeDust(collectionValue: number): number {
  if (!collectionValue || collectionValue < 1_000_000) return 0;
  return Math.floor(Math.sqrt(collectionValue / 1_000_000));
}

export function calculateCosmicDust(s: PlayerState): number {
  const currentVal = s.collectionValue ?? 0;
  if (currentVal < 1_000_000) return 0;
  const base = calculatePrestigeDust(currentVal);
  if (base <= 0) return 0;
  const bonus = (s.prestigeUpgrades?.dustBounty ?? 0) * 0.15;
  const masteryBonus = (s.masterySkills?.cosmicAttunement ?? 0) * 0.08;
  return Math.floor(base * (1 + bonus + masteryBonus));
}

export function prestigeUpgradeCost(id: PrestigeUpgradeId, level: number): number {
  const bases: Record<PrestigeUpgradeId, number> = {
    permLuck: 2,
    permSpeed: 3,
    vaultCap: 1,
    dustBounty: 5,
    sonarPing: 2,
    instantReveal: 2,
    autoOverclock: 2,
    autoFilter: 3,
    resonanceMeter: 3,
    stellarMagnet: 3,
    chronoOverdrive: 4,
    transmutation: 3,
    shardSynthesis: 4,
    astralBarrage: 4,
    cosmicInheritance: 3,
    autoBuyer: 5,
    supernova: 3,
    altarResonator: 3,
    offlineOverdrive: 3,
    singularityTithe: 5,
    luckyFloor: 3,
    astralArsenal: 5,
    deepVault: 2,
    masteryEngine: 4,
    steadyHands: 3,
    offlineFortune: 3,
    frenzyVolley: 2500,
  };
  const base = bases[id] ?? 2;
  return Math.round(base * Math.pow(1.5, level));
}
