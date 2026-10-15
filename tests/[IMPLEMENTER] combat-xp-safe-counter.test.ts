import test from 'node:test';
import assert from 'node:assert/strict';
import { context, redis } from '../src/server/devvit-mock.js';
import { performCombatBeat } from '../src/server/combat.js';
import { createCombatState, synchronizeCombatStats } from '../src/shared/combat.js';

test('combat XP saturates safely when a capped Delver receives more XP', async () => {
  const previousUserId = context.userId;
  const userId = 'combat-xp-overflow-regression-player';
  const key = 'infinity-orbs:combat:' + userId;
  context.userId = userId;
  await redis.del(key);

  try {
    const state = createCombatState();
    state.level = 60;
    state.xp = Number.MAX_SAFE_INTEGER - 10;
    state.depth = 1;
    state.sequence = 0;
    state.combatBeats = 0;
    state.playerActionsResolved = 0;
    state.enemyActionsResolved = 0;
    state.enemyHp = 1;
    synchronizeCombatStats(state);
    await redis.set(key, JSON.stringify(state));

    const result = await performCombatBeat(1, 'strike');
    const persisted = JSON.parse((await redis.get(key)) ?? '{}') as { xp?: number };

    assert.equal(result.defeated, true, 'the setup should grant XP for defeating the enemy');
    assert.equal(result.state.level, 60, 'combat level must stay capped');
    assert.equal(result.state.xp, Number.MAX_SAFE_INTEGER, 'XP should saturate instead of overflowing');
    assert.equal(Number.isSafeInteger(result.state.xp), true, 'returned XP must remain a safe integer');
    assert.equal(persisted.xp, Number.MAX_SAFE_INTEGER, 'persisted XP must remain a safe integer');
  } finally {
    await redis.del(key);
    context.userId = previousUserId;
  }
});
