import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  configureDevvitRuntime,
  redis as originalRedis,
  context as originalContext,
  reddit as originalReddit,
} from '../src/server/devvit-mock.js';
import { getImpressionDashboard, recordPostImpression } from '../src/server/impressions.js';

test('post impressions count aggregate metrics without registering online-player activity', async () => {
  const baseRedis = originalRedis;
  const baseContext = originalContext;
  const baseReddit = originalReddit;
  const suffix = Date.now().toString(36);
  const testContext = {
    ...baseContext,
    userId: 'impression-viewer-' + suffix,
    username: 'ImpressionViewer',
    postId: 't3_impression-test-' + suffix,
  };

  configureDevvitRuntime({ redis: baseRedis, context: testContext, reddit: baseReddit });
  try {
    const [before, presenceBefore, registryBefore] = await Promise.all([
      getImpressionDashboard(),
      baseRedis.get('io:online:players'),
      baseRedis.hGetAll('io:player-registry'),
    ]);

    assert.deepEqual(await recordPostImpression('main-game', 'desktop'), { recorded: true });
    assert.deepEqual(await recordPostImpression('orb-share', 'mobile'), { recorded: true });

    const [after, presenceAfter, registryAfter] = await Promise.all([
      getImpressionDashboard(),
      baseRedis.get('io:online:players'),
      baseRedis.hGetAll('io:player-registry'),
    ]);

    assert.equal(after.total - before.total, 2);
    assert.equal(after.byType['main-game'] - before.byType['main-game'], 1);
    assert.equal(after.byType['orb-share'] - before.byType['orb-share'], 1);
    assert.equal(after.byDevice.desktop - before.byDevice.desktop, 1);
    assert.equal(after.byDevice.mobile - before.byDevice.mobile, 1);
    assert.ok(after.posts.some(post => post.postId === testContext.postId && post.postType === 'main-game' && post.impressions === 1));
    assert.ok(after.posts.some(post => post.postId === testContext.postId && post.postType === 'orb-share' && post.impressions === 1));

    assert.equal(presenceAfter, presenceBefore, 'impressions must not touch the online-player sorted set');
    assert.deepEqual(registryAfter, registryBefore, 'impressions must not register player activity');
  } finally {
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});

test('impression recording rejects unsupported post types and skips missing post context', async () => {
  const baseContext = originalContext;
  const baseRedis = originalRedis;
  const baseReddit = originalReddit;
  configureDevvitRuntime({
    redis: baseRedis,
    context: { ...baseContext, userId: '', username: '', postId: '' },
    reddit: baseReddit,
  });
  try {
    assert.deepEqual(await recordPostImpression('frenzy', 'unknown'), { recorded: false });
    await assert.rejects(recordPostImpression('profile', 'desktop'), /Unsupported impression post type/);
  } finally {
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});

test('main game, Orb Share, and Frenzy clients report only coarse aggregate impression fields', () => {
  const splash = readFileSync(resolve(process.cwd(), 'src/client/splash.tsx'), 'utf8');
  const frenzy = readFileSync(resolve(process.cwd(), 'src/client/frenzy.tsx'), 'utf8');
  const reporter = readFileSync(resolve(process.cwd(), 'src/client/impressions.ts'), 'utf8');
  const api = readFileSync(resolve(process.cwd(), 'src/server/app.ts'), 'utf8');
  const admin = readFileSync(resolve(process.cwd(), 'src/server/debug.ts'), 'utf8');

  assert.match(splash, /recordPostImpression\(impressionPostType\)/);
  assert.match(splash, /postData\.type === 'shared-orb' \? 'orb-share' : 'main-game'/);
  assert.match(frenzy, /recordPostImpression\('frenzy'\)/);
  assert.match(reporter, /JSON\.stringify\(\{ postType, deviceType: detectDeviceType\(\) \}\)/);
  assert.doesNotMatch(reporter, /username|userId|user-agent/i);
  assert.match(api, /app\.post\('\/api\/impressions'/);
  assert.match(admin, /debugRouter\.get\('\/impressions'/);
});
