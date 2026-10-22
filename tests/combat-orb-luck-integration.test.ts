import test from 'node:test';
import assert from 'node:assert/strict';

import { context, redis } from '../src/server/devvit-mock.js';
import { applyRolls } from '../src/server/game.js';
import { createInitialState } from '../src/shared/game.js';

function fixedLuckSample(): () => number {
  // No crit; don't trigger the new-player third-orb guarantee; use a sample
  // close enough to a rarity boundary that a modest Luck multiplier is visible.
  const samples = [0.99, 0.99, 1 / 100.5, 0.99];
  let index = 0;
  return () => samples[Math.min(index++, samples.length - 1)]!;
}

async function rollOnceWithCurrentCombatSave() {
  const state = createInitialState(Date.now());
  state.totalRolls = 100;
  return applyRolls(state, 1, undefined, 'online', 1, fixedLuckSample());
}

test('cleared Undercrypt Wardens increase real orb-roll Luck; invalid combat saves fail neutral', async () => {
  const userId = `combat-orb-luck-${process.pid}-${Date.now()}`;
  const previousUserId = context.userId;
  const combatKey = `infinity-orbs:combat:${userId}`;
  context.userId = userId;

  try {
    await redis.del(combatKey);
    const withoutCombatSave = await rollOnceWithCurrentCombatSave();

    await redis.set(combatKey, '{not valid JSON');
    const withMalformedCombatSave = await rollOnceWithCurrentCombatSave();

    await redis.set(combatKey, JSON.stringify({ version: 1, depth: 1, bestDepth: 251 }));
    const afterClearingWardens = await rollOnceWithCurrentCombatSave();

    assert.equal(
      withMalformedCombatSave.bestOrb.rarity,
      withoutCombatSave.bestOrb.rarity,
      'missing or corrupt combat state must not fabricate a Luck bonus',
    );
    assert.ok(
      afterClearingWardens.bestOrb.rarity > withoutCombatSave.bestOrb.rarity,
      'the maximum permanent Undercrypt reward should affect the central roll calculation',
    );
  } finally {
    context.userId = previousUserId;
    await redis.del(combatKey);
  }
});
