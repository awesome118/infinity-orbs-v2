import { context, redis } from './devvit-mock.js';
import { withPlayerMutationLock } from './player-lock.js';
import { loadRaw } from './game.js';
import { createRollRandomSource } from '../shared/roll-rng.js';
import { calculateLevelFromXp, coinsForRarity, rollContinuum } from '../shared/game.js';
import {
  createEmptyRiftChallengeArchive,
  normalizeRiftMainProgress,
  riftChallengeCoinMultiplier,
  riftChallengeCooldownMs,
  riftChallengeCriticalChance,
  riftChallengeEffectiveLuck,
  riftChallengeIsAvailable,
  riftChallengeMechanicUnlocks,
  riftChallengeUpgradeCost,
  RIFT_CHALLENGE_UPGRADES,
  RIFT_FIRST_SPARK,
  type RiftChallengeArchive,
  type RiftChallengeMainProgress,
  type RiftChallengeRun,
  type RiftChallengeSnapshot,
  type RiftChallengeUpgradeId,
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

function normalizeRun(value: unknown): RiftChallengeRun | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.challengeId !== RIFT_FIRST_SPARK.id || (raw.status !== 'active' && raw.status !== 'completed')) return null;
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
    challengeId: RIFT_FIRST_SPARK.id,
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

function normalizeArchive(value: unknown): RiftChallengeArchive {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createEmptyRiftChallengeArchive();
  const raw = value as Record<string, unknown>;
  const completed = Array.isArray(raw.completedChallengeIds)
    ? raw.completedChallengeIds.filter((item): item is string => typeof item === 'string' && item.length <= 80).slice(0, 100)
    : [];
  const bestRaw = raw.bestRarityByChallenge && typeof raw.bestRarityByChallenge === 'object' && !Array.isArray(raw.bestRarityByChallenge)
    ? raw.bestRarityByChallenge as Record<string, unknown>
    : {};
  const bestRarityByChallenge: Record<string, number> = {};
  for (const [id, value] of Object.entries(bestRaw).slice(0, 50)) {
    const rarity = Number(value);
    if (Number.isFinite(rarity) && rarity >= 2) bestRarityByChallenge[id.slice(0, 80)] = Math.min(Number.MAX_SAFE_INTEGER, rarity);
  }
  return {
    version: 1,
    activeRun: normalizeRun(raw.activeRun),
    completedChallengeIds: [...new Set(completed)],
    bestRarityByChallenge,
    totalCompletedRuns: safeInteger(raw.totalCompletedRuns),
  };
}

async function readArchive(): Promise<RiftChallengeArchive> {
  const raw = await redis.get(archiveKey());
  if (!raw) return createEmptyRiftChallengeArchive();
  try {
    return normalizeArchive(JSON.parse(raw));
  } catch {
    console.error('[Rift Challenges] Stored archive could not be parsed; a clean archive was returned.');
    return createEmptyRiftChallengeArchive();
  }
}

async function writeArchive(archive: RiftChallengeArchive): Promise<void> {
  await redis.set(archiveKey(), JSON.stringify(archive));
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
    archive,
    mainProgress,
    // Main-game progress and available mechanics are frozen for an active run.
    // New main-game progress applies when the player starts their next attempt.
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
  const archive = await readArchive();
  if (archive.activeRun?.status === 'active') {
    return snapshot(archive, archive.activeRun.mainProgressAtStart);
  }
  return snapshot(archive, await readMainProgress());
}

export async function startRiftChallenge(): Promise<RiftChallengeSnapshot> {
  return withPlayerMutationLock(async () => {
    const mainProgress = await readMainProgress();
    if (!riftChallengeIsAvailable(mainProgress)) {
      throw new Error('Reach Level 5 in the main game to unlock Rift Challenges.');
    }
    const archive = await readArchive();
    if (archive.activeRun?.status === 'active') {
      throw new Error('You already have an active challenge. Resume it or abandon it before starting another.');
    }
    const now = Date.now();
    archive.activeRun = {
      runId: createRunId(),
      challengeId: RIFT_FIRST_SPARK.id,
      status: 'active',
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      coins: 0,
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
    const run = archive.activeRun;
    if (!run || run.status !== 'active') throw new Error('CHALLENGE_RUN_MISMATCH');
    assertExpectedRunId(run, expectedRunIdValue);
    const mainProgress = run.mainProgressAtStart;
    const now = Date.now();
    if (run.nextRollAt > now) {
      throw new Error('RIFT_CHALLENGE_COOLDOWN:' + String(run.nextRollAt - now));
    }

    const random = createRollRandomSource(createRollSeed());
    const effectiveLuck = riftChallengeEffectiveLuck(run.upgradeLevels.fortune);
    const rawRarity = rollContinuum(effectiveLuck, () => random.nextRarity(), 1, 2, 1);
    const criticalChance = riftChallengeCriticalChance(run.upgradeLevels.critical);
    const isCritical = random.next() < criticalChance;
    const finiteRarity = Number.isFinite(rawRarity) ? Math.max(2, Math.floor(rawRarity)) : Number.MAX_SAFE_INTEGER;
    const rarity = isCritical
      ? Math.min(Number.MAX_SAFE_INTEGER, finiteRarity * 2)
      : finiteRarity;
    const coinsGained = Math.max(1, Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.floor(coinsForRarity(rarity) * riftChallengeCoinMultiplier(run.upgradeLevels.prosperity)),
    ));

    run.coins = Math.min(Number.MAX_SAFE_INTEGER, run.coins + coinsGained);
    run.totalRolls = Math.min(Number.MAX_SAFE_INTEGER, run.totalRolls + 1);
    run.bestRarity = Math.max(run.bestRarity, rarity);
    run.updatedAt = now;
    run.nextRollAt = now + riftChallengeCooldownMs(run.upgradeLevels.speed);
    run.lastRoll = { rarity, isCritical, coinsGained, rolledAt: now };

    if (rarity >= RIFT_FIRST_SPARK.targetRarity) {
      run.status = 'completed';
      run.completedAt = now;
      archive.totalCompletedRuns = Math.min(Number.MAX_SAFE_INTEGER, archive.totalCompletedRuns + 1);
      if (!archive.completedChallengeIds.includes(RIFT_FIRST_SPARK.id)) {
        archive.completedChallengeIds.push(RIFT_FIRST_SPARK.id);
      }
      archive.bestRarityByChallenge[RIFT_FIRST_SPARK.id] = Math.max(
        archive.bestRarityByChallenge[RIFT_FIRST_SPARK.id] ?? 0,
        run.bestRarity,
      );
    }

    await writeArchive(archive);
    return snapshot(archive, mainProgress);
  });
}

export async function buyRiftChallengeUpgrade(upgradeIdValue: unknown, expectedRunIdValue: unknown): Promise<RiftChallengeSnapshot> {
  const upgradeId = String(upgradeIdValue ?? '') as RiftChallengeUpgradeId;
  if (!Object.prototype.hasOwnProperty.call(RIFT_CHALLENGE_UPGRADES, upgradeId)) {
    throw new Error('Choose a valid challenge upgrade.');
  }

  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    const run = archive.activeRun;
    if (!run || run.status !== 'active') throw new Error('CHALLENGE_RUN_MISMATCH');
    assertExpectedRunId(run, expectedRunIdValue);
    const mainProgress = run.mainProgressAtStart;
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
    return snapshot(archive, mainProgress);
  });
}

export async function abandonRiftChallenge(expectedRunIdValue: unknown): Promise<RiftChallengeSnapshot> {
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    if (!archive.activeRun || archive.activeRun.status !== 'active') {
      throw new Error('CHALLENGE_RUN_MISMATCH');
    }
    assertExpectedRunId(archive.activeRun, expectedRunIdValue);
    archive.activeRun = null;
    await writeArchive(archive);
    return snapshot(archive, await readMainProgress());
  });
}
