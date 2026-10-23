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

test('dashboard uses a safe timestamp for malformed time inputs', async () => {
  const baseContext = originalContext;
  const baseRedis = originalRedis;
  const baseReddit = originalReddit;
  configureDevvitRuntime({ redis: baseRedis, context: { ...baseContext, postId: 't3_invalid-dashboard-time' }, reddit: baseReddit });
  try {
    const dashboard = await getImpressionDashboard(Number.NaN);
    assert.ok(Number.isFinite(dashboard.generatedAt));
    assert.ok(dashboard.generatedAt > 0);
    assert.equal(dashboard.last24Hours.length, 24);
    assert.equal(dashboard.last30Days.length, 30);
  } finally {
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});

test('impression dashboard treats malformed aggregate counters as zero', async () => {
  const baseContext = originalContext;
  const baseRedis = originalRedis;
  const baseReddit = originalReddit;
  const key = 'io:impressions:total';
  const previous = await baseRedis.get(key);
  configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  try {
    await baseRedis.set(key, '12visits');
    const dashboard = await getImpressionDashboard(Date.UTC(2026, 9, 20));
    assert.equal(dashboard.total, 0);
  } finally {
    if (previous == null) await baseRedis.del(key);
    else await baseRedis.set(key, previous);
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});

test('impression recording ignores unreasonably long post identifiers', async () => {
  const baseContext = originalContext;
  const baseRedis = originalRedis;
  const baseReddit = originalReddit;
  configureDevvitRuntime({ redis: baseRedis, context: { ...baseContext, postId: 'x'.repeat(201) }, reddit: baseReddit });
  try {
    assert.deepEqual(await recordPostImpression('frenzy', 'desktop'), { recorded: false });
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
  assert.doesNotMatch(reporter, /username\s*:|userId\s*:|userAgent\s*:/i);
  assert.match(api, /app\.post\('\/api\/impressions'/);
  assert.match(api, /req\.path === '\/impressions'/);
  assert.match(admin, /debugRouter\.get\('\/impressions'/);
});


test('impression time buckets and per-post counters have bounded retention', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/impressions.ts'), 'utf8');
  assert.match(source, /const postCounterExpiration = new Date\(now \+ 180 \* 86_400_000\)/);
  assert.match(source, /const hourBucketExpiration = new Date\(\(hour \+ 25\) \* 3_600_000\)/);
  assert.match(source, /const dayBucketExpiration = new Date\(\(day \+ 31\) \* 86_400_000\)/);
  assert.match(source, /txn\.set\(keyForPost, String\(nextPost\), \{ expiration: postCounterExpiration \}\)/);
  assert.match(source, /txn\.set\(HOUR_PREFIX \+ hour \+ ':' \+ postType, String\(nextHour\), \{ expiration: hourBucketExpiration \}\)/);
  assert.match(source, /txn\.set\(DAY_PREFIX \+ day \+ ':' \+ postType, String\(nextDay\), \{ expiration: dayBucketExpiration \}\)/);
  assert.match(source, /const postIndexRetentionCutoff = now - 180 \* 86_400_000/);
  assert.match(source, /entry\.invalid \|\| entry\.lastSeenAt < postIndexRetentionCutoff/);
  assert.match(source, /const recentEntries = entries\.filter\(/);
  assert.match(source, /const overflowEntries = recentEntries\.slice\(MAX_INDEXED_POSTS\)/);
  assert.match(source, /\.slice\(0, 250\)/);
});

test('dashboard excludes and cleans expired or corrupt post-index rows during quiet periods', async () => {
  const baseRedis = originalRedis;
  const baseContext = originalContext;
  const baseReddit = originalReddit;
  const suffix = Date.now().toString(36);
  const oldPostId = 't3_stale-impression-index-' + suffix;
  const badPostId = 't3_corrupt-impression-index-' + suffix;
  const indexKey = 'io:impressions:post-index';
  const oldField = 'main-game:' + oldPostId;
  const badField = 'main-game:' + badPostId;
  const oldValue = await baseRedis.hGet(indexKey, oldField);
  const badValue = await baseRedis.hGet(indexKey, badField);
  configureDevvitRuntime({
    redis: baseRedis,
    context: { ...baseContext, userId: 'impression-index-retention-' + suffix, username: 'ImpressionIndexRetention' },
    reddit: baseReddit,
  });
  try {
    const now = Date.now();
    await baseRedis.hSet(indexKey, {
      [oldField]: JSON.stringify({ postType: 'main-game', postId: oldPostId, lastSeenAt: now - 181 * 86_400_000 }),
      [badField]: '{invalid json',
    });
    const dashboard = await getImpressionDashboard(now);
    assert.equal(dashboard.posts.some(row => row.postId === oldPostId || row.postId === badPostId), false);
    assert.equal(await baseRedis.hGet(indexKey, oldField), undefined);
    assert.equal(await baseRedis.hGet(indexKey, badField), undefined);
  } finally {
    if (oldValue == null) await baseRedis.hDel(indexKey, oldField);
    else await baseRedis.hSet(indexKey, { [oldField]: oldValue });
    if (badValue == null) await baseRedis.hDel(indexKey, badField);
    else await baseRedis.hSet(indexKey, { [badField]: badValue });
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});

test('concurrent impression bursts preserve every committed aggregate count', async () => {
  const baseContext = originalContext;
  const baseRedis = originalRedis;
  const baseReddit = originalReddit;
  const suffix = Date.now().toString(36);
  const postId = 't3_impression-burst-' + suffix;
  configureDevvitRuntime({
    redis: baseRedis,
    context: { ...baseContext, postId, userId: 'impression-burst-' + suffix, username: 'ImpressionBurst' },
    reddit: baseReddit,
  });
  try {
    const before = await getImpressionDashboard();
    const burstSize = 16;
    const results = await Promise.all(Array.from({ length: burstSize }, () => recordPostImpression('main-game', 'desktop')));
    assert.ok(results.every(result => result.recorded));
    const after = await getImpressionDashboard();
    assert.equal(after.total - before.total, burstSize);
    assert.equal(after.byType['main-game'] - before.byType['main-game'], burstSize);
    assert.equal(after.byDevice.desktop - before.byDevice.desktop, burstSize);
    const post = after.posts.find(row => row.postId === postId && row.postType === 'main-game');
    assert.equal(post?.impressions, burstSize);
  } finally {
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});

test('impression counters commit together instead of leaving partial counts on failure', async () => {
  const baseRedis = originalRedis;
  const baseContext = originalContext;
  const baseReddit = originalReddit;
  const suffix = Date.now().toString(36);
  const postId = 't3_impression-atomic-' + suffix;
  let injected = false;
  const transactionalRedis = {
    ...baseRedis,
    watch: async (...keys: string[]) => {
      const txn = await baseRedis.watch(...keys);
      return {
        ...txn,
        set: async (key: string, value: string, options?: { expiration?: Date }) => {
          if (!injected && key.startsWith('io:impressions:device:')) {
            injected = true;
            throw new Error('simulated queued counter write failure');
          }
          return txn.set(key, value, options);
        },
      };
    },
  };
  configureDevvitRuntime({
    redis: transactionalRedis,
    context: { ...baseContext, postId, userId: 'impression-atomic-' + suffix, username: 'ImpressionAtomic' },
    reddit: baseReddit,
  });
  try {
    const before = await getImpressionDashboard();
    await assert.rejects(recordPostImpression('main-game', 'desktop'), /simulated queued counter write failure/);
    const after = await getImpressionDashboard();
    assert.equal(after.total, before.total, 'global total must stay unchanged if the multi-key commit was never issued');
    assert.equal(after.byType['main-game'], before.byType['main-game']);
    assert.equal(after.byDevice.desktop, before.byDevice.desktop);
    assert.equal(after.posts.some(post => post.postId === postId), false);
  } finally {
    configureDevvitRuntime({ redis: baseRedis, context: baseContext, reddit: baseReddit });
  }
});
