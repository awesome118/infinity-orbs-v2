import test from 'node:test';
import assert from 'node:assert/strict';

import {
  configureDevvitRuntime,
  redis as originalRedis,
  context as originalContext,
  reddit as originalReddit,
} from '../src/server/devvit-mock.js';
import { getMe, hasCompletedFirstRollTutorial, markFirstRollTutorialSeen } from '../src/server/game.js';

test('state reads do not register a player before an explicit heartbeat', async () => {
  const suffix = Date.now().toString(36);
  const userId = 'preview-only-' + suffix;
  const testContext = {
    ...originalContext,
    userId,
    username: 'PreviewOnly',
  };

  configureDevvitRuntime({ redis: originalRedis, context: testContext, reddit: originalReddit });
  try {
    const registryBefore = await originalRedis.hGetAll('io:player-registry');
    await getMe();
    const registryAfter = await originalRedis.hGetAll('io:player-registry');
    const presence = JSON.parse(String(await originalRedis.get('io:online:players') ?? '{}')) as Record<string, number>;

    assert.equal(registryAfter[userId], registryBefore[userId], 'GET /api/me must not add a player-registry entry');
    assert.equal(presence[userId], undefined, 'GET /api/me must not add a live online-presence entry');
  } finally {
    configureDevvitRuntime({ redis: originalRedis, context: originalContext, reddit: originalReddit });
  }
});

test('first-roll tutorial completion is persistent per account', async () => {
  const userId = 'tutorial-player-' + Date.now().toString(36);
  const testContext = {
    ...originalContext,
    userId,
    username: 'TutorialPlayer',
  };

  configureDevvitRuntime({ redis: originalRedis, context: testContext, reddit: originalReddit });
  try {
    assert.equal(await hasCompletedFirstRollTutorial(), false);
    await markFirstRollTutorialSeen();
    assert.equal(await hasCompletedFirstRollTutorial(), true);
  } finally {
    configureDevvitRuntime({ redis: originalRedis, context: originalContext, reddit: originalReddit });
  }
});
