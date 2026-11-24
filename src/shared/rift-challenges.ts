import type { PlayerState } from './game.js';
export type RiftChallengeUpgradeId = 'fortune' | 'speed' | 'prosperity' | 'critical';
export type RiftChallengeRunStatus = 'active' | 'completed';

export const RIFT_CHALLENGES = [
  {
    id: 'first-spark',
    number: 1,
    name: 'The First Spark',
    subtitle: 'Build something from nothing',
    description: 'Start with an empty Rift economy. Find an Orb with rarity 1 in 1,000 before the temporary economy runs dry.',
    targetRarity: 1_000,
    requiredMainLevel: 5,
    prerequisiteId: null,
    baseCooldownMs: 1_500,
    coinMultiplier: 1,
    firstClearPoints: 3,
    repeatClearPoints: 1,
    rateBonusPerHour: 0.5,
    debuffs: [
      { name: 'Fresh Save', description: 'Main-game Coins and upgrades do not carry over. Only the permanent Emergency Stipend perk can seed this separate wallet.' },
      { name: 'Dimensional Tax', description: 'Challenge-upgrade prices rise by 5% every 10 rolls, up to 50%.' },
      { name: 'Shards Disabled', description: 'Shards cannot drop or be spent during a Rift run.' },
      { name: 'No Automation', description: 'Auto Roll and offline rolls are unavailable.' },
      { name: 'Sealed Progression', description: 'Main-game boosts do not affect this temporary economy.' },
    ],
  },
  {
    id: 'fractured-tempo',
    number: 2,
    name: 'Fractured Tempo',
    subtitle: 'A slower world, a sharper clock',
    description: 'The Rift resists rapid action. Work around a longer roll interval and find an Orb with rarity 1 in 10,000.',
    targetRarity: 10_000,
    requiredMainLevel: 10,
    prerequisiteId: 'first-spark',
    baseCooldownMs: 2_100,
    coinMultiplier: 0.9,
    firstClearPoints: 5,
    repeatClearPoints: 2,
    rateBonusPerHour: 0.75,
    debuffs: [
      { name: 'Temporal Drag', description: 'The base roll interval is longer than in The First Spark.' },
      { name: 'Thin Payouts', description: 'Challenge Coin rewards are reduced by 10%.' },
      { name: 'Dimensional Tax', description: 'Challenge-upgrade prices rise by 5% every 10 rolls, up to 50%.' },
      { name: 'Sealed Progression', description: 'Only Rift-specific perks affect this temporary economy.' },
    ],
  },
  {
    id: 'hollow-economy',
    number: 3,
    name: 'Hollow Economy',
    subtitle: 'Make every Coin count',
    description: 'The economy is nearly empty. Challenge Coins are scarce, but the target is within reach if you build carefully. Find an Orb with rarity 1 in 100,000.',
    targetRarity: 100_000,
    requiredMainLevel: 15,
    prerequisiteId: 'fractured-tempo',
    baseCooldownMs: 2_400,
    coinMultiplier: 0.55,
    firstClearPoints: 7,
    repeatClearPoints: 3,
    rateBonusPerHour: 1,
    debuffs: [
      { name: 'Hollow Payouts', description: 'Challenge Coin rewards are reduced by 45%.' },
      { name: 'Temporal Drag', description: 'The base roll interval is longer than in earlier challenges.' },
      { name: 'Dimensional Tax', description: 'Challenge-upgrade prices rise by 5% every 10 rolls, up to 50%.' },
      { name: 'Sealed Progression', description: 'Main-game Luck, Coins, and XP perks do not apply inside the challenge.' },
    ],
  },
] as const;

export type RiftChallengeId = typeof RIFT_CHALLENGES[number]['id'];
export type RiftChallengeDefinition = typeof RIFT_CHALLENGES[number];
export const RIFT_FIRST_SPARK = RIFT_CHALLENGES[0];

export function getRiftChallengeDefinition(id: unknown): RiftChallengeDefinition | undefined {
  return RIFT_CHALLENGES.find(challenge => challenge.id === id);
}

export interface RiftChallengeMainProgress {
  level: number;
  totalRolls: number;
  totalCrits: number;
  highestRarity: number;
  masteryPoints: number;
}

export interface RiftChallengeMechanicUnlocks {
  fortune: boolean;
  speed: boolean;
  prosperity: boolean;
  critical: boolean;
}

export interface RiftChallengeUpgradeDefinition {
  name: string;
  description: string;
  mainRequirement: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
}

export interface RiftPerkDefinition {
  id: RiftPerkId;
  name: string;
  category: 'main-game' | 'rift';
  description: string;
  effect: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
}

export type RiftPerkId =
  | 'mainLuck'
  | 'mainCoins'
  | 'mainXp'
  | 'riftLuck'
  | 'riftSpeed'
  | 'riftYield'
  | 'riftStartCoins';

export type RiftPerkLevels = Record<RiftPerkId, number>;

export const RIFT_PERKS: Record<RiftPerkId, RiftPerkDefinition> = {
  mainLuck: {
    id: 'mainLuck', name: 'Rift Attunement', category: 'main-game',
    description: 'Tune ordinary Orb rolls to the Rift frequency.',
    effect: '+2% Luck in the Rift and main game per level.',
    baseCost: 3, costGrowth: 1.62, maxLevel: 10,
  },
  mainCoins: {
    id: 'mainCoins', name: 'Fracture Dividend', category: 'main-game',
    description: 'Recover value from the edges of every discovery.',
    effect: '+5% Coin earnings in the Rift and main game per level.',
    baseCost: 4, costGrowth: 1.68, maxLevel: 10,
  },
  mainXp: {
    id: 'mainXp', name: 'Echo Study', category: 'main-game',
    description: 'Carry a little more knowledge back from each roll.',
    effect: '+5% XP earnings in the Rift and main game per level.',
    baseCost: 4, costGrowth: 1.68, maxLevel: 10,
  },
  riftLuck: {
    id: 'riftLuck', name: 'Rift-Side Fortune', category: 'rift',
    description: 'Improve the odds inside temporary challenge saves.',
    effect: '+5% challenge Luck per level.',
    baseCost: 2, costGrowth: 1.55, maxLevel: 10,
  },
  riftSpeed: {
    id: 'riftSpeed', name: 'Temporal Anchor', category: 'rift',
    description: 'Reduce the waiting period between challenge rolls.',
    effect: '−3% challenge cooldown per level.',
    baseCost: 3, costGrowth: 1.62, maxLevel: 10,
  },
  riftYield: {
    id: 'riftYield', name: 'Resonant Flow', category: 'rift',
    description: 'Increase the amount of Rift energy converted into points.',
    effect: '+5% Rift Bar generation per level.',
    baseCost: 8, costGrowth: 1.82, maxLevel: 10,
  },
  riftStartCoins: {
    id: 'riftStartCoins', name: 'Emergency Stipend', category: 'rift',
    description: 'Seed each new challenge with a small reserve.',
    effect: '+100 starting challenge Coins per level.',
    baseCost: 2, costGrowth: 1.48, maxLevel: 20,
  },
};

export const RIFT_CHALLENGE_UPGRADES: Record<RiftChallengeUpgradeId, RiftChallengeUpgradeDefinition> = {
  fortune: {
    name: 'Fortune Lens',
    description: '+12% effective Luck per level in this challenge.',
    mainRequirement: 'Reach Level 5 in the Rift',
    baseCost: 10, costGrowth: 1.42, maxLevel: 10,
  },
  speed: {
    name: 'Quickstep Coil',
    description: 'Reduces the challenge roll cooldown by 90ms per level.',
    mainRequirement: 'Reach Level 10 in the Rift',
    baseCost: 18, costGrowth: 1.48, maxLevel: 10,
  },
  prosperity: {
    name: 'Coin Converter',
    description: '+20% Coins earned per level in this challenge.',
    mainRequirement: 'Roll 25 Orbs in the Rift',
    baseCost: 14, costGrowth: 1.45, maxLevel: 10,
  },
  critical: {
    name: 'Critical Echo',
    description: '+1.5 percentage points of critical chance per level, up to 15%.',
    mainRequirement: 'Land 10 critical rolls in the Rift',
    baseCost: 55, costGrowth: 1.65, maxLevel: 10,
  },
};

export const RIFT_CHALLENGE_BASE_COOLDOWN_MS = 1_500;
export const RIFT_CHALLENGE_MIN_COOLDOWN_MS = 600;
export const RIFT_CHALLENGE_COOLDOWN_REDUCTION_PER_LEVEL_MS = 90;
export const RIFT_CHALLENGE_COST_TAX_PER_10_ROLLS = 0.05;
export const RIFT_CHALLENGE_MAX_COST_TAX = 0.5;
// Rift energy accrues continuously and is credited when the player next opens the Rift page or performs a Rift action.
export const RIFT_BASE_RATE_PER_HOUR = 1;

export interface RiftChallengeLastRoll {
  rarity: number;
  isCritical: boolean;
  coinsGained: number;
  rolledAt: number;
}

export interface RiftChallengeRun {
  runId: string;
  challengeId: RiftChallengeId;
  status: RiftChallengeRunStatus;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  coins: number;
  totalRolls: number;
  bestRarity: number;
  nextRollAt: number;
  upgradeLevels: Record<RiftChallengeUpgradeId, number>;
  mainProgressAtStart: RiftChallengeMainProgress;
  mechanicUnlocks: RiftChallengeMechanicUnlocks;
  lastRoll: RiftChallengeLastRoll | null;
  /** Complete, isolated main-game save used while this Rift challenge is active. */
  gameState?: PlayerState | null;
}

export interface RiftChallengeArchive {
  version: 3;
  activeRun: RiftChallengeRun | null;
  completedChallengeIds: string[];
  bestRarityByChallenge: Record<string, number>;
  totalCompletedRuns: number;
  riftPoints: number;
  /** Fractional progress toward the next whole Rift Point. */
  riftProgress: number;
  riftRatePerHour: number;
  riftLastAccruedAt: number;
  totalRiftPointsEarned: number;
  riftPerkLevels: RiftPerkLevels;
}

export interface RiftChallengeSnapshot {
  /** Kept for older callers; the full catalog is in challenges. */
  challenge: typeof RIFT_FIRST_SPARK;
  challenges: typeof RIFT_CHALLENGES;
  archive: RiftChallengeArchive;
  mainProgress: RiftChallengeMainProgress;
  mechanicUnlocks: RiftChallengeMechanicUnlocks;
  challengeAvailable: boolean;
}

export function normalizeRiftMainProgress(value: Partial<RiftChallengeMainProgress> | null | undefined): RiftChallengeMainProgress {
  const integer = (raw: unknown, minimum = 0) => {
    const number = Number(raw);
    return Number.isSafeInteger(number) ? Math.max(minimum, number) : minimum;
  };
  return {
    level: integer(value?.level, 1),
    totalRolls: integer(value?.totalRolls),
    totalCrits: integer(value?.totalCrits),
    highestRarity: Math.max(2, Number.isFinite(Number(value?.highestRarity)) ? Number(value?.highestRarity) : 2),
    masteryPoints: integer(value?.masteryPoints),
  };
}

export function riftChallengeIsAvailable(mainProgress: Partial<RiftChallengeMainProgress> | null | undefined): boolean {
  return normalizeRiftMainProgress(mainProgress).level >= RIFT_FIRST_SPARK.requiredMainLevel;
}

export function riftChallengeMechanicUnlocks(
  mainProgress: Partial<RiftChallengeMainProgress> | null | undefined,
): RiftChallengeMechanicUnlocks {
  const progress = normalizeRiftMainProgress(mainProgress);
  return {
    fortune: progress.level >= 5,
    speed: progress.level >= 10,
    prosperity: progress.totalRolls >= 25,
    critical: progress.totalCrits >= 10,
  };
}

export function riftChallengeUpgradeCost(
  id: RiftChallengeUpgradeId,
  currentLevel: number,
  totalRolls: number,
): number {
  const definition = RIFT_CHALLENGE_UPGRADES[id];
  const level = Math.max(0, Math.min(definition.maxLevel, Math.floor(Number(currentLevel) || 0)));
  const rolls = Math.max(0, Math.floor(Number(totalRolls) || 0));
  const taxStacks = Math.min(
    RIFT_CHALLENGE_MAX_COST_TAX / RIFT_CHALLENGE_COST_TAX_PER_10_ROLLS,
    Math.floor(rolls / 10),
  );
  const taxMultiplier = 1 + taxStacks * RIFT_CHALLENGE_COST_TAX_PER_10_ROLLS;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.ceil(definition.baseCost * Math.pow(definition.costGrowth, level) * taxMultiplier),
  );
}

export function riftChallengeCooldownMs(speedLevel: number, baseCooldownMs = RIFT_CHALLENGE_BASE_COOLDOWN_MS): number {
  const level = Math.max(0, Math.min(RIFT_CHALLENGE_UPGRADES.speed.maxLevel, Math.floor(Number(speedLevel) || 0)));
  const base = Math.max(500, Math.floor(Number(baseCooldownMs) || RIFT_CHALLENGE_BASE_COOLDOWN_MS));
  return Math.max(500, base - level * RIFT_CHALLENGE_COOLDOWN_REDUCTION_PER_LEVEL_MS);
}

export function riftChallengeEffectiveLuck(fortuneLevel: number): number {
  const level = Math.max(0, Math.min(RIFT_CHALLENGE_UPGRADES.fortune.maxLevel, Math.floor(Number(fortuneLevel) || 0)));
  return 1 + level * 0.12;
}

export function riftChallengeCoinMultiplier(prosperityLevel: number): number {
  const level = Math.max(0, Math.min(RIFT_CHALLENGE_UPGRADES.prosperity.maxLevel, Math.floor(Number(prosperityLevel) || 0)));
  return 1 + level * 0.20;
}

export function riftChallengeCriticalChance(criticalLevel: number): number {
  const level = Math.max(0, Math.min(RIFT_CHALLENGE_UPGRADES.critical.maxLevel, Math.floor(Number(criticalLevel) || 0)));
  return Math.min(0.15, level * 0.015);
}

export function emptyRiftPerkLevels(): RiftPerkLevels {
  return {
    mainLuck: 0, mainCoins: 0, mainXp: 0,
    riftLuck: 0, riftSpeed: 0, riftYield: 0, riftStartCoins: 0,
  };
}

export function riftPerkCost(id: RiftPerkId, currentLevel: number): number {
  const definition = RIFT_PERKS[id];
  const level = Math.max(0, Math.min(definition.maxLevel, Math.floor(Number(currentLevel) || 0)));
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(definition.baseCost * Math.pow(definition.costGrowth, level)));
}

export function riftRatePerHour(completedChallengeIds: readonly string[], perkLevels: Partial<RiftPerkLevels> | null | undefined): number {
  const firstClearRate = RIFT_CHALLENGES.reduce(
    (sum, challenge) => sum + (completedChallengeIds.includes(challenge.id) ? challenge.rateBonusPerHour : 0),
    0,
  );
  const yieldLevel = Math.max(0, Math.min(RIFT_PERKS.riftYield.maxLevel, Math.floor(Number(perkLevels?.riftYield) || 0)));
  const rate = (RIFT_BASE_RATE_PER_HOUR + firstClearRate) * (1 + yieldLevel * 0.05);
  return Number.isFinite(rate) ? Math.max(RIFT_BASE_RATE_PER_HOUR, rate) : Number.MAX_SAFE_INTEGER;
}

export function createEmptyRiftChallengeArchive(now = Date.now()): RiftChallengeArchive {
  const riftPerkLevels = emptyRiftPerkLevels();
  return {
    version: 3,
    activeRun: null,
    completedChallengeIds: [],
    bestRarityByChallenge: {},
    totalCompletedRuns: 0,
    riftPoints: 0,
    riftProgress: 0,
    riftRatePerHour: RIFT_BASE_RATE_PER_HOUR,
    riftLastAccruedAt: Math.max(0, Math.floor(now)),
    totalRiftPointsEarned: 0,
    riftPerkLevels,
  };
}
