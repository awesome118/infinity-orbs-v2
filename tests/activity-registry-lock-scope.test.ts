import test from 'node:test';
import assert from 'node:assert/strict';

import {
  configureDevvitRuntime,
  redis as originalRedis,
  context as originalContext,
  reddit as originalReddit,
} from '../src/server/devvit-mock.js';
import { recordPlayerHeartbeat, save } from '../src/server/game.js';
import { createInitialState } from '../src/shared/game.js';

test('activity updates watch a per-user lease, not the global registry hash', async () => {
  const watchedKeys: string[][] = [];
  const tracedRedis = {
    ...originalRedis,
    watch: async (...keys: string[]) => {
      watchedKeys.push(keys);
      return originalRedis.watch(...keys);
    },
  };
  const suffix = Date.now().toString(36);
  const context = {
    ...originalContext,
    userId: `activity-scope-a-${suffix}`,
    username: 'ActivityScopeA',
  };

  configureDevvitRuntime({ redis: tracedRedis, context, reddit: originalReddit });
  try {
    const firstUserId = context.userId;
    const first = recordPlayerHeartbeat();

    context.userId = `activity-scope-b-${suffix}`;
    context.username = 'ActivityScopeB';
    const secondUserId = context.userId;
    const second = recordPlayerHeartbeat();

    await Promise.all([first, second]);

    assert.ok(watchedKeys.length > 0, 'activity updates should use the lock transaction');
    assert.ok(
      watchedKeys.every(keys => !keys.includes('io:player-registry')),
      'unrelated player updates must not watch the shared registry hash',
    );
    assert.ok(
      watchedKeys.some(keys => keys.includes(`io:player-mutation-lock:activity:${firstUserId}`)),
      'first activity update should watch its own lease',
    );
    assert.ok(
      watchedKeys.some(keys => keys.includes(`io:player-mutation-lock:activity:${secondUserId}`)),
      'second activity update should watch its own lease',
    );

    const registry = await originalRedis.hGetAll('io:player-registry');
    assert.ok(registry[firstUserId], 'first player activity should remain recorded');
    assert.ok(registry[secondUserId], 'second player activity should remain recorded');

    // Optional shared progress must not join the primary player save's WATCH set.
    context.userId = `activity-scope-save-${suffix}`;
    context.username = 'OptionalProjectionSave';
    const saveUserId = context.userId;
    const state = createInitialState();
    state.username = context.username;
    const optionalKey = `io:test-optional-projection:${suffix}`;
    await save(state, {
      key: optionalKey,
      expectedValue: null,
      nextValue: 'committed',
      optional: true,
    });

    for (let attempt = 0; attempt < 10 && await originalRedis.get(optionalKey) !== 'committed'; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    assert.ok(
      watchedKeys.some(keys => keys.includes(`player:${saveUserId}`) && !keys.includes(optionalKey)),
      'the main player save must not watch optional shared projections',
    );
    assert.ok(
      watchedKeys.some(keys => keys.length === 1 && keys[0] === optionalKey),
      'optional projection must use its own isolated transaction',
    );
    assert.equal(await originalRedis.get(optionalKey), 'committed');
  } finally {
    configureDevvitRuntime({
      redis: originalRedis,
      context: originalContext,
      reddit: originalReddit,
    });
  }
});
