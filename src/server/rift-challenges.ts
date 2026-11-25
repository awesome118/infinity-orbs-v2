import { context, redis } from './devvit-mock.js';
import { withPlayerMutationLock } from './player-lock.js';
import { loadRaw, deleteRiftCodexForRun } from './game.js';
import { getCombatScrapBalance, spendCombatScrapForRiftForge, refundCombatScrapForRiftForge } from './combat.js';
import {
  createInitialState,
  calculateLevelFromXp,
  type PlayerState,
} from '../shared/game.js';
import { normalizeRiftRelicLevels, normalizeEquippedRiftRelics, riftRelicCost, getRiftRelicEffects, riftEffectiveTemporalDragMultiplier, riftStartingMultiballLevel, RIFT_RELICS, RIFT_RELIC_EQUIP_SLOTS, RIFT_RELIC_FORKED_EQUIP_SLOTS, type RiftRelicId } from '../shared/rift-relics.js';
import {
  createEmptyRiftChallengeArchive,
  emptyRiftPerkLevels,
  emptyRiftUnlocks,
  RIFT_UNLOCKS,
  normalizeRiftModifierSettings,
  normalizeRiftChallengeToggles,
  RIFT_ASCENT,
  getRiftChallengeDefinition,
  normalizeRiftMainProgress,
  riftChallengeIsAvailable,
  riftChallengeUnlockStatus,
  riftPerkCost,
  riftRatePerHour,
  RIFT_CHALLENGES,
  RIFT_FIRST_SPARK,
  RIFT_MUTATION_UNLOCK_ROLLS,
  getRiftMutationDefinition,
  RIFT_PERKS,
  type RiftChallengeArchive,
  type RiftChallengeId,
  type RiftChallengeMainProgress,
  type RiftChallengeRun,
  type RiftChallengeSnapshot,
  type RiftPerkId,
  type RiftPerkLevels,
  type RiftUnlockId,
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

function normalizeRun(value: unknown, maxRelicSlots = RIFT_RELIC_EQUIP_SLOTS): RiftChallengeRun | null {
  if (!isRecord(value)) return null;
  const challenge = getRiftChallengeDefinition(value.challengeId);
  if (!challenge || (value.status !== 'active' && value.status !== 'completed')) return null;
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
    mainProgressAtStart: normalizeRiftMainProgress(
      isRecord(value.mainProgressAtStart)
        ? value.mainProgressAtStart as Partial<RiftChallengeMainProgress>
        : null,
    ),
    lastRoll,
    targetRarity: safeInteger(value.targetRarity, challenge.targetRarity),
    baseCooldownMs: safeInteger(value.baseCooldownMs, challenge.baseCooldownMs),
    modifierSettings: normalizeRiftModifierSettings(value.modifierSettings),
    challengeToggles: normalizeRiftChallengeToggles(value.challengeToggles),
    equippedRelics: normalizeEquippedRiftRelics(value.equippedRelics, undefined, maxRelicSlots),
    fractureCascadeUntilRoll: safeInteger(value.fractureCascadeUntilRoll),
    probabilityDebtRolls: safeInteger(value.probabilityDebtRolls),
    mutationId: getRiftMutationDefinition(value.mutationId)?.id ?? null,
    mutationEndsAtRoll: safeInteger(value.mutationEndsAtRoll),
    nextMutationAtRoll: safeInteger(value.nextMutationAtRoll, RIFT_MUTATION_UNLOCK_ROLLS),
    mutationsCompleted: safeInteger(value.mutationsCompleted),
    lastMutationId: getRiftMutationDefinition(value.lastMutationId)?.id ?? null,
    gameState: isRecord(value.gameState) ? value.gameState as unknown as PlayerState : null,
  };
}

// Stolen Momentum was removed in archive v6. Preserve its old purchase value
// by returning every Rift Point paid for its ranks exactly once during migration.
function legacyStolenMomentumRefund(value: unknown): number {
  const level = safeInteger(value, 0, 10);
  let refund = 0;
  for (let rank = 0; rank < level; rank += 1) {
    refund = Math.min(Number.MAX_SAFE_INTEGER, refund + Math.ceil(20 * Math.pow(1.82, rank)));
  }
  return refund;
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
  const archiveVersion = safeInteger(value.version, 0);
  const legacyPerks = isRecord(value.riftPerkLevels) ? value.riftPerkLevels : {};
  const removedPerkRefund = archiveVersion < 6 ? legacyStolenMomentumRefund(legacyPerks.stolenMomentum) : 0;
  const riftPerkLevels = normalizePerkLevels(value.riftPerkLevels);
  const rawUnlocks = isRecord(value.riftUnlocks) ? value.riftUnlocks : {};
  const riftUnlocks = { timelineFork: rawUnlocks.timelineFork === true };
  const maxRelicSlots = riftUnlocks.timelineFork ? RIFT_RELIC_FORKED_EQUIP_SLOTS : RIFT_RELIC_EQUIP_SLOTS;
  const lastAccrued = safeInteger(value.riftLastAccruedAt, now);
  const riftProgressValue = Number(value.riftProgress);
  const activeRun = normalizeRun(value.activeRun, maxRelicSlots);
  // Older Rift Ascent saves received the unconditional +1 Multiball level.
  // Remove that one granted level from already-active runs when Second-best is off,
  // retaining any Multiball levels the player purchased during the run.
  if (
    archiveVersion < 7 &&
    activeRun?.status === 'active' &&
    activeRun.challengeId === RIFT_ASCENT.id &&
    activeRun.challengeToggles?.secondBest !== true &&
    isRecord(activeRun.gameState?.upgrades)
  ) {
    const savedUpgrades = activeRun.gameState!.upgrades as unknown as Record<string, unknown>;
    const multiballLevel = Number(savedUpgrades.multi ?? 0);
    if (Number.isSafeInteger(multiballLevel) && multiballLevel > 0) {
      savedUpgrades.multi = multiballLevel - 1;
    }
  }
  const legacyCompletedAscent = activeRun?.status === 'completed' && activeRun.challengeId === RIFT_ASCENT.id
    ? activeRun
    : null;
  const archive: RiftChallengeArchive = {
    version: 9,
    activeRun,
    completedChallengeIds: [...new Set(completed)],
    bestRarityByChallenge,
    totalCompletedRuns: safeInteger(value.totalCompletedRuns),
    riftPoints: Math.min(Number.MAX_SAFE_INTEGER, safeInteger(value.riftPoints) + removedPerkRefund),
    riftProgress: Number.isFinite(riftProgressValue) ? Math.max(0, Math.min(0.999999999, riftProgressValue)) : 0,
    riftRatePerHour: 1,
    riftLastAccruedAt: Math.min(now, lastAccrued),
    totalRiftPointsEarned: safeInteger(value.totalRiftPointsEarned, safeInteger(value.riftPoints)),
    riftPlayerProgress: isRecord(value.riftPlayerProgress)
      ? normalizeRiftMainProgress(value.riftPlayerProgress as Partial<RiftChallengeMainProgress>)
      : null,
    modifierSettings: normalizeRiftModifierSettings(value.modifierSettings),
    challengeToggles: normalizeRiftChallengeToggles(value.challengeToggles),
    bestModifierSettings: normalizeRiftModifierSettings(value.bestModifierSettings ?? legacyCompletedAscent?.modifierSettings),
    bestChallengeToggles: normalizeRiftChallengeToggles(value.bestChallengeToggles ?? legacyCompletedAscent?.challengeToggles),
    riftPerkLevels,
    riftRelicLevels: normalizeRiftRelicLevels(value.riftRelicLevels),
    equippedRiftRelics: normalizeEquippedRiftRelics(value.equippedRiftRelics, value.riftRelicLevels, maxRelicSlots),
    riftUnlocks,
  };
  archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels, archive.bestModifierSettings, archive.bestChallengeToggles, archive.riftPoints);
  return archive;
}

async function readArchive(): Promise<RiftChallengeArchive> {
  const raw = await redis.get(archiveKey());
  if (!raw) return createEmptyRiftChallengeArchive(Date.now());
  try {
    const parsed = JSON.parse(String(raw));
    const archive = normalizeArchive(parsed);
    if (isRecord(parsed) && safeInteger(parsed.version, 0) < archive.version) {
      await writeArchive(archive);
    }
    return archive;
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
  const rate = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels, archive.bestModifierSettings, archive.bestChallengeToggles, archive.riftPoints);
  const accumulated = archive.riftProgress + (elapsedMs / 3_600_000) * rate;
  const wholePoints = Number.isFinite(accumulated) ? Math.floor(accumulated) : Number.MAX_SAFE_INTEGER;
  const nextBalance = Math.min(Number.MAX_SAFE_INTEGER, archive.riftPoints + wholePoints);
  const earnedNow = Math.max(0, nextBalance - archive.riftPoints);
  archive.riftPoints = nextBalance;
  archive.totalRiftPointsEarned = Math.min(Number.MAX_SAFE_INTEGER, archive.totalRiftPointsEarned + earnedNow);
  archive.riftProgress = nextBalance >= Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, accumulated - wholePoints);
  archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels, archive.bestModifierSettings, archive.bestChallengeToggles, archive.riftPoints);
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
  if (run.challengeId !== RIFT_ASCENT.id) {
    run.bestRarity = Math.max(2, Number(state.highestRarity) || 2);
  } else {
    run.bestRarity = Math.max(2, safeInteger(run.bestRarity, 2));
  }
  run.updatedAt = now;
}

async function snapshot(archive: RiftChallengeArchive, currentMainProgress: RiftChallengeMainProgress): Promise<RiftChallengeSnapshot> {
  const activeRun = archive.activeRun?.status === 'active' ? archive.activeRun : null;
  if (activeRun) syncRunSummaryFromGameState(activeRun);
  return {
    challenge: RIFT_FIRST_SPARK,
    challenges: RIFT_CHALLENGES,
    archive,
    mainProgress: currentMainProgress,
    challengeAvailable: riftChallengeIsAvailable(currentMainProgress),
    scrapBalance: await getCombatScrapBalance(),
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
    const mainProgress = await readMainProgress();
    await writeArchive(archive);
    return snapshot(archive, mainProgress);
  });
}

export async function startRiftChallenge(challengeIdValue: unknown = RIFT_ASCENT.id): Promise<RiftChallengeSnapshot> {
  const challenge = getRiftChallengeDefinition(String(challengeIdValue ?? RIFT_FIRST_SPARK.id));
  if (!challenge) throw new Error('Choose a valid Rift Challenge.');
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    if (archive.activeRun?.status === 'active') {
      throw new Error('You already have an active challenge. Resume it or abandon it before starting another.');
    }
    const mainProgress = await readMainProgress();
    const isModifierRun = challenge.id === RIFT_ASCENT.id;
    const unlock = riftChallengeUnlockStatus(challenge, mainProgress, archive.completedChallengeIds);
    if (!unlock.levelReady) {
      throw new Error('Reach Level ' + challenge.requiredMainLevel + ' in the main game to unlock ' + challenge.name + '.');
    }
    if (!isModifierRun && !unlock.prerequisiteCleared) {
      const prerequisite = getRiftChallengeDefinition(challenge.prerequisiteId);
      throw new Error('Complete ' + (prerequisite?.name ?? 'the previous Rift Challenge') + ' first.');
    }
    const previousCompletedRun = archive.activeRun?.status === 'completed' ? archive.activeRun : null;
    const previousCompletedRunId = previousCompletedRun?.runId ?? null;
    const now = Date.now();
    const state = createInitialState(now);
    const modifierSettings = normalizeRiftModifierSettings(archive.modifierSettings);
    const challengeToggles = normalizeRiftChallengeToggles(archive.challengeToggles);
    const targetRarity = isModifierRun
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.ceil(RIFT_ASCENT.targetRarity * modifierSettings.instability)))
      : challenge.targetRarity;
    const maxRelicSlots = archive.riftUnlocks.timelineFork ? RIFT_RELIC_FORKED_EQUIP_SLOTS : RIFT_RELIC_EQUIP_SLOTS;
    const relicEffects = getRiftRelicEffects(archive.equippedRiftRelics, archive.riftRelicLevels, maxRelicSlots);
    const effectiveTemporalDrag = riftEffectiveTemporalDragMultiplier(
    modifierSettings.temporalDrag,
    relicEffects.temporalDragPenaltyReduction,
    isModifierRun && challengeToggles.noAutomation ? relicEffects.noAutomationCooldownReduction : 0,
  );
    const baseCooldownMs = isModifierRun
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(500, Math.ceil(RIFT_ASCENT.baseCooldownMs * effectiveTemporalDrag)))
      : challenge.baseCooldownMs;
    const challengeCoinMultiplier = isModifierRun
      ? 1 / modifierSettings.coinScarcity
      : challenge.coinMultiplier;
    state.upgrades.multi = riftStartingMultiballLevel(
      state.upgrades.multi ?? 0,
      isModifierRun && challengeToggles.secondBest,
      isModifierRun ? relicEffects.secondBestMultiballBonus : 0,
    );
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
      mainProgressAtStart: mainProgress,
      lastRoll: null,
      targetRarity,
      baseCooldownMs,
      modifierSettings,
      challengeToggles,
      equippedRelics: [...archive.equippedRiftRelics],
      fractureCascadeUntilRoll: 0,
      probabilityDebtRolls: 0,
      mutationId: null,
      mutationEndsAtRoll: 0,
      nextMutationAtRoll: RIFT_MUTATION_UNLOCK_ROLLS,
      mutationsCompleted: 0,
      lastMutationId: null,
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

export async function updateRiftModifiers(
  modifierSettingsValue: unknown,
  challengeTogglesValue: unknown,
): Promise<RiftChallengeSnapshot> {
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    if (archive.activeRun?.status === 'active') {
      throw new Error('Finish or abandon the active Rift run before changing its modifiers.');
    }
    archive.modifierSettings = normalizeRiftModifierSettings(modifierSettingsValue);
    archive.challengeToggles = normalizeRiftChallengeToggles(challengeTogglesValue);
    // Saving a draft cannot raise the earned Rift Point rate. Only a completed
    // run can replace the best-cleared configuration used for passive generation.
    archive.riftRatePerHour = riftRatePerHour(
      archive.completedChallengeIds,
      archive.riftPerkLevels,
      archive.bestModifierSettings,
      archive.bestChallengeToggles,
      archive.riftPoints,
    );
    await writeArchive(archive);
    return snapshot(archive, await readMainProgress());
  });
}


export async function buyRiftRelic(relicIdValue: unknown): Promise<RiftChallengeSnapshot> {
  const relicId = String(relicIdValue ?? '') as RiftRelicId;
  if (!Object.prototype.hasOwnProperty.call(RIFT_RELICS, relicId)) {
    throw new Error('Choose a valid Rift relic.');
  }
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    if (!archive.completedChallengeIds.includes(RIFT_ASCENT.id)) {
      throw new Error('Complete Rift Ascent once to unlock the Relic Forge.');
    }
    if (archive.activeRun?.status === 'active') {
      throw new Error('Finish or abandon the active Rift run before using the Relic Forge.');
    }
    const currentLevel = archive.riftRelicLevels[relicId] ?? 0;
    if (currentLevel >= 3) throw new Error('This relic is already at maximum rank.');
    const cost = riftRelicCost(relicId, currentLevel);
    if (archive.riftPoints < cost.riftPoints) throw new Error('Need ' + String(cost.riftPoints) + ' Rift Points for this relic.');
    const scrapBalance = await getCombatScrapBalance();
    if (scrapBalance < cost.scrap) throw new Error('Not enough Scrap for this relic. Need ' + String(cost.scrap) + '.');
    await spendCombatScrapForRiftForge(cost.scrap);
    archive.riftPoints -= cost.riftPoints;
    archive.riftRelicLevels[relicId] = currentLevel + 1;
    archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels, archive.bestModifierSettings, archive.bestChallengeToggles, archive.riftPoints);
    try {
      await writeArchive(archive);
    } catch (error) {
      await refundCombatScrapForRiftForge(cost.scrap).catch(refundError => {
        console.error('[Rift Relic Forge] Scrap compensation failed after archive write error.', refundError);
      });
      throw error;
    }
    return snapshot(archive, await readMainProgress());
  });
}

export async function setEquippedRiftRelic(relicIdValue: unknown, equippedValue: unknown): Promise<RiftChallengeSnapshot> {
  const relicId = String(relicIdValue ?? '') as RiftRelicId;
  if (typeof equippedValue !== 'boolean') throw new Error('Choose whether to equip or unequip the relic.');
  if (!Object.prototype.hasOwnProperty.call(RIFT_RELICS, relicId)) {
    throw new Error('Choose a valid Rift relic.');
  }
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    if (!archive.completedChallengeIds.includes(RIFT_ASCENT.id)) {
      throw new Error('Complete Rift Ascent once to unlock the Relic Forge.');
    }
    if (archive.activeRun?.status === 'active') {
      throw new Error('Finish or abandon the active Rift run before changing relics.');
    }
    if ((archive.riftRelicLevels[relicId] ?? 0) <= 0) throw new Error('Forge this relic before equipping it.');
    const current = [...archive.equippedRiftRelics];
    if (equippedValue) {
      if (current.includes(relicId)) return snapshot(archive, await readMainProgress());
      const availableSlots = archive.riftUnlocks.timelineFork ? RIFT_RELIC_FORKED_EQUIP_SLOTS : RIFT_RELIC_EQUIP_SLOTS;
      if (current.length >= availableSlots) throw new Error('All relic slots are occupied. Unequip a relic first.');
      current.push(relicId);
    } else {
      const index = current.indexOf(relicId);
      if (index >= 0) current.splice(index, 1);
    }
    const maxRelicSlots = archive.riftUnlocks.timelineFork ? RIFT_RELIC_FORKED_EQUIP_SLOTS : RIFT_RELIC_EQUIP_SLOTS;
    if (current.length > maxRelicSlots) throw new Error('All relic slots are occupied. Unequip a relic first.');
    archive.equippedRiftRelics = normalizeEquippedRiftRelics(current, archive.riftRelicLevels, maxRelicSlots);
    await writeArchive(archive);
    return snapshot(archive, await readMainProgress());
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
    archive.riftRatePerHour = riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels, archive.bestModifierSettings, archive.bestChallengeToggles, archive.riftPoints);
    await writeArchive(archive);
    return snapshot(archive, await readMainProgress());
  });
}


export async function buyRiftUnlock(unlockIdValue: unknown): Promise<RiftChallengeSnapshot> {
  const unlockId = String(unlockIdValue ?? '') as RiftUnlockId;
  if (!Object.prototype.hasOwnProperty.call(RIFT_UNLOCKS, unlockId)) {
    throw new Error('Choose a valid Rift unlock.');
  }
  return withPlayerMutationLock(async () => {
    const archive = await readArchive();
    accrueRiftProgress(archive);
    if (!archive.completedChallengeIds.includes(RIFT_ASCENT.id)) {
      throw new Error('Complete Rift Ascent once to unlock permanent Rift research.');
    }
    if (archive.activeRun?.status === 'active') {
      throw new Error('Finish or abandon the active Rift run before purchasing permanent research.');
    }
    if (archive.riftUnlocks[unlockId]) throw new Error('This Rift research is already unlocked.');
    const cost = RIFT_UNLOCKS[unlockId].cost;
    if (archive.riftPoints < cost) throw new Error('Need ' + String(cost) + ' Rift Points for this unlock.');
    archive.riftPoints -= cost;
    archive.riftUnlocks[unlockId] = true;
    if (unlockId === 'timelineFork') {
      archive.equippedRiftRelics = normalizeEquippedRiftRelics(
        archive.equippedRiftRelics,
        archive.riftRelicLevels,
        RIFT_RELIC_FORKED_EQUIP_SLOTS,
      );
    }
    archive.riftRatePerHour = riftRatePerHour(
      archive.completedChallengeIds,
      archive.riftPerkLevels,
      archive.bestModifierSettings,
      archive.bestChallengeToggles,
      archive.riftPoints,
    );
    await writeArchive(archive);
    return snapshot(archive, await readMainProgress());
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
