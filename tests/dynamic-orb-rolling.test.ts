import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROLLING_ORB_RARITIES,
  rollingOrbRaritiesAt,
  rollingOrbRarityAt,
} from '../src/client/rolling-orb-preview.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('rolling preview samples are deterministic and cycle through varied rarities', () => {
  assert.equal(rollingOrbRarityAt(0), 2);
  assert.equal(rollingOrbRarityAt(ROLLING_ORB_RARITIES.length), 2);
  assert.equal(rollingOrbRarityAt(-10), 2);
  assert.equal(rollingOrbRarityAt(0, 1), ROLLING_ORB_RARITIES[1]);
  assert.ok(ROLLING_ORB_RARITIES.every(rarity => Number.isFinite(rarity) && rarity >= 2));
  assert.equal(new Set(ROLLING_ORB_RARITIES).size, ROLLING_ORB_RARITIES.length);
  assert.deepEqual(rollingOrbRaritiesAt(3, 4), [
    rollingOrbRarityAt(3, 0),
    rollingOrbRarityAt(3, 5),
    rollingOrbRarityAt(3, 10),
    rollingOrbRarityAt(3, 15),
  ]);
  assert.equal(rollingOrbRaritiesAt(0, 99).length, 8);
});

test('dynamic reel is cosmetic and only uses the real Orb after the request completes', () => {
  const reel = source('src/client/components/DynamicOrbRoll.tsx');
  const preview = source('src/client/rolling-orb-preview.ts');
  const rollSection = source('src/client/components/RollSection.tsx');
  const main = source('src/client/main.tsx');

  assert.ok(reel.includes('const isSpinning = busy && !frenzyRevealActive'));
  assert.ok(reel.includes('if (!isSpinning || reducedMotion)'));
  assert.ok(reel.includes('rollingOrbRarityAt(frame)'));
  assert.ok(reel.includes('const stageInfo = isSpinning'));
  assert.ok(reel.includes("isSpinning ? 'ROLLING'"));
  assert.ok(reel.includes('{!isSpinning && orb?.isCrit && ('));
  assert.ok(reel.includes('{!isSpinning && orb?.isNew && ('));
  assert.ok(reel.includes('<OrbOrbit orbs={previewOrbit} radius={radius} rolling={isSpinning} />'));
  assert.ok(reel.includes('{!isSpinning && children}'));
  assert.doesNotMatch(preview, /Math\.random/);
  assert.ok(rollSection.includes('<DynamicOrbRoll'));
  assert.ok(rollSection.includes('frenzyRevealActive={frenzyRevealActive}'));
  assert.ok(rollSection.includes('orb={displayOrb}'));
  assert.ok(main.includes('frenzyRevealActive={frenzyProgress.total > 0 && frenzyProgress.percent >= 100}'));

  const css = source('src/client/styles.css');
  assert.match(css, /\.io-main-orb\.is-dynamic-rolling/);
  assert.match(css, /\.io-rolling-orbit/);
  assert.match(css, /\.io-rolling-orb-counter/);
  assert.match(css, /\.io-main-orb\.is-dynamic-rolling, \.io-rolling-orbit, \.io-rolling-orb-counter \{ animation: none !important;/);
});

test('rolling visual does not create a server result or touch roll rewards', () => {
  const reel = source('src/client/components/DynamicOrbRoll.tsx');
  const main = source('src/client/main.tsx');
  assert.doesNotMatch(reel, /fetch\(|\/api\/roll|setLastOrb|setState\(/);
  assert.match(main, /const res = await enqueueMutation\(\(\) => getJson<RollResponse>\('\/api\/roll'/);
  assert.match(main, /setLastOrb\(res\.orb\)/);
  assert.match(main, /setLastBatch\(res\.batch \?\? \[res\.orb\]\)/);
});
