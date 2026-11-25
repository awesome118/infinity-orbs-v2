import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyRiftChallengeArchive,
  emptyRiftPerkLevels,
  emptyRiftUnlocks,
  normalizeRiftMainProgress,
  riftChallengeIsAvailable,
  riftChallengeUnlockStatus,
  riftPerkCost,
  riftRatePerHour,
  riftProbabilityDebtMultiplier,
  RIFT_UNLOCKS,
  RIFT_CHALLENGES,
  RIFT_FIRST_SPARK,
  RIFT_PERKS,
  RIFT_ASCENT,
  DEFAULT_RIFT_MODIFIERS,
  DEFAULT_RIFT_CHALLENGES,
  getRiftChallengeDefinition,
  normalizeRiftModifierSettings,
  normalizeRiftChallengeToggles,
  riftModifierDifficultyScore,
  riftModifierRewardPreview,
  riftModifierFromSliderPosition,
  riftModifierSliderPosition,
  RIFT_MUTATIONS,
  RIFT_MUTATION_UNLOCK_ROLLS,
  RIFT_MUTATION_UNLOCK_PROGRESS,
  RIFT_MUTATION_DURATION_ROLLS,
  RIFT_MUTATION_BREAK_ROLLS,
  riftMutationProgress,
  riftMutationRewardMultiplier,
} from '../src/shared/rift-challenges.js';

test('The First Spark retains its Level 5 unlock and original objective', () => {
  assert.equal(RIFT_FIRST_SPARK.targetRarity, 1_000);
  assert.equal(riftChallengeIsAvailable({ level: 4 }), false);
  assert.equal(riftChallengeIsAvailable({ level: 5 }), true);
  assert.equal(riftChallengeIsAvailable(null), false);
});

test('Rift challenge catalog is sequential and has increasing objectives', () => {
  assert.deepEqual(RIFT_CHALLENGES.map(challenge => challenge.id), [
    'first-spark', 'fractured-tempo', 'hollow-economy',
  ]);
  assert.deepEqual(RIFT_CHALLENGES.map(challenge => challenge.targetRarity), [1_000, 10_000, 100_000]);
  assert.equal(RIFT_CHALLENGES[1].prerequisiteId, 'first-spark');
  assert.equal(RIFT_CHALLENGES[2].prerequisiteId, 'fractured-tempo');
});

test('Rift mutations are delayed, temporary, and improve completion rewards', () => {
  assert.equal(RIFT_MUTATION_UNLOCK_ROLLS, 20);
  assert.equal(RIFT_MUTATION_UNLOCK_PROGRESS, 0.2);
  assert.equal(RIFT_MUTATION_DURATION_ROLLS, 12);
  assert.equal(RIFT_MUTATION_BREAK_ROLLS, 8);
  assert.equal(riftMutationProgress(2, 1_000) < RIFT_MUTATION_UNLOCK_PROGRESS, true);
  assert.equal(riftMutationProgress(8, 1_000) >= RIFT_MUTATION_UNLOCK_PROGRESS, true);
  assert.equal(RIFT_MUTATIONS.length, 4);
  assert.equal(new Set(RIFT_MUTATIONS.map(mutation => mutation.id)).size, RIFT_MUTATIONS.length);
  assert.ok(RIFT_MUTATIONS.every(mutation =>
    mutation.luckMultiplier > 0 &&
    mutation.cooldownMultiplier > 0 &&
    mutation.coinMultiplier > 0 &&
    mutation.effect.length > 0
  ));
  assert.equal(riftMutationRewardMultiplier(0), 1);
  assert.equal(riftMutationRewardMultiplier(1), 1.05);
  assert.equal(riftMutationRewardMultiplier(5), 1.25);
  assert.equal(riftMutationRewardMultiplier(100), 1.25);
});

test('later Rift challenges require main-game levels and the previous first clear', () => {
  const fractured = RIFT_CHALLENGES[1];
  assert.deepEqual(
    riftChallengeUnlockStatus(fractured, { level: 10 }, ['first-spark']),
    { levelReady: true, prerequisiteCleared: true, unlocked: true },
  );
  assert.deepEqual(
    riftChallengeUnlockStatus(fractured, { level: 9 }, ['first-spark']),
    { levelReady: false, prerequisiteCleared: true, unlocked: false },
  );
  assert.deepEqual(
    riftChallengeUnlockStatus(fractured, { level: 20 }, []),
    { levelReady: true, prerequisiteCleared: false, unlocked: false },
  );
  assert.equal(riftChallengeUnlockStatus(RIFT_CHALLENGES[2], { level: 15 }, ['first-spark']).unlocked, false);
  assert.equal(riftChallengeUnlockStatus(RIFT_CHALLENGES[2], { level: 15 }, ['fractured-tempo']).unlocked, true);
});

test('Rift game progress normalization rejects malformed counters', () => {
  assert.deepEqual(
    normalizeRiftMainProgress({ level: Number.NaN, totalRolls: -1, totalCrits: 2.5, highestRarity: Infinity }),
    { level: 1, totalRolls: 0, totalCrits: 0, highestRarity: 2, masteryPoints: 0 },
  );
});

test('the Rift Bar increases its hourly rate on first clears, not on replays', () => {
  const cleared = ['first-spark', 'fractured-tempo'];
  assert.equal(riftRatePerHour([], emptyRiftPerkLevels()), 1);
  assert.equal(riftRatePerHour(cleared, emptyRiftPerkLevels()), 2.25);
  assert.equal(riftRatePerHour([...cleared, 'hollow-economy'], emptyRiftPerkLevels()), 3.25);
  assert.ok(Math.abs(riftRatePerHour(cleared, { ...emptyRiftPerkLevels(), riftYield: 1 }) - 2.3625) < 1e-12);
  assert.equal(riftRatePerHour([...cleared, 'first-spark'], emptyRiftPerkLevels()), 2.25);
});

test('Rift passive generation uses only the best-cleared configuration', () => {
  const completed = ['rift-ascent'];
  const perks = emptyRiftPerkLevels();
  const neutralRate = riftRatePerHour(completed, perks, DEFAULT_RIFT_MODIFIERS, DEFAULT_RIFT_CHALLENGES);
  const clearedBest = { ...DEFAULT_RIFT_MODIFIERS, instability: 10 };
  const bestRate = riftRatePerHour(completed, perks, clearedBest, DEFAULT_RIFT_CHALLENGES);
  const bestRateWithYield = riftRatePerHour(completed, { ...perks, riftYield: 1 }, clearedBest, DEFAULT_RIFT_CHALLENGES);
  assert.equal(neutralRate, 1);
  assert.ok(bestRate > neutralRate);
  assert.ok(Math.abs(bestRateWithYield - bestRate * 1.05) < 1e-12);
});

test('Rift Point shop costs scale and perks have clear caps', () => {
  assert.equal('stolenMomentum' in RIFT_PERKS, false);
  assert.equal('stolenMomentum' in emptyRiftPerkLevels(), false);
  assert.equal(riftPerkCost('mainLuck', 0), RIFT_PERKS.mainLuck.baseCost);
  assert.ok(riftPerkCost('mainLuck', 1) > riftPerkCost('mainLuck', 0));
  assert.equal(RIFT_PERKS.mainLuck.maxLevel, 10);
  assert.equal(RIFT_PERKS.riftStartCoins.maxLevel, 20);
});

test('a fresh archive starts at one Rift Point per hour and has no prior records', () => {
  assert.deepEqual(createEmptyRiftChallengeArchive(1234), {
    version: 8,
    activeRun: null,
    completedChallengeIds: [],
    bestRarityByChallenge: {},
    totalCompletedRuns: 0,
    riftPoints: 0,
    riftProgress: 0,
    riftRatePerHour: 1,
    riftLastAccruedAt: 1234,
    totalRiftPointsEarned: 0,
    riftPlayerProgress: null,
    modifierSettings: { ...DEFAULT_RIFT_MODIFIERS },
    challengeToggles: { ...DEFAULT_RIFT_CHALLENGES },
    bestModifierSettings: { ...DEFAULT_RIFT_MODIFIERS },
    bestChallengeToggles: { ...DEFAULT_RIFT_CHALLENGES },
    riftPerkLevels: {
      mainLuck: 0, mainCoins: 0, mainXp: 0,
      riftLuck: 0, riftSpeed: 0, riftYield: 0, riftStartCoins: 0,
      probabilityDebt: 0, dimensionalInterest: 0,
    },
    riftRelicLevels: {
      'clock-without-hands': 0, 'temporal-arbitrage': 0, 'unlucky-star': 0,
      observer: 0, 'loaded-die': 0, 'fracture-cascade': 0,
      'mirror-array': 0, 'stillness-engine': 0, 'rift-tithe': 0,
    },
    equippedRiftRelics: [],
    riftUnlocks: { timelineFork: false },
  });
});


test('Rift Ascent is the configurable entry point while legacy trials remain readable', () => {
  assert.equal(getRiftChallengeDefinition('rift-ascent')?.id, RIFT_ASCENT.id);
  assert.equal(RIFT_ASCENT.requiredMainLevel, 5);
  assert.equal(RIFT_ASCENT.targetRarity, 1_000);
  assert.equal(getRiftChallengeDefinition('first-spark')?.id, 'first-spark');
});

test('modifier settings normalize to safe, neutral minimums', () => {
  assert.deepEqual(normalizeRiftModifierSettings({
    instability: 0,
    temporalDrag: 1.5,
    fortuneSuppression: Infinity,
    coinScarcity: -10,
    ignored: 999,
  }), {
    instability: 1,
    temporalDrag: 1.5,
    fortuneSuppression: 1,
    coinScarcity: 1,
  });
  assert.deepEqual(normalizeRiftChallengeToggles({ secondBest: true, noShards: true, noAutomation: 1 }), {
    secondBest: true,
    noAutomation: false,
    noCriticals: false,
    noShards: true,
  });
});

test('Rift Goal and Luck sliders use a logarithmic ×1..×100 scale', () => {
  assert.equal(riftModifierFromSliderPosition(0), 1);
  assert.equal(riftModifierFromSliderPosition(50), 10);
  assert.equal(riftModifierFromSliderPosition(100), 100);
  assert.equal(riftModifierSliderPosition(1), 0);
  assert.equal(riftModifierSliderPosition(10), 50);
  assert.equal(riftModifierSliderPosition(100), 100);
  assert.equal(riftModifierFromSliderPosition(-10), 1);
  assert.equal(riftModifierFromSliderPosition(110), 100);
});

test('Rift difficulty and rewards scale from continuous modifiers and challenge rules', () => {
  assert.equal(riftModifierDifficultyScore(DEFAULT_RIFT_MODIFIERS, DEFAULT_RIFT_CHALLENGES), 0);
  assert.deepEqual(
    riftModifierRewardPreview(DEFAULT_RIFT_MODIFIERS, DEFAULT_RIFT_CHALLENGES),
    { difficultyScore: 0, pointsPerClear: 1, rpPerHour: 1 },
  );

  const modifiers = { ...DEFAULT_RIFT_MODIFIERS, instability: 10 };
  assert.equal(riftModifierDifficultyScore(modifiers, DEFAULT_RIFT_CHALLENGES), 1.25);
  assert.ok(riftModifierRewardPreview(modifiers, DEFAULT_RIFT_CHALLENGES).pointsPerClear > 1);

  const secondBest = { ...DEFAULT_RIFT_CHALLENGES, secondBest: true };
  assert.equal(riftModifierDifficultyScore(DEFAULT_RIFT_MODIFIERS, secondBest), 4);
  const preview = riftModifierRewardPreview(DEFAULT_RIFT_MODIFIERS, secondBest);
  assert.equal(preview.pointsPerClear, 4);
  assert.equal(preview.rpPerHour, 5.0625);
  assert.ok(riftModifierRewardPreview(DEFAULT_RIFT_MODIFIERS, secondBest, 2).rpPerHour > preview.rpPerHour);
});


test('Probability Debt builds Luck in stages and caps at triple Luck', () => {
  assert.equal(riftProbabilityDebtMultiplier(0, 10_000), 1);
  assert.equal(riftProbabilityDebtMultiplier(10, 24), 1);
  assert.equal(riftProbabilityDebtMultiplier(10, 25), 1.2);
  assert.equal(riftProbabilityDebtMultiplier(10, 250), 3);
  assert.equal(riftProbabilityDebtMultiplier(10, 25_000), 3);
});

test('Dimensional Interest rewards holding Rift Points and never exceeds double generation', () => {
  const perks = { ...emptyRiftPerkLevels(), dimensionalInterest: 10 };
  assert.equal(riftRatePerHour(['rift-ascent'], perks, DEFAULT_RIFT_MODIFIERS, DEFAULT_RIFT_CHALLENGES, 0), 1);
  assert.equal(riftRatePerHour(['rift-ascent'], perks, DEFAULT_RIFT_MODIFIERS, DEFAULT_RIFT_CHALLENGES, 1_000), 1.5);
  assert.equal(riftRatePerHour(['rift-ascent'], perks, DEFAULT_RIFT_MODIFIERS, DEFAULT_RIFT_CHALLENGES, 2_000), 2);
  assert.equal(riftRatePerHour(['rift-ascent'], perks, DEFAULT_RIFT_MODIFIERS, DEFAULT_RIFT_CHALLENGES, 100_000), 2);
});

test('Timeline Fork is a permanent one-time research unlock', () => {
  assert.deepEqual(emptyRiftUnlocks(), { timelineFork: false });
  assert.equal(RIFT_UNLOCKS.timelineFork.cost, 120);
  assert.equal(RIFT_UNLOCKS.timelineFork.effect, 'Equip 3 relics instead of 2.');
});
