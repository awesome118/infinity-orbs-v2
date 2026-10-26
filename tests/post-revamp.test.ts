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
  assert.ok(frenzy.includes('Continue in Infinity Orbs'));
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

test('post rings stay centered, all main-post rings rotate smoothly, and shared Orb glow is restrained', () => {
  const styles = source('src/client/post-revamp.css');
  const splash = source('src/client/splash.tsx');
  assert.ok(styles.includes('.io-public-orb-ring-secondary'));
  assert.ok(styles.includes('.io-public-orb-ring-tertiary'));
  assert.ok(styles.includes('animation: io-launch-ring-a-spin 18s linear infinite'));
  assert.ok(styles.includes('animation: io-launch-ring-b-spin 23s linear infinite'));
  assert.ok(styles.includes('animation: io-launch-ring-c-spin 32s linear infinite'));
  assert.ok(styles.includes('@keyframes io-frenzy-arc-a-spin'));
  assert.ok(styles.includes('@keyframes io-frenzy-arc-b-spin'));
  assert.ok(splash.includes('0 0 16px \u0024{info.color}18'));
});

test('Frenzy post claim arms the main-game reward animation instead of consuming it in preview', () => {
  const frenzy = source('src/client/frenzy.tsx');
  const game = source('src/client/main.tsx');
  assert.match(frenzy, /requestExpandedMode\(event\.nativeEvent, 'game'\)/);
  assert.match(frenzy, /fetchWithTimeout\('\/api\/frenzy\/arm', \{ method: 'POST' \}, 10_000\)/);
  assert.match(game, /getJson<\{ armed: boolean \}>\('\/api\/frenzy\/handoff'\)/);
  assert.match(game, /if \(!handoff\.armed\)[\s\S]{0,250}continue;/);
  assert.match(game, /setLastBatch\(revealBatch\)/);
});

test('in-game start screen shares the same animated play emphasis', () => {
  const splashScreen = source('src/client/components/SplashScreen.tsx');
  const styles = source('src/client/post-revamp.css');

  assert.ok(splashScreen.includes('io-immersive-play-cta'));
  assert.ok(splashScreen.includes('ready ? (hasProgress ? \'Continue\' : \'Play\')'));
  assert.match(styles, /\.io-immersive-play-cta/);
});

test('post animations are low-paint, Frenzy orbits are centered, and skill Equip remains reachable', () => {
  const styles = source('src/client/post-revamp.css');
  const globalStyles = source('src/client/styles.css');
  const frenzy = source('src/client/frenzy.tsx');
  const combat = source('src/client/components/CombatSection.tsx');

  assert.match(styles, /Performance pass: low-paint post animations and centered Frenzy orbits/);
  assert.match(styles, /\.io-frenzy-orbit-arc\s*\{[^}]*top:\s*50%[^}]*left:\s*50%/s);
  assert.match(styles, /#root\.io-inline-post[\s\S]*?io-frenzy-success-particle[\s\S]*?animation:\s*none !important/);
  assert.match(frenzy, /now - lastUpdateAt >= 100/);
  assert.match(frenzy, /fetchWithTimeout\('\/api\/frenzy\/arm', \{ method: 'POST' \}, 10_000\)/);
  assert.doesNotMatch(frenzy, /fetchWithTimeout\('\/api\/frenzy\/claim'/);
  assert.match(globalStyles, /bottom:calc\(100% \+ 2px\)/);
  assert.match(combat, /skillTooltipCloseTimerRef/);
  assert.match(combat, /onPointerEnter=\{cancelSkillTooltipClose\}/);
  assert.match(combat, /scheduleSkillTooltipClose\(skill\.id\)/);
});
