import test from 'node:test';
import assert from 'node:assert/strict';

import { context, redis } from '../src/server/devvit-mock.js';
import { performCombatBeat } from '../src/server/combat.js';
import { createCombatState, getEnemyForDepth } from '../src/shared/combat.js';

test('Guard persists across beats with no enemy action and reduces the next actual hit', async () => {
  const originalUserId = context.userId;
  const userId = 'combat-guard-duration-regression';
  context.userId = userId;
  const key = 'infinity-orbs:combat:' + userId;

  try {
    const state = createCombatState();
    // Depth 13 is an Ironbound encounter (Speed 80): it does not attack on
    // beat 1, but does attack on beat 2. The player remains fast enough to act
    // without killing it before that next enemy action.
    const enemy = getEnemyForDepth(13);
    assert.equal(enemy.speed, 80);
    state.depth = 13;
    state.bestDepth = 13;
    state.sequence = 0;
    state.combatBeats = 0;
    state.playerActionsResolved = 0;
    state.enemyActionsResolved = 0;
    state.enemyHp = enemy.maxHp;
    state.health = state.maxHealth;

    await redis.set(key, JSON.stringify(state));

    const guardedBeat = await performCombatBeat(1, 'guard');
    assert.equal(guardedBeat.state.enemyActionsResolved, 0);
    assert.equal(guardedBeat.state.guardBeats, 1, 'Guard must remain active until an enemy attack occurs');

    const nextBeat = await performCombatBeat(2, 'strike');
    const enemyHit = nextBeat.actions.find(action => action.actor === 'enemy' && action.kind === 'attack');
    assert.ok(enemyHit, 'the slower enemy should attack on beat 2');
    const damageAfterGuard = Math.round(Math.round(enemy.damage * 0.45) * (1 - nextBeat.stats.damageReduction));
    assert.equal(enemyHit.damage, damageAfterGuard, 'Guard reduces the next real incoming hit');
    assert.equal(nextBeat.state.guardBeats, 0, 'Guard is consumed after mitigating that hit');
  } finally {
    await redis.del(key);
    context.userId = originalUserId;
  }
});
