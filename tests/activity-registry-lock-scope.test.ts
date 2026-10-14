import test from 'node:test';
import assert from 'node:assert/strict';

import {
  configureDevvitRuntime,
  redis as originalRedis,
  context as originalContext,
  reddit as originalReddit,
} from '../src/server/devvit-mock.js';
import { recordPlayerHeartbeat } from '../src/server/game.js';

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
  } finally {
    configureDevvitRuntime({
      redis: originalRedis,
      context: originalContext,
      reddit: originalReddit,
    });
  }
});
