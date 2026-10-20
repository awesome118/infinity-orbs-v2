import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureDevvitRuntime,
  redis as originalRedis,
  context as originalContext,
  reddit as originalReddit,
} from '../src/server/devvit-mock.js';
import { getCombatSnapshot } from '../src/server/combat.js';

test('repeated Combat snapshot polls do not repeatedly write the combat save when projection is unchanged', async () => {
  const baseRedis = originalRedis;
  const baseContext = originalContext;
  const baseReddit = originalReddit;
  const userId = 'combat-readonly-snapshot-' + Date.now().toString(36);
  const combatKey = 'infinity-orbs:combat:' + userId;
  let combatWatchCount = 0;
  const instrumentedRedis = {
    ...baseRedis,
    watch: async (...keys: string[]) => {
      if (keys.includes(combatKey)) combatWatchCount += 1;
      return baseRedis.watch(...keys);
    },
  };

  configureDevvitRuntime({
    redis: instrumentedRedis,
    context: { ...baseContext, userId, username: 'CombatSnapshotTest' },
    reddit: baseReddit,
  });
  try {
    await getCombatSnapshot();
    const writesAfterFirstRead = combatWatchCount;
    await getCombatSnapshot();
    assert.equal(
      combatWatchCount,
      writesAfterFirstRead,
      'a settled snapshot read should not WATCH/MULTI/EXEC the combat state again',
    );
  } finally {
    await baseRedis.del(combatKey);
    await baseRedis.del('player:' + userId);
    await baseRedis.del('player-generation:' + userId);
    await baseRedis.hDel('io:player-registry', userId);
    await baseRedis.hDel('infinity-orbs:combat:arena:profiles', userId);
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});
