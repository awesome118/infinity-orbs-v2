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
  riftChallengeMechanicUnlocks,
  riftChallengeUpgradeCost,
  riftPerkCost,
  riftRatePerHour,
  RIFT_CHALLENGE_UPGRADES,
  RIFT_CHALLENGES,
  RIFT_FIRST_SPARK,
  RIFT_PERKS,
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

test('Rift Point shop costs scale and perks have clear caps', () => {
  assert.equal(riftPerkCost('mainLuck', 0), RIFT_PERKS.mainLuck.baseCost);
  assert.ok(riftPerkCost('mainLuck', 1) > riftPerkCost('mainLuck', 0));
  assert.equal(RIFT_PERKS.mainLuck.maxLevel, 10);
  assert.equal(RIFT_PERKS.riftStartCoins.maxLevel, 20);
});

test('a fresh archive starts at one Rift Point per hour and has no prior records', () => {
  assert.deepEqual(createEmptyRiftChallengeArchive(1234), {
    version: 3,
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
    kudosReceivedAt: [],
    lastGameOpenedAt: 1234,
    kudosSinceLastOpen: 0,
    kudosDisplaySinceLastOpen: 0,
    riftPerkLevels: {
      mainLuck: 0, mainCoins: 0, mainXp: 0,
      riftLuck: 0, riftSpeed: 0, riftYield: 0, riftStartCoins: 0,
    },
  });
});
