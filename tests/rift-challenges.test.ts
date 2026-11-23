import test from 'node:test';
import assert from 'node:assert/strict';
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
} from '../src/shared/rift-challenges.js';

test('The First Spark unlocks at main-game Level 5', () => {
  assert.equal(RIFT_FIRST_SPARK.targetRarity, 1_000);
  assert.equal(riftChallengeIsAvailable({ level: 4 }), false);
  assert.equal(riftChallengeIsAvailable({ level: 5 }), true);
  assert.equal(riftChallengeIsAvailable(null), false);
});

test('main-game progress independently unlocks challenge mechanics', () => {
  assert.deepEqual(
    riftChallengeMechanicUnlocks({ level: 9, totalRolls: 24, totalCrits: 9 }),
    { fortune: true, speed: false, prosperity: false, critical: false },
  );
  assert.deepEqual(
    riftChallengeMechanicUnlocks({ level: 10, totalRolls: 25, totalCrits: 10 }),
    { fortune: true, speed: true, prosperity: true, critical: true },
  );
});

test('main-game progress normalization rejects malformed counters', () => {
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
  assert.equal(riftChallengeCoinMultiplier(5), 2);
  assert.equal(riftChallengeCriticalChance(10), 0.15);
});

test('a fresh archive contains no active challenge and no prior completions', () => {
  assert.deepEqual(createEmptyRiftChallengeArchive(), {
    version: 1,
    activeRun: null,
    completedChallengeIds: [],
    bestRarityByChallenge: {},
    totalCompletedRuns: 0,
  });
});
