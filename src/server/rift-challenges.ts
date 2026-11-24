import { context, redis } from './devvit-mock.js';
import { withPlayerMutationLock } from './player-lock.js';
import { loadRaw, deleteRiftCodexForRun } from './game.js';
import {
  createInitialState,
  calculateLevelFromXp,
  type PlayerState,
} from '../shared/game.js';
import {
  createEmptyRiftChallengeArchive,
  emptyRiftPerkLevels,
  getRiftChallengeDefinition,
  normalizeRiftMainProgress,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRun(value: unknown): RiftChallengeRun | null {
  if (!isRecord(value)) return null;
  const challenge = getRiftChallengeDefinition(value.challengeId);
  if (!challenge || (value.status !== 'active' && value.status !== 'completed')) return null;
  const levels = isRecord(value.upgradeLevels) ? value.upgradeLevels : {};
  const rarity = Number(value.bestRarity);
  const lastRaw = isRecord(value.lastRoll) ? value.lastRoll : null;
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
    runId: String(value.runId ?? '').slice(0, 120),
    challengeId: challenge.id as RiftChallengeId,
    status: value.status,
    startedAt: safeInteger(value.startedAt),
    updatedAt: safeInteger(value.updatedAt),
    completedAt: value.completedAt == null ? null : safeInteger(value.completedAt),
    coins: safeInteger(value.coins),
    totalRolls: safeInteger(value.totalRolls),
    bestRarity: Number.isFinite(rarity) ? Math.max(2, Math.min(Number.MAX_SAFE_INTEGER, rarity)) : 2,
    nextRollAt: safeInteger(value.nextRollAt),
    upgradeLevels: {
      fortune: safeInteger(levels.fortune, 0, RIFT_CHALLENGE_UPGRADES.fortune.maxLevel),
      speed: safeInteger(levels.speed, 0, RIFT_CHALLENGE_UPGRADES.speed.maxLevel),
      prosperity: safeInteger(levels.prosperity, 0, RIFT_CHALLENGE_UPGRADES.prosperity.maxLevel),
      critical: safeInteger(levels.critical, 0, RIFT_CHALLENGE_UPGRADES.critical.maxLevel),
    },
    mainProgressAtStart: normalizeRiftMainProgress(
      isRecord(value.mainProgressAtStart)
        ? value.mainProgressAtStart as Partial<RiftChallengeMainProgress>
        : null,
    ),
    mechanicUnlocks: {
      fortune: isRecord(value.mechanicUnlocks) && value.mechanicUnlocks.fortune === true,
      speed: isRecord(value.mechanicUnlocks) && value.mechanicUnlocks.speed === true,
      prosperity: isRecord(value.mechanicUnlocks) && value.mechanicUnlocks.prosperity === true,
      critical: isRecord(value.mechanicUnlocks) && value.mechanicUnlocks.critical === true,
    },
    lastRoll,
    gameState: isRecord(value.gameState) ? value.gameState as unknown as PlayerState : null,
  };
}

function normalizeArchive(value: unknown, now = Date.now()): RiftChallengeArchive {
  if (!isRecord(value)) return createEmptyRiftChallengeArchive(now);
  const completed = Array.isArray(value.completedChallengeIds)
    ? value.completedChallengeIds.filter((item): item is string =>
        typeof item === 'string' && getRiftChallengeDefinition(item) !== undefined,
      ).slice(0, 100)
    : [];
  const bestRaw = isRecord(value.bestRarityByChallenge) ? value.bestRarityByChallenge : {};
  const bestRarityByChallenge: Record<string, number> = {};
  for (const [id, best] of Object.entries(bestRaw).slice(0, 50)) {
    const rarity = Number(best);
    if (getRiftChallengeDefinition(id) && Number.isFinite(rarity) && rarity >= 2) {
      bestRarityByChallenge[id] = Math.min(Number.MAX_SAFE_INTEGER, rarity);
    }
  }
  const riftPerkLevels = normalizePerkLevels(value.riftPerkLevels);
  const lastAccrued = safeInteger(value.riftLastAccruedAt, now);
  const riftProgressValue = Number(value.riftProgress);
  const archive: RiftChallengeArchive = {
    version: 3,
    activeRun: normalizeRun(value.activeRun),
    completedChallengeIds: [...new Set(completed)],
    bestRarityByChallenge,
    totalCompletedRuns: safeInteger(value.totalCompletedRuns),
    riftPoints: safeInteger(value.riftPoints),
    riftProgress: Number.isFinite(riftProgressValue) ? Math.max(0, Math.min(0.999999999, riftProgressValue)) : 0,
    riftRatePerHour: 1,
    riftLastAccruedAt: Math.min(now, lastAccrued),
    totalRiftPointsEarned: safeInteger(value.totalRiftPointsEarned, safeInteger(value.riftPoints)),
    riftPerkLevels,
  };
  archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels);
  return archive;
}

async function readArchive(): Promise<RiftChallengeArchive> {
  const raw = await redis.get(archiveKey());
  if (!raw) return createEmptyRiftChallengeArchive(Date.now());
  try {
    return normalizeArchive(JSON.parse(String(raw)));
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

function progressFromGameState(state: PlayerState): RiftChallengeMainProgress {
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

async function readMainProgress(): Promise<RiftChallengeMainProgress> {
  // Challenge availability can still require a main-save level. Once a challenge
  // starts, every gameplay variable comes from the independent Rift save instead.
  const state = await loadRaw({ registerActivity: false, persistMigrations: false, source: 'main' });
  return progressFromGameState(state);
}

function createLegacyRunGameState(run: RiftChallengeRun): PlayerState {
  // Migration for active First Spark runs created before full PlayerState isolation.
  // Carry over the already-earned challenge wallet/counters, never the main save.
  const state = createInitialState(run.startedAt || Date.now());
  state.username = String(context.username ?? '').slice(0, 100) || undefined;
  state.coins = Math.max(0, run.coins);
  state.lifetimeCoins = state.coins;
  state.shards = 0;
  state.lifetimeShards = 0;
  state.freeShardsEarnedToday = 0;
  state.shardPityRolls = 0;
  state.totalRolls = run.totalRolls;
  state.highestRarity = run.bestRarity;
  state.stateRevision = 0;
  state.saveGeneration = 0;
  return state;
}

function ensureRunGameState(run: RiftChallengeRun): PlayerState {
  if (!run.gameState || !isRecord(run.gameState)) {
    run.gameState = createLegacyRunGameState(run);
  }
  return run.gameState;
}

function syncRunSummaryFromGameState(run: RiftChallengeRun, now = Date.now()): void {
  const state = ensureRunGameState(run);
  run.coins = Math.max(0, Number(state.coins) || 0);
  run.totalRolls = safeInteger(state.totalRolls);
  run.bestRarity = Math.max(2, Number(state.highestRarity) || 2);
  run.mainProgressAtStart = progressFromGameState(state);
  run.mechanicUnlocks = riftChallengeMechanicUnlocks(run.mainProgressAtStart);
  run.updatedAt = now;
}

function snapshot(archive: RiftChallengeArchive, currentMainProgress: RiftChallengeMainProgress): RiftChallengeSnapshot {
  const storedRun = archive.activeRun?.gameState ? archive.activeRun : null;
  const activeRun = archive.activeRun?.status === 'active' ? archive.activeRun : null;
  if (activeRun) syncRunSummaryFromGameState(activeRun);
  const mainProgress = storedRun?.gameState
    ? progressFromGameState(storedRun.gameState)
    : currentMainProgress;
  return {
    challenge: RIFT_FIRST_SPARK,
    challenges: RIFT_CHALLENGES,
    archive,
    mainProgress,
    mechanicUnlocks: activeRun?.gameState
      ? riftChallengeMechanicUnlocks(mainProgress)
      : activeRun?.mechanicUnlocks ?? riftChallengeMechanicUnlocks(mainProgress),
    challengeAvailable: riftChallengeIsAvailable(mainProgress),
  };
}

function createRunId(): string {
  const bytes = new Uint8Array(16);
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
    if (archive.activeRun?.status === 'active') syncRunSummaryFromGameState(archive.activeRun);
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
    const archive = await readArchive();
    accrueRiftProgress(archive);
    const mainProgress = archive.activeRun?.gameState
      ? progressFromGameState(archive.activeRun.gameState)
      : await readMainProgress();
    if (mainProgress.level < challenge.requiredMainLevel) {
      throw new Error('Reach Level ' + challenge.requiredMainLevel + ' in ' + (challenge.prerequisiteId ? 'the previous Rift run' : 'the main game') + ' to unlock ' + challenge.name + '.');
    }
    if (challenge.prerequisiteId && !archive.completedChallengeIds.includes(challenge.prerequisiteId)) {
      const prerequisite = getRiftChallengeDefinition(challenge.prerequisiteId);
      throw new Error('Complete ' + (prerequisite?.name ?? 'the previous Rift Challenge') + ' first.');
    }
    if (archive.activeRun?.status === 'active') {
      throw new Error('You already have an active challenge. Resume it or abandon it before starting another.');
    }
    const previousCompletedRunId = archive.activeRun?.status === 'completed'
      ? archive.activeRun.runId
      : null;
    const now = Date.now();
    const state = createInitialState(now);
    const seedCoins = archive.riftPerkLevels.riftStartCoins * 100;
    state.username = String(context.username ?? '').slice(0, 100) || undefined;
    state.coins = seedCoins;
    state.lifetimeCoins = seedCoins;
    state.shards = 0;
    state.lifetimeShards = 0;
    state.freeShardsEarnedToday = 0;
    state.shardPityRolls = 0;
    state.saveGeneration = 0;
    state.stateRevision = 0;
    const riftProgress = progressFromGameState(state);
    archive.activeRun = {
      runId: createRunId(),
      challengeId: challenge.id as RiftChallengeId,
      status: 'active',
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      coins: state.coins,
      totalRolls: state.totalRolls,
      bestRarity: Math.max(2, state.highestRarity),
      nextRollAt: 0,
      upgradeLevels: { fortune: 0, speed: 0, prosperity: 0, critical: 0 },
      mainProgressAtStart: riftProgress,
      mechanicUnlocks: riftChallengeMechanicUnlocks(riftProgress),
      lastRoll: null,
      gameState: state,
    };
    await writeArchive(archive);
    if (previousCompletedRunId) {
      await deleteRiftCodexForRun(previousCompletedRunId).catch(error => {
        console.error('[Rift Challenges] Replaced run Codex cleanup failed:', error);
      });
    }
    return snapshot(archive, mainProgress);
  });
}

/** Kept as a compatibility guard; actual Rift rolls now use the ordinary game /api/roll path. */
export async function rollRiftChallenge(_expectedRunIdValue: unknown): Promise<RiftChallengeSnapshot> {
  throw new Error('Use the main game Roll button while a Rift challenge is active.');
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
    const gameState = ensureRunGameState(run);
    const progress = progressFromGameState(gameState);
    const mechanicUnlocks = riftChallengeMechanicUnlocks(progress);
    if (!mechanicUnlocks[upgradeId]) {
      throw new Error('Rift-game requirement not met: ' + RIFT_CHALLENGE_UPGRADES[upgradeId].mainRequirement + '.');
    }
    const definition = RIFT_CHALLENGE_UPGRADES[upgradeId];
    const currentLevel = run.upgradeLevels[upgradeId];
    if (currentLevel >= definition.maxLevel) throw new Error('This challenge upgrade is already at maximum level.');
    const cost = riftChallengeUpgradeCost(upgradeId, currentLevel, run.totalRolls);
    if (gameState.coins < cost) throw new Error('Need ' + String(cost) + ' Rift Coins for this upgrade.');
    gameState.coins -= cost;
    gameState.stateRevision = safeInteger(gameState.stateRevision) + 1;
    run.coins = gameState.coins;
    run.upgradeLevels[upgradeId] = currentLevel + 1;
    syncRunSummaryFromGameState(run);
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
    if (archive.activeRun?.status === 'active' && archive.activeRun.gameState) {
      const nextRevision = safeInteger(archive.activeRun.gameState.stateRevision) + 1;
      if (!Number.isSafeInteger(nextRevision)) throw new Error('Rift player save reached its revision limit.');
      archive.activeRun.gameState.stateRevision = nextRevision;
    }
    archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels);
    await writeArchive(archive);
    const mainProgress = archive.activeRun?.status === 'active' && archive.activeRun.gameState
      ? progressFromGameState(archive.activeRun.gameState)
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
    const completedRunId = archive.activeRun.runId;
    archive.activeRun = null;
    await writeArchive(archive);
    await deleteRiftCodexForRun(completedRunId).catch(error => {
      console.error('[Rift Challenges] Abandoned run Codex cleanup failed:', error);
    });
    return snapshot(archive, await readMainProgress());
  });
}
