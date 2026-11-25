import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyRiftChallengeArchive,
  emptyRiftPerkLevels,
  normalizeRiftMainProgress,
  riftChallengeCoinMultiplier,
  riftChallengeCooldownMs,
  riftChallengeCriticalChance,
  riftChallengeEffectiveLuck,
  riftChallengeIsAvailable,
  riftChallengeUnlockStatus,
  riftChallengeMechanicUnlocks,
  riftChallengeUpgradeCost,
  riftPerkCost,
  riftRatePerHour,
  RIFT_CHALLENGE_UPGRADES,
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

test('Rift game progress independently unlocks challenge mechanics', () => {
  assert.deepEqual(
    riftChallengeMechanicUnlocks({ level: 9, totalRolls: 24, totalCrits: 9 }),
    { fortune: true, speed: false, prosperity: false, critical: false },
  );
  assert.deepEqual(
    riftChallengeMechanicUnlocks({ level: 10, totalRolls: 25, totalCrits: 10 }),
    { fortune: true, speed: true, prosperity: true, critical: true },
  );
});

test('Rift game progress normalization rejects malformed counters', () => {
  assert.deepEqual(
    normalizeRiftMainProgress({ level: Number.NaN, totalRolls: -1, totalCrits: 2.5, highestRarity: Infinity }),
    { level: 1, totalRolls: 0, totalCrits: 0, highestRarity: 2, masteryPoints: 0 },
  );
});

test('challenge upgrade prices rise with levels and Dimensional Tax', () => {
  const base = riftChallengeUpgradeCost('fortune', 0, 0);
  const higherLevel = riftChallengeUpgradeCost('fortune', 1, 0);
  const taxed = riftChallengeUpgradeCost('fortune', 0, 100);
  assert.equal(base, RIFT_CHALLENGE_UPGRADES.fortune.baseCost);
  assert.ok(higherLevel > base);
  assert.equal(taxed, Math.ceil(base * 1.5));
  assert.equal(riftChallengeUpgradeCost('fortune', 0, 10_000), taxed);
});

test('challenge upgrade effects stay within their intended bounds', () => {
  assert.equal(riftChallengeEffectiveLuck(0), 1);
  assert.equal(riftChallengeEffectiveLuck(10), 2.2);
  assert.equal(riftChallengeCooldownMs(0), 1_500);
  assert.equal(riftChallengeCooldownMs(10), 600);
  assert.equal(riftChallengeCooldownMs(10, 2_100), 1_200);
  assert.equal(riftChallengeCoinMultiplier(5), 2);
  assert.equal(riftChallengeCriticalChance(10), 0.15);
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
  assert.equal(riftPerkCost('mainLuck', 0), RIFT_PERKS.mainLuck.baseCost);
  assert.ok(riftPerkCost('mainLuck', 1) > riftPerkCost('mainLuck', 0));
  assert.equal(RIFT_PERKS.mainLuck.maxLevel, 10);
  assert.equal(RIFT_PERKS.riftStartCoins.maxLevel, 20);
});

test('a fresh archive starts at one Rift Point per hour and has no prior records', () => {
  assert.deepEqual(createEmptyRiftChallengeArchive(1234), {
    version: 5,
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
    },
    riftRelicLevels: {
      'clock-without-hands': 0, 'temporal-arbitrage': 0, 'unlucky-star': 0,
      observer: 0, 'loaded-die': 0, 'fracture-cascade': 0,
    },
    equippedRiftRelics: [],
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
    upgradeInflation: 12.25,
    ignored: 999,
  }), {
    instability: 1,
    temporalDrag: 1.5,
    fortuneSuppression: 1,
    coinScarcity: 1,
    upgradeInflation: 12.25,
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
