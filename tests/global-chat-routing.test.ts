import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureDevvitRuntime,
  context as originalContext,
  redis as originalRedis,
  reddit as originalReddit,
} from '../src/server/devvit-mock.js';
import { getGlobalChatStatus } from '../src/server/social.js';

test('no unregistered ordinary post can become Global Chat destination via launcher=main', async () => {
  const baseContext = originalContext;
  const baseRedis = originalRedis;
  const baseReddit = originalReddit;
  const postId = 't3_spoof-routing-test-' + Date.now().toString(36);
  const gamePostKey = 'io:global-game-post-id';
  const previousGamePost = await baseRedis.get(gamePostKey);

  configureDevvitRuntime({
    redis: baseRedis,
    context: { ...baseContext, postId, userId: 'chat-routing-test', username: 'ChatRoutingTest' },
    reddit: baseReddit,
  });
  try {
    await baseRedis.del(gamePostKey);
    const result = await getGlobalChatStatus(true, false);
    assert.equal(result.enabled, false);
    assert.match(result.reason ?? '', /not registered by the official post-creation flow/);
    assert.equal(await baseRedis.get(gamePostKey), null, 'client-controlled launcher flags must not register arbitrary posts');
  } finally {
    await baseRedis.del(gamePostKey);
    if (previousGamePost != null) await baseRedis.set(gamePostKey, previousGamePost);
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});

test('a known-stale Frenzy destination is repaired when the main launcher opens', async () => {
  const baseContext = originalContext;
  const baseRedis = originalRedis;
  const baseReddit = originalReddit;
  const suffix = Date.now().toString(36);
  const mainPostId = 't3_main-routing-test-' + suffix;
  const stalePostId = 't3_stale-frenzy-routing-test-' + suffix;
  const gamePostKey = 'io:global-game-post-id';
  const staleFrenzyKey = 'io:frenzy:post:' + stalePostId;
  const previousGamePost = await baseRedis.get(gamePostKey);

  configureDevvitRuntime({
    redis: baseRedis,
    context: { ...baseContext, postId: mainPostId, userId: 'chat-routing-test', username: 'ChatRoutingTest' },
    reddit: baseReddit,
  });
  try {
    await baseRedis.set(gamePostKey, stalePostId);
    await baseRedis.set(staleFrenzyKey, JSON.stringify({
      ownerId: 'owner-test',
      ownerUsername: 'Owner',
      subredditName: 'infinity_orbs_dev',
      rarity: 100,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      inGame: true,
    }));

    const result = await getGlobalChatStatus(true, false);
    assert.equal(result.enabled, true);
    assert.equal(await baseRedis.get(gamePostKey), mainPostId);
  } finally {
    await baseRedis.del(staleFrenzyKey);
    await baseRedis.del(gamePostKey);
    if (previousGamePost != null) await baseRedis.set(gamePostKey, previousGamePost);
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});
