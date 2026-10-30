import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_EFFECTIVE_ROLLS_PER_BATCH,
  MAX_SIMULATED_ROLLS_PER_BATCH,
  createRollBatchPlan,
  effectiveWeightAtSample,
  sampleBinomialCount,
  virtualRollOffsetAtSample,
} from '../src/shared/roll-batching.js';

function seededRandom(seed = 123456789): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

test('500,000 effective Orbs are simulated as 50,000 samples at 100x Luck', () => {
  const plan = createRollBatchPlan(500_000);
  assert.equal(plan.compressionWeight, 10);
  assert.equal(plan.simulatedBaseCount, 50_000);
  assert.equal(plan.simulatedBaseCount * plan.compressionWeight, 500_000);
  assert.equal(plan.compressionWeight * plan.compressionWeight, 100);
  assert.ok(plan.simulatedBaseCount <= MAX_SIMULATED_ROLLS_PER_BATCH);
  assert.equal(MAX_SIMULATED_ROLLS_PER_BATCH, 50_000);
  assert.equal(MAX_EFFECTIVE_ROLLS_PER_BATCH, 500_000);
});

test('weighted samples conserve the exact effective Orb count, including a partial tail', () => {
  for (const count of [1, 49_999, 50_000, 50_001, 123_456, 499_999, 500_000]) {
    const plan = createRollBatchPlan(count);
    let totalWeight = 0;
    for (let index = 0; index < plan.simulatedBaseCount; index++) {
      totalWeight += effectiveWeightAtSample(plan, index);
    }
    assert.equal(totalWeight, count, 'effective count mismatch for ' + count);
  }
});

test('the first three new-player Orbs stay uncompressed and preserve their exact indexes', () => {
  const plan = createRollBatchPlan(500_000, 3);
  assert.equal(effectiveWeightAtSample(plan, 0), 1);
  assert.equal(effectiveWeightAtSample(plan, 1), 1);
  assert.equal(effectiveWeightAtSample(plan, 2), 1);
  assert.equal(virtualRollOffsetAtSample(plan, 0), 0);
  assert.equal(virtualRollOffsetAtSample(plan, 1), 1);
  assert.equal(virtualRollOffsetAtSample(plan, 2), 2);
  assert.equal(virtualRollOffsetAtSample(plan, 3), 3);
  assert.equal(plan.simulatedBaseCount, 50_003);
});

test('offline batches remain uncompressed', () => {
  const plan = createRollBatchPlan(20_000, 0, false);
  assert.equal(plan.compressionWeight, 1);
  assert.equal(plan.simulatedBaseCount, 20_000);
});

test('large low-probability proc counts stay within valid binomial bounds', () => {
  const rng = seededRandom();
  const successes = sampleBinomialCount(100_000, 0.005, rng);
  assert.ok(successes >= 400 && successes <= 600, 'unexpected proc count: ' + successes);
  assert.equal(sampleBinomialCount(500, 0, rng), 0);
  assert.equal(sampleBinomialCount(500, 1, rng), 500);
});

test('server uses weighted sample counts for Luck, player totals, XP, Coins, and progress', () => {
  const server = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const multiRoll = server.slice(server.indexOf('export async function roll('), server.indexOf('export async function subscribeToSubredditForReward'));
  const apply = server.slice(server.indexOf('export async function applyRolls('), server.indexOf('\nasync function commitOfflineNotificationMarkerIfUnchanged'));
  const frenzy = server.slice(server.indexOf('export async function claimOrbFrenzy'), server.indexOf('export async function postFrenzyThankYouComment'));

  assert.match(apply, /sampleLuck = Math\.min\(Number\.MAX_VALUE, effectiveLuck \* sampleWeight \* sampleWeight\)/);
  assert.match(apply, /s\.totalRolls \+= sampleWeight/);
  assert.match(apply, /xpForBaseOrb \* sampleWeight/);
  assert.match(apply, /extraCoinsEstimate = addCoinAmount/);
  assert.match(apply, /extraCoinsForGroupMaximum = Math\.max\(1, Math\.round\(coinsForRarity\(rarity\) \* 0\.20\)\)/);
  assert.match(apply, /rarities\.push\(rarity\);\s*rarityWeights\.push\(1\)/);
  assert.match(apply, /lowCoinsForGroupMaximum/);
  assert.match(apply, /lowRarityCoinsEstimate = addCoinAmount/);
  assert.match(apply, /sampleBinomialCount\(sampleWeight, combinedShardChance, rng\)/);
  assert.match(multiRoll, /MAX_EFFECTIVE_ROLLS_PER_BATCH \/ ballsPerActivation/);
  assert.match(frenzy, /MAX_EFFECTIVE_ROLLS_PER_BATCH, remainingCount/);
  assert.match(frenzy, /writeFrenzyClaimProgress\(claimantId, postId, attemptId, count, absoluteProcessed, false\)/);
});
