export type RiftChallengeUpgradeId = 'fortune' | 'speed' | 'prosperity' | 'critical';
export type RiftChallengeRunStatus = 'active' | 'completed';

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

export interface RiftChallengeLastRoll {
  rarity: number;
  isCritical: boolean;
  coinsGained: number;
  rolledAt: number;
}

export interface RiftChallengeRun {
  runId: string;
  challengeId: 'first-spark';
  status: RiftChallengeRunStatus;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  coins: number;
  totalRolls: number;
  bestRarity: number;
  nextRollAt: number;
  upgradeLevels: Record<RiftChallengeUpgradeId, number>;
  /** Main-game progress and capabilities frozen at the moment this run began. */
  mainProgressAtStart: RiftChallengeMainProgress;
  mechanicUnlocks: RiftChallengeMechanicUnlocks;
  lastRoll: RiftChallengeLastRoll | null;
}

export interface RiftChallengeSnapshot {
  challenge: typeof RIFT_FIRST_SPARK;
  archive: RiftChallengeArchive;
  mainProgress: RiftChallengeMainProgress;
  mechanicUnlocks: RiftChallengeMechanicUnlocks;
  challengeAvailable: boolean;
}

export interface RiftChallengeArchive {
  version: 1;
  activeRun: RiftChallengeRun | null;
  completedChallengeIds: string[];
  bestRarityByChallenge: Record<string, number>;
  totalCompletedRuns: number;
}

export const RIFT_FIRST_SPARK = {
  id: 'first-spark' as const,
  name: 'The First Spark',
  subtitle: 'A clean beginning in an unstable reality',
  description: 'Build a temporary economy from nothing and discover an Orb with rarity 1 in 1,000.',
  targetRarity: 1_000,
  requiredMainLevel: 5,
  debuffs: [
    { name: 'Fresh Save', description: 'Start with 0 Coins, 0 Shards, no upgrades, and baseline Luck.' },
    { name: 'Dimensional Tax', description: 'Every 10 rolls increases challenge upgrade prices by 5%, up to 50%.' },
    { name: 'Shards Disabled', description: 'Shards cannot drop or be spent during this challenge.' },
    { name: 'No Automation', description: 'Auto Roll and offline rolls are unavailable.' },
    { name: 'Sealed Progression', description: 'Main-game Mastery, Prestige, Rune, Guild, and booster bonuses do not apply.' },
  ],
};

export const RIFT_CHALLENGE_UPGRADES: Record<RiftChallengeUpgradeId, RiftChallengeUpgradeDefinition> = {
  fortune: {
    name: 'Fortune Lens',
    description: '+12% effective Luck per level in this challenge.',
    mainRequirement: 'Reach Level 5 in the main game',
    baseCost: 10,
    costGrowth: 1.42,
    maxLevel: 10,
  },
  speed: {
    name: 'Quickstep Coil',
    description: 'Reduces the challenge roll cooldown by 90ms per level.',
    mainRequirement: 'Reach Level 10 in the main game',
    baseCost: 18,
    costGrowth: 1.48,
    maxLevel: 10,
  },
  prosperity: {
    name: 'Coin Converter',
    description: '+20% Coins earned per level in this challenge.',
    mainRequirement: 'Roll 25 Orbs in the main game',
    baseCost: 14,
    costGrowth: 1.45,
    maxLevel: 10,
  },
  critical: {
    name: 'Critical Echo',
    description: '+1.5 percentage points of critical chance per level, up to 15%.',
    mainRequirement: 'Land 10 critical rolls in the main game',
    baseCost: 55,
    costGrowth: 1.65,
    maxLevel: 10,
  },
};

export const RIFT_CHALLENGE_BASE_COOLDOWN_MS = 1_500;
export const RIFT_CHALLENGE_MIN_COOLDOWN_MS = 600;
export const RIFT_CHALLENGE_COOLDOWN_REDUCTION_PER_LEVEL_MS = 90;
export const RIFT_CHALLENGE_COST_TAX_PER_10_ROLLS = 0.05;
export const RIFT_CHALLENGE_MAX_COST_TAX = 0.5;

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

export function riftChallengeCooldownMs(speedLevel: number): number {
  const level = Math.max(0, Math.min(RIFT_CHALLENGE_UPGRADES.speed.maxLevel, Math.floor(Number(speedLevel) || 0)));
  return Math.max(
    RIFT_CHALLENGE_MIN_COOLDOWN_MS,
    RIFT_CHALLENGE_BASE_COOLDOWN_MS - level * RIFT_CHALLENGE_COOLDOWN_REDUCTION_PER_LEVEL_MS,
  );
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

export function createEmptyRiftChallengeArchive(): RiftChallengeArchive {
  return {
    version: 1,
    activeRun: null,
    completedChallengeIds: [],
    bestRarityByChallenge: {},
    totalCompletedRuns: 0,
  };
}
