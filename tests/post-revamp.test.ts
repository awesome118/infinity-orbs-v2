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

test('Frenzy stays playable through the claim cooldown and expiry timer', () => {
  const frenzy = source('src/client/frenzy.tsx');
  const styles = source('src/client/post-revamp.css');

  assert.ok(frenzy.includes('CLAIM THE FRENZY · PLAY NOW'));
  assert.ok(frenzy.includes('START YOUR OWN CODEX'));
  assert.ok(frenzy.includes('Play Infinity Orbs'));
  assert.ok(frenzy.includes("requestExpandedMode(event.nativeEvent, 'game')"));
  assert.ok(frenzy.includes('io-frenzy-button io-post-cta'));
  assert.ok(frenzy.includes('Your claim cooldown'));
  assert.ok(frenzy.includes('You can still play while this timer runs.'));
  assert.ok(frenzy.includes('Frenzy expires in'));
  assert.match(styles, /\.io-frenzy-rarity-number/);
  assert.match(styles, /\.io-frenzy-cooldown-mini/);
});

test('claiming a Frenzy uses the animated main-game-style reward reveal', () => {
  const frenzy = source('src/client/frenzy.tsx');
  const styles = source('src/client/post-revamp.css');

  assert.ok(frenzy.includes('FRENZY REWARD CONFIRMED'));
  assert.ok(frenzy.includes('io-frenzy-success-stage'));
  assert.ok(frenzy.includes('io-frenzy-success-orbit-a'));
  assert.ok(frenzy.includes('io-frenzy-success-particle-a'));
  assert.ok(frenzy.includes('ORBS ROLLED'));
  assert.ok(frenzy.includes('PERSONAL COOLDOWN'));
  assert.ok(frenzy.includes('POST EXPIRES IN'));
  assert.ok(frenzy.includes('Continue Playing'));
  assert.match(styles, /@keyframes io-launch-sphere-float/);
  assert.match(styles, /@keyframes io-frenzy-cooldown-glow/);
  assert.match(styles, /\.io-frenzy-success-orb/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test('main-game and shared-Orb posts use animated Orb hero elements', () => {
  const splash = source('src/client/splash.tsx');
  const styles = source('src/client/post-revamp.css');

  assert.ok(splash.includes('io-launch-orb-stage'));
  assert.ok(splash.includes('io-launch-orb-sphere'));
  assert.ok(splash.includes('io-public-orb-ring-secondary'));
  assert.ok(splash.includes('io-share-orb-spark-a'));
  assert.match(styles, /@keyframes io-launch-ring-counter/);
  assert.match(styles, /@keyframes io-launch-spark-drift/);
  assert.match(styles, /\.io-launch-steps > div:hover/);
});

test('in-game start screen shares the same animated play emphasis', () => {
  const splashScreen = source('src/client/components/SplashScreen.tsx');
  const styles = source('src/client/post-revamp.css');

  assert.ok(splashScreen.includes('io-immersive-play-cta'));
  assert.ok(splashScreen.includes('ready ? (hasProgress ? \'Continue\' : \'Play\')'));
  assert.match(styles, /\.io-immersive-play-cta/);
});
