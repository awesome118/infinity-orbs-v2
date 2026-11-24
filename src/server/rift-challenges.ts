import { context, redis } from './devvit-mock.js';
import { withPlayerMutationLock } from './player-lock.js';
import { loadRaw } from './game.js';
import { createRollRandomSource } from '../shared/roll-rng.js';
import { calculateLevelFromXp, coinsForRarity, rollContinuum } from '../shared/game.js';
import {
  createEmptyRiftChallengeArchive,
  emptyRiftPerkLevels,
  getRiftChallengeDefinition,
  normalizeRiftMainProgress,
  riftChallengeCoinMultiplier,
  riftChallengeCooldownMs,
  riftChallengeCriticalChance,
  riftChallengeEffectiveLuck,
  riftChallengeIsAvailable,
  riftChallengeMechanicUnlocks,
  riftChallengeUpgradeCost,
  riftPerkCost,
  riftRatePerHour,
  RIFT_CHALLENGE_UPGRADES,
  RIFT_CHALLENGES,
  RIFT_FIRST_SPARK,
  RIFT_PERKS,
  type RiftChallengeArchive,
  type RiftChallengeId,
  type RiftChallengeMainProgress,
  type RiftChallengeRun,
  type RiftChallengeSnapshot,
  type RiftChallengeUpgradeId,
  type RiftPerkId,
  type RiftPerkLevels,
} from '../shared/rift-challenges.js';

const RIFT_ARCHIVE_KEY_PREFIX = 'io:rift-challenge:v1:';

export type { RiftChallengeSnapshot } from '../shared/rift-challenges.js';

function currentUserId(): string {
  const userId = String(context.userId ?? '').trim();
  if (!userId) throw new Error('REDDIT_LOGIN_REQUIRED');
  return userId;
}

function archiveKey(): string {
  return RIFT_ARCHIVE_KEY_PREFIX + currentUserId();
}

function safeInteger(value: unknown, fallback = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? Math.max(0, Math.min(maximum, numeric)) : fallback;
}

function normalizePerkLevels(value: unknown): RiftPerkLevels {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const defaults = emptyRiftPerkLevels();
  return Object.fromEntries(
    Object.entries(defaults).map(([id, fallback]) => {
      const max = RIFT_PERKS[id as RiftPerkId].maxLevel;
      return [id, safeInteger(raw[id], fallback, max)];
    }),
  ) as RiftPerkLevels;
}

function normalizeRun(value: unknown): RiftChallengeRun | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const challenge = getRiftChallengeDefinition(raw.challengeId);
  if (!challenge || (raw.status !== 'active' && raw.status !== 'completed')) return null;
  const levels = raw.upgradeLevels && typeof raw.upgradeLevels === 'object' && !Array.isArray(raw.upgradeLevels)
    ? raw.upgradeLevels as Record<string, unknown>
    : {};
  const rarity = Number(raw.bestRarity);
  const lastRaw = raw.lastRoll && typeof raw.lastRoll === 'object' && !Array.isArray(raw.lastRoll)
    ? raw.lastRoll as Record<string, unknown>
    : null;
  const lastRarity = Number(lastRaw?.rarity);
  const lastRoll = lastRaw && Number.isFinite(lastRarity) && lastRarity >= 2
    ? {
        rarity: Math.min(Number.MAX_SAFE_INTEGER, lastRarity),
        isCritical: lastRaw.isCritical === true,
        coinsGained: safeInteger(lastRaw.coinsGained),
        rolledAt: safeInteger(lastRaw.rolledAt),
      }
    : null;

  return {
    runId: String(raw.runId ?? '').slice(0, 120),
    challengeId: challenge.id as RiftChallengeId,
    status: raw.status,
    startedAt: safeInteger(raw.startedAt),
    updatedAt: safeInteger(raw.updatedAt),
    completedAt: raw.completedAt == null ? null : safeInteger(raw.completedAt),
    coins: safeInteger(raw.coins),
    totalRolls: safeInteger(raw.totalRolls),
    bestRarity: Number.isFinite(rarity) ? Math.max(2, Math.min(Number.MAX_SAFE_INTEGER, rarity)) : 2,
    nextRollAt: safeInteger(raw.nextRollAt),
    upgradeLevels: {
      fortune: safeInteger(levels.fortune, 0, RIFT_CHALLENGE_UPGRADES.fortune.maxLevel),
      speed: safeInteger(levels.speed, 0, RIFT_CHALLENGE_UPGRADES.speed.maxLevel),
      prosperity: safeInteger(levels.prosperity, 0, RIFT_CHALLENGE_UPGRADES.prosperity.maxLevel),
      critical: safeInteger(levels.critical, 0, RIFT_CHALLENGE_UPGRADES.critical.maxLevel),
    },
    mainProgressAtStart: normalizeRiftMainProgress(
      raw.mainProgressAtStart && typeof raw.mainProgressAtStart === 'object'
        ? raw.mainProgressAtStart as Partial<RiftChallengeMainProgress>
        : null,
    ),
    mechanicUnlocks: {
      fortune: (raw.mechanicUnlocks as Record<string, unknown> | null)?.fortune === true,
      speed: (raw.mechanicUnlocks as Record<string, unknown> | null)?.speed === true,
      prosperity: (raw.mechanicUnlocks as Record<string, unknown> | null)?.prosperity === true,
      critical: (raw.mechanicUnlocks as Record<string, unknown> | null)?.critical === true,
    },
    lastRoll,
  };
}

function normalizeArchive(value: unknown, now = Date.now()): RiftChallengeArchive {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createEmptyRiftChallengeArchive(now);
  const raw = value as Record<string, unknown>;
  const completed = Array.isArray(raw.completedChallengeIds)
    ? raw.completedChallengeIds.filter((item): item is string =>
        typeof item === 'string' && getRiftChallengeDefinition(item) !== undefined,
      ).slice(0, 100)
    : [];
  const bestRaw = raw.bestRarityByChallenge && typeof raw.bestRarityByChallenge === 'object' && !Array.isArray(raw.bestRarityByChallenge)
    ? raw.bestRarityByChallenge as Record<string, unknown>
    : {};
  const bestRarityByChallenge: Record<string, number> = {};
  for (const [id, value] of Object.entries(bestRaw).slice(0, 50)) {
    const rarity = Number(value);
    if (getRiftChallengeDefinition(id) && Number.isFinite(rarity) && rarity >= 2) {
      bestRarityByChallenge[id] = Math.min(Number.MAX_SAFE_INTEGER, rarity);
    }
  }
  const riftPerkLevels = normalizePerkLevels(raw.riftPerkLevels);
  const lastAccrued = safeInteger(raw.riftLastAccruedAt, now);
  const riftProgressValue = Number(raw.riftProgress);
  const archive: RiftChallengeArchive = {
    version: 2,
    activeRun: normalizeRun(raw.activeRun),
    completedChallengeIds: [...new Set(completed)],
    bestRarityByChallenge,
    totalCompletedRuns: safeInteger(raw.totalCompletedRuns),
    riftPoints: safeInteger(raw.riftPoints),
    riftProgress: Number.isFinite(riftProgressValue) ? Math.max(0, Math.min(0.999999999, riftProgressValue)) : 0,
    riftRatePerHour: 1,
    riftLastAccruedAt: Math.min(now, lastAccrued),
    totalRiftPointsEarned: safeInteger(raw.totalRiftPointsEarned, safeInteger(raw.riftPoints)),
    riftPerkLevels,
  };
  archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels);
  return archive;
}

async function readArchive(): Promise<RiftChallengeArchive> {
  const raw = await redis.get(archiveKey());
  if (!raw) return createEmptyRiftChallengeArchive(Date.now());
  try {
    return normalizeArchive(JSON.parse(raw));
  } catch {
    console.error('[Rift Challenges] Stored archive could not be parsed; a clean archive was returned.');
    return createEmptyRiftChallengeArchive(Date.now());
  }
}

async function writeArchive(archive: RiftChallengeArchive): Promise<void> {
  await redis.set(archiveKey(), JSON.stringify(archive));
}

function accrueRiftProgress(archive: RiftChallengeArchive, now = Date.now()): void {
  const safeNow = Math.max(archive.riftLastAccruedAt, Math.floor(now));
  const elapsedMs = Math.max(0, safeNow - archive.riftLastAccruedAt);
  const rate = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels);
  const accumulated = archive.riftProgress + (elapsedMs / 3_600_000) * rate;
  const wholePoints = Number.isFinite(accumulated) ? Math.floor(accumulated) : Number.MAX_SAFE_INTEGER;
  const nextBalance = Math.min(Number.MAX_SAFE_INTEGER, archive.riftPoints + wholePoints);
  const earnedNow = Math.max(0, nextBalance - archive.riftPoints);
  archive.riftPoints = nextBalance;
  archive.totalRiftPointsEarned = Math.min(Number.MAX_SAFE_INTEGER, archive.totalRiftPointsEarned + earnedNow);
  archive.riftProgress = nextBalance >= Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, accumulated - wholePoints);
  archive.riftRatePerHour = rate;
  archive.riftLastAccruedAt = safeNow;
}

async function readMainProgress(): Promise<RiftChallengeMainProgress> {
  const state = await loadRaw({ registerActivity: false, persistMigrations: false });
  const storedLevel = Math.max(1, Number(state.level) || 1);
  const xpLevel = Math.max(1, calculateLevelFromXp(Number(state.xp) || 0).level);
  return normalizeRiftMainProgress({
    level: Math.max(storedLevel, xpLevel),
    totalRolls: state.totalRolls,
    totalCrits: state.totalCrits,
    highestRarity: state.highestRarity,
    masteryPoints: state.masteryPoints,
  });
}

function snapshot(archive: RiftChallengeArchive, currentMainProgress: RiftChallengeMainProgress): RiftChallengeSnapshot {
  const activeRun = archive.activeRun?.status === 'active' ? archive.activeRun : null;
  const mainProgress = activeRun?.mainProgressAtStart ?? currentMainProgress;
  return {
    challenge: RIFT_FIRST_SPARK,
    challenges: RIFT_CHALLENGES,
    archive,
    mainProgress,
    mechanicUnlocks: activeRun?.mechanicUnlocks ?? riftChallengeMechanicUnlocks(mainProgress),
    challengeAvailable: riftChallengeIsAvailable(mainProgress),
  };
}

function createRunId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function createRollSeed(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function assertExpectedRunId(run: RiftChallengeRun, expectedRunIdValue: unknown): void {
  const expectedRunId = typeof expectedRunIdValue === 'string' ? expectedRunIdValue.trim() : '';
  if (!expectedRunId || expectedRunId !== run.runId) {
    throw new Error('CHALLENGE_RUN_MISMATCH');
  }
}

export async function getRiftChallengeStatus(): Promise<RiftChallengeSnapshot> {
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    await writeArchive(archive);
    if (archive.activeRun?.status === 'active') {
      return snapshot(archive, archive.activeRun.mainProgressAtStart);
    }
    return snapshot(archive, await readMainProgress());
  });
}

export async function startRiftChallenge(challengeIdValue: unknown = RIFT_FIRST_SPARK.id): Promise<RiftChallengeSnapshot> {
  const challenge = getRiftChallengeDefinition(String(challengeIdValue ?? RIFT_FIRST_SPARK.id));
  if (!challenge) throw new Error('Choose a valid Rift Challenge.');
  return withPlayerMutationLock(async () => {
    const mainProgress = await readMainProgress();
    const archive = await readArchive();
    accrueRiftProgress(archive);
    if (!challenge || mainProgress.level < challenge.requiredMainLevel) {
      throw new Error('Reach Level ' + challenge.requiredMainLevel + ' in the main game to unlock ' + challenge.name + '.');
    }
    if (challenge.prerequisiteId && !archive.completedChallengeIds.includes(challenge.prerequisiteId)) {
      const prerequisite = getRiftChallengeDefinition(challenge.prerequisiteId);
      throw new Error('Complete ' + (prerequisite?.name ?? 'the previous Rift Challenge') + ' first.');
    }
    if (archive.activeRun?.status === 'active') {
      throw new Error('You already have an active challenge. Resume it or abandon it before starting another.');
    }
    const now = Date.now();
    const seedCoins = archive.riftPerkLevels.riftStartCoins * 100;
    archive.activeRun = {
      runId: createRunId(),
      challengeId: challenge.id as RiftChallengeId,
      status: 'active',
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      coins: seedCoins,
      totalRolls: 0,
      bestRarity: 2,
      nextRollAt: 0,
      upgradeLevels: { fortune: 0, speed: 0, prosperity: 0, critical: 0 },
      mainProgressAtStart: mainProgress,
      mechanicUnlocks: riftChallengeMechanicUnlocks(mainProgress),
      lastRoll: null,
    };
    await writeArchive(archive);
    return snapshot(archive, mainProgress);
  });
}

export async function rollRiftChallenge(expectedRunIdValue: unknown): Promise<RiftChallengeSnapshot> {
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    const run = archive.activeRun;
    if (!run || run.status !== 'active') throw new Error('CHALLENGE_RUN_MISMATCH');
    assertExpectedRunId(run, expectedRunIdValue);
    const challenge = getRiftChallengeDefinition(run.challengeId);
    if (!challenge) throw new Error('CHALLENGE_RUN_MISMATCH');
    const now = Date.now();
    if (run.nextRollAt > now) {
      throw new Error('RIFT_CHALLENGE_COOLDOWN:' + String(run.nextRollAt - now));
    }

    const random = createRollRandomSource(createRollSeed());
    const riftPerks = archive.riftPerkLevels;
    const effectiveLuck =
      riftChallengeEffectiveLuck(run.upgradeLevels.fortune) *
      (1 + riftPerks.riftLuck * 0.05);
    const rawRarity = rollContinuum(effectiveLuck, () => random.nextRarity(), 1, 2, 1);
    const criticalChance = riftChallengeCriticalChance(run.upgradeLevels.critical);
    const isCritical = random.next() < criticalChance;
    const finiteRarity = Number.isFinite(rawRarity) ? Math.max(2, Math.floor(rawRarity)) : Number.MAX_SAFE_INTEGER;
    const rarity = isCritical
      ? Math.min(Number.MAX_SAFE_INTEGER, finiteRarity * 2)
      : finiteRarity;
    const coinsGained = Math.max(1, Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.floor(
        coinsForRarity(rarity) *
        riftChallengeCoinMultiplier(run.upgradeLevels.prosperity) *
        challenge.coinMultiplier,
      ),
    ));

    run.coins = Math.min(Number.MAX_SAFE_INTEGER, run.coins + coinsGained);
    run.totalRolls = Math.min(Number.MAX_SAFE_INTEGER, run.totalRolls + 1);
    run.bestRarity = Math.max(run.bestRarity, rarity);
    run.updatedAt = now;
    const speedPerkFactor = Math.max(0.65, 1 - riftPerks.riftSpeed * 0.03);
    run.nextRollAt = now + Math.max(450, Math.round(
      riftChallengeCooldownMs(run.upgradeLevels.speed, challenge.baseCooldownMs) * speedPerkFactor,
    ));
    run.lastRoll = { rarity, isCritical, coinsGained, rolledAt: now };

    if (rarity >= challenge.targetRarity) {
      run.status = 'completed';
      run.completedAt = now;
      archive.totalCompletedRuns = Math.min(Number.MAX_SAFE_INTEGER, archive.totalCompletedRuns + 1);
      const firstClear = !archive.completedChallengeIds.includes(challenge.id);
      if (firstClear) {
        archive.completedChallengeIds.push(challenge.id);
      }
      const pointReward = firstClear ? challenge.firstClearPoints : challenge.repeatClearPoints;
      archive.riftPoints = Math.min(Number.MAX_SAFE_INTEGER, archive.riftPoints + pointReward);
      archive.totalRiftPointsEarned = Math.min(Number.MAX_SAFE_INTEGER, archive.totalRiftPointsEarned + pointReward);
      archive.bestRarityByChallenge[challenge.id] = Math.max(
        archive.bestRarityByChallenge[challenge.id] ?? 0,
        run.bestRarity,
      );
      archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels);
    }

    await writeArchive(archive);
    return snapshot(archive, run.mainProgressAtStart);
  });
}

export async function buyRiftChallengeUpgrade(
  upgradeIdValue: unknown,
  expectedRunIdValue: unknown,
): Promise<RiftChallengeSnapshot> {
  const upgradeId = String(upgradeIdValue ?? '') as RiftChallengeUpgradeId;
  if (!Object.prototype.hasOwnProperty.call(RIFT_CHALLENGE_UPGRADES, upgradeId)) {
    throw new Error('Choose a valid challenge upgrade.');
  }

  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    const run = archive.activeRun;
    if (!run || run.status !== 'active') throw new Error('CHALLENGE_RUN_MISMATCH');
    assertExpectedRunId(run, expectedRunIdValue);
    if (!run.mechanicUnlocks[upgradeId]) {
      throw new Error('Main-game requirement not met: ' + RIFT_CHALLENGE_UPGRADES[upgradeId].mainRequirement + '.');
    }
    const definition = RIFT_CHALLENGE_UPGRADES[upgradeId];
    const currentLevel = run.upgradeLevels[upgradeId];
    if (currentLevel >= definition.maxLevel) throw new Error('This challenge upgrade is already at maximum level.');
    const cost = riftChallengeUpgradeCost(upgradeId, currentLevel, run.totalRolls);
    if (run.coins < cost) throw new Error('Need ' + String(cost) + ' challenge Coins for this upgrade.');
    run.coins -= cost;
    run.upgradeLevels[upgradeId] = currentLevel + 1;
    run.updatedAt = Date.now();
    await writeArchive(archive);
    return snapshot(archive, run.mainProgressAtStart);
  });
}

export async function buyRiftPerk(perkIdValue: unknown): Promise<RiftChallengeSnapshot> {
  const perkId = String(perkIdValue ?? '') as RiftPerkId;
  if (!Object.prototype.hasOwnProperty.call(RIFT_PERKS, perkId)) {
    throw new Error('Choose a valid Rift perk.');
  }
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    const definition = RIFT_PERKS[perkId];
    const currentLevel = archive.riftPerkLevels[perkId];
    if (currentLevel >= definition.maxLevel) throw new Error('This Rift perk is already at maximum level.');
    const cost = riftPerkCost(perkId, currentLevel);
    if (archive.riftPoints < cost) throw new Error('Need ' + String(cost) + ' Rift Points for this perk.');
    archive.riftPoints -= cost;
    archive.riftPerkLevels[perkId] = currentLevel + 1;
    archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels);
    await writeArchive(archive);
    const mainProgress = archive.activeRun?.status === 'active'
      ? archive.activeRun.mainProgressAtStart
      : await readMainProgress();
    return snapshot(archive, mainProgress);
  });
}

export async function abandonRiftChallenge(expectedRunIdValue: unknown): Promise<RiftChallengeSnapshot> {
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    if (!archive.activeRun || archive.activeRun.status !== 'active') {
      throw new Error('CHALLENGE_RUN_MISMATCH');
    }
    assertExpectedRunId(archive.activeRun, expectedRunIdValue);
    archive.activeRun = null;
    await writeArchive(archive);
    return snapshot(archive, await readMainProgress());
  });
}
