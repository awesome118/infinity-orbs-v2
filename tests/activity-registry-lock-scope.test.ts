import test from 'node:test';
import assert from 'node:assert/strict';

import {
  configureDevvitRuntime,
  redis as originalRedis,
  context as originalContext,
  reddit as originalReddit,
} from '../src/server/devvit-mock.js';
import { recordPlayerHeartbeat, save, listPlayers } from '../src/server/game.js';
import { createInitialState } from '../src/shared/game.js';
import { APP_VERSION } from '../src/shared/version.js';

test('activity updates watch a per-user lease, not the global registry hash', async () => {
  // Devvit mock exports are live bindings. Capture the baseline before
  // configureDevvitRuntime swaps those exports, or watch() can delegate back
  // into this wrapper and recurse until the stack overflows.
  const baseRedis = originalRedis;
  const baseWatch = baseRedis.watch.bind(baseRedis);
  const baseContext = originalContext;
  const baseReddit = originalReddit;
  const watchedKeys: string[][] = [];
  const tracedRedis = {
    ...baseRedis,
    watch: async (...keys: string[]) => {
      watchedKeys.push(keys);
      return baseWatch(...keys);
    },
  };
  const suffix = Date.now().toString(36);
  const context = {
    ...baseContext,
    userId: `activity-scope-a-${suffix}`,
    username: 'ActivityScopeA',
  };

  configureDevvitRuntime({ redis: tracedRedis, context, reddit: baseReddit });
  try {
    const firstUserId = context.userId;
    const first = recordPlayerHeartbeat(APP_VERSION);

    context.userId = `activity-scope-b-${suffix}`;
    context.username = 'ActivityScopeB';
    const secondUserId = context.userId;
    const second = recordPlayerHeartbeat('0.0.0-test');

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

    const registry = await baseRedis.hGetAll('io:player-registry');
    assert.ok(registry[firstUserId], 'first player activity should remain recorded');
    assert.ok(registry[secondUserId], 'second player activity should remain recorded');
    assert.equal(JSON.parse(registry[firstUserId]).clientVersion, APP_VERSION);
    assert.equal(JSON.parse(registry[secondUserId]).clientVersion, '0.0.0-test');

    const playerRows = await listPlayers();
    assert.equal(playerRows.find(player => player.userId === firstUserId)?.isLatestVersion, true);
    assert.equal(playerRows.find(player => player.userId === secondUserId)?.isLatestVersion, false);

    const firstRecord = JSON.parse(registry[firstUserId]) as Record<string, unknown>;
    firstRecord.clientVersionAt = Date.now() - 60_000;
    await baseRedis.hSet('io:player-registry', { [firstUserId]: JSON.stringify(firstRecord) });
    const staleVersionRows = await listPlayers();
    assert.equal(
      staleVersionRows.find(player => player.userId === firstUserId)?.isLatestVersion,
      false,
      'old version reports must not stay green indefinitely',
    );

    // Simulate a Redis read failing immediately after WATCH. The transaction
    // must still be unwatched so transient errors do not leave resources open.
    let unwatchCount = 0;
    const failingRedis = {
      ...baseRedis,
      watch: async (...keys: string[]) => {
        const transaction = await baseWatch(...keys);
        return new Proxy(transaction, {
          get(target, property) {
            if (property === 'unwatch') {
              return async () => {
                unwatchCount += 1;
                return target.unwatch();
              };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      },
      hGet: async () => {
        throw new Error('simulated Redis registry read failure');
      },
    };
    const failingContext = {
      ...context,
      userId: `activity-scope-failing-read-${suffix}`,
      username: 'FailingRead',
    };
    configureDevvitRuntime({
      redis: failingRedis as typeof originalRedis,
      context: failingContext,
      reddit: baseReddit,
    });
    await assert.rejects(
      recordPlayerHeartbeat(APP_VERSION),
      /simulated Redis registry read failure/,
    );
    assert.ok(unwatchCount > 0, 'failed activity reads must close their WATCH transaction');
    configureDevvitRuntime({ redis: tracedRedis, context, reddit: baseReddit });

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

    for (let attempt = 0; attempt < 10 && await baseRedis.get(optionalKey) !== 'committed'; attempt += 1) {
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
    assert.equal(await baseRedis.get(optionalKey), 'committed');

    // A shared Guild snapshot conflict should not fail or discard the player's save.
    context.userId = `activity-scope-guild-conflict-${suffix}`;
    context.username = 'GuildConflictRecovery';
    const conflictedState = createInitialState();
    conflictedState.username = context.username;
    const guildKey = `io:test-guild-conflict:${suffix}`;
    await baseRedis.set(guildKey, 'newer-guild-snapshot');

    await save(conflictedState, {
      key: guildKey,
      expectedValue: 'older-guild-snapshot',
      nextValue: 'stale-guild-snapshot',
      conflictMessage: 'Guild data changed before saving.',
      onConflict: () => {
        conflictedState.coins += 17;
        conflictedState.lifetimeCoins = (conflictedState.lifetimeCoins ?? 0) + 17;
      },
    });

    const savedAfterGuildConflict = JSON.parse(
      String(await baseRedis.get(`player:${context.userId}`)),
    ) as { coins?: number };
    assert.equal(savedAfterGuildConflict.coins, 17, 'conflict handler should preserve the refunded tax in player state');
    assert.equal(await baseRedis.get(guildKey), 'newer-guild-snapshot', 'conflicted Guild data must never be overwritten');
  } finally {
    configureDevvitRuntime({
      redis: baseRedis,
      context: baseContext,
      reddit: baseReddit,
    });
  }
});
