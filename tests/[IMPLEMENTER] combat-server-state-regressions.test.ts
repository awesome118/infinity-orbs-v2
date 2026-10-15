import test from 'node:test';
import assert from 'node:assert/strict';
import { context, redis } from '../src/server/devvit-mock.js';
import { getCombatSnapshot, performCombatBeat } from '../src/server/combat.js';
import { createCombatState, getEnemyForDepth } from '../src/shared/combat.js';

/**
 * Give each server-level test its own persisted combat key and restore the mock
 * identity after the test so these tests cannot leak combat state into others.
 */
async function withCombatPlayer<T>(userId: string, run: (key: string) => Promise<T>): Promise<T> {
  const previousUserId = context.userId;
  const key = 'infinity-orbs:combat:' + userId;
  context.userId = userId;
  await redis.del(key);
  try {
    return await run(key);
  } finally {
    await redis.del(key);
    context.userId = previousUserId;
  }
}

test('combat beats persist their sequence and reject duplicate/stale requests', async () => {
  await withCombatPlayer('combat-sequence-regression-player', async () => {
    const before = await getCombatSnapshot();
    assert.equal(before.state.sequence, 0);

    const first = await performCombatBeat(1, 'strike');
    assert.equal(first.state.sequence, 1);

    const persisted = await getCombatSnapshot();
    assert.equal(persisted.state.sequence, 1, 'a beat must be persisted before the response is returned');

    await assert.rejects(
      () => performCombatBeat(1, 'strike'),
      /stale combat sequence/,
      'replaying an already accepted sequence must not resolve another beat',
    );

    const afterReplay = await getCombatSnapshot();
    assert.equal(afterReplay.state.sequence, 1, 'a rejected replay must not advance combat state');
  });
});

test('death resets the run while retaining permanent combat progress', async () => {
  await withCombatPlayer('combat-death-persistence-regression-player', async key => {
    const state = createCombatState();
    state.runId = 9;
    state.depth = 10;
    state.bestDepth = 10;
    state.health = 1;
    state.coins = 1_234;
    state.totalKills = 99;
    state.level = 7;
    state.xp = 42;
    state.sequence = 0;
    state.combatBeats = 0;
    state.playerActionsResolved = 0;
    state.enemyActionsResolved = 0;
    state.skillLevels = { 'surefoot': 2 };
    state.enemyHp = getEnemyForDepth(10).maxHp;

    await redis.set(key, JSON.stringify(state));

    const result = await performCombatBeat(1, 'strike');

    assert.equal(result.died, true, 'the low-health Delver should be defeated by the boss beat');
    assert.equal(result.state.runId, 10, 'death should start a new run');
    assert.equal(result.state.depth, 1, 'the new run should begin at Depth 1');
    assert.equal(result.state.health, result.state.maxHealth, 'the new run should start at full health');
    assert.equal(result.state.bestDepth, 10, 'best depth is permanent');
    assert.equal(result.state.coins, 1_234, 'Delver Coins are permanent');
    assert.equal(result.state.totalKills, 99, 'lifetime kills are permanent');
    assert.equal(result.state.level, 7, 'combat level is permanent');
    assert.equal(result.state.xp, 42, 'stored combat XP is retained when the run ends');
    assert.equal(result.state.skillLevels.surefoot, 2, 'skill ranks are permanent');
    assert.ok(result.state.inventory.some(item => item.id === 'starter-weapon'), 'collected gear must survive death');
    assert.equal(result.state.sequence, 1, 'the death-causing beat must still be committed');
    assert.equal(result.state.enemyHp, getEnemyForDepth(1).maxHp, 'the new run should load the Depth 1 enemy');
  });
});
