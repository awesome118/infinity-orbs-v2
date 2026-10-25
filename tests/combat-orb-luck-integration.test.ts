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

test('boss clears across all three dungeons increase real orb-roll Luck; invalid saves fail neutral', async () => {
  const userId = `combat-orb-luck-${process.pid}-${Date.now()}`;
  const previousUserId = context.userId;
  const combatKey = `infinity-orbs:combat:${userId}`;
  context.userId = userId;

  try {
    await redis.del(combatKey);
    const withoutCombatSave = await rollOnceWithCurrentCombatSave();

    await redis.set(combatKey, '{not valid JSON');
    const withMalformedCombatSave = await rollOnceWithCurrentCombatSave();

    await redis.set(combatKey, JSON.stringify({
      version: 1,
      dungeonId: 'glass-labyrinth',
      depth: 1,
      bestDepth: 1,
      dungeonBestDepths: { undercrypt: 51, 'cinder-vault': 101, 'glass-labyrinth': 101 },
      dungeonBossesBeaten: { undercrypt: 5, 'cinder-vault': 10, 'glass-labyrinth': 10 },
    }));
    const afterClearingBosses = await rollOnceWithCurrentCombatSave();

    assert.equal(
      withMalformedCombatSave.bestOrb.rarity,
      withoutCombatSave.bestOrb.rarity,
      'missing or corrupt combat state must not fabricate a Luck bonus',
    );
    assert.ok(
      afterClearingBosses.bestOrb.rarity > withoutCombatSave.bestOrb.rarity,
      'boss clear counts from all three dungeons should affect the central roll calculation',
    );
  } finally {
    context.userId = previousUserId;
    await redis.del(combatKey);
  }
});
