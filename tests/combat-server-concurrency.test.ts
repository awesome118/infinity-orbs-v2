import test from 'node:test';
import assert from 'node:assert/strict';

import { context, redis } from '../src/server/devvit-mock.js';
import { getCombatSnapshot, performCombatBeat, rollCombatSkill } from '../src/server/combat.js';
import { createCombatState } from '../src/shared/combat.js';

test('a simultaneous skill pull and combat beat preserve both committed mutations', async () => {
  const originalUserId = context.userId;
  const userId = 'combat-cas-mixed-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const key = 'infinity-orbs:combat:' + userId;
  const initial = createCombatState();
  // Guarantee that a successful beat visibly advances the run regardless of
  // which mutation wins the first WATCH/MULTI/EXEC race.
  initial.enemyHp = 1;

  const originalGet = redis.get;
  let reads = 0;
  let releaseReads!: () => void;
  const bothReadsStarted = new Promise<void>(resolve => { releaseReads = resolve; });

  context.userId = userId;
  redis.get = async (readKey: string) => {
    const value = await originalGet(readKey);
    if (readKey === key && reads < 2) {
      reads += 1;
      if (reads === 2) releaseReads();
      await bothReadsStarted;
    }
    return value;
  };

  try {
    await redis.set(key, JSON.stringify(initial));

    // Force both operations to read the same revision before either can commit.
    // This guarantees that at least one WATCH/MULTI/EXEC attempt must retry.
    const outcomes = await Promise.allSettled([
      performCombatBeat(initial.sequence + 1, 'strike'),
      rollCombatSkill(),
    ]);
    assert.equal(reads, 2, 'both mutations must start from the same state snapshot');
    assert.equal(
      outcomes.filter(outcome => outcome.status === 'fulfilled').length,
      2,
      'both independent operations should finish after CAS retries',
    );

    redis.get = originalGet;
    const persisted = await getCombatSnapshot();
    assert.equal(persisted.state.sequence, initial.sequence + 1, 'the beat should be persisted once');
    assert.equal(persisted.state.totalKills, 1);
    assert.equal(persisted.state.depth, 2);
    assert.equal(persisted.state.skillRolls, 1);
    assert.equal(
      Object.values(persisted.state.skillLevels).reduce((total, rank) => total + Number(rank || 0), 0),
      1,
      'the committed pull must retain exactly one skill rank',
    );
  } finally {
    redis.get = originalGet;
    await redis.del(key);
    context.userId = originalUserId;
  }
});
