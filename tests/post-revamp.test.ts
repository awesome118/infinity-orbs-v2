import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('production Redis MGet is bounded and adapts to Devvit response-size limits', () => {
  const index = source('src/server/index.ts');
  const batch = source('src/server/redis-batch.ts');

  assert.match(index, /new Proxy\(redis/);
  assert.match(index, /property === 'mGet'/);
  assert.match(index, /mGetInChunks/);
  assert.match(batch, /REDIS_MGET_BATCH_SIZE = 20/);
  assert.match(batch, /max response size limit/i);
});

test('main and shared post CTAs use the animated high-visibility play button', () => {
  const splash = source('src/client/splash.tsx');
  const styles = source('src/client/post-revamp.css');

  assert.ok(splash.includes('io-post-cta'));
  assert.ok(splash.includes('YOUR FIRST ORB IS ONE TAP AWAY'));
  assert.ok(splash.includes('YOUR CODEX STARTS WITH ONE ROLL'));
  assert.match(styles, /@keyframes io-post-cta-pulse/);
  assert.match(styles, /@keyframes io-post-cta-sheen/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test('Frenzy stays playable after a claim becomes unavailable', () => {
  const frenzy = source('src/client/frenzy.tsx');
  const styles = source('src/client/post-revamp.css');

  assert.ok(frenzy.includes('CLAIM THE FRENZY · PLAY NOW'));
  assert.ok(frenzy.includes('START YOUR OWN CODEX'));
  assert.ok(frenzy.includes('Play Infinity Orbs'));
  assert.ok(frenzy.includes("requestExpandedMode(event.nativeEvent, 'game')"));
  assert.ok(frenzy.includes('io-frenzy-button io-post-cta'));
  assert.match(styles, /\.io-frenzy-rarity-number/);
});

test('in-game start screen shares the same animated play emphasis', () => {
  const splashScreen = source('src/client/components/SplashScreen.tsx');
  const styles = source('src/client/post-revamp.css');

  assert.ok(splashScreen.includes('io-immersive-play-cta'));
  assert.ok(splashScreen.includes('ready ? (hasProgress ? \'Continue\' : \'Play\')'));
  assert.match(styles, /\.io-immersive-play-cta/);
});
