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

  assert.match(reel, /if \(!busy \|\| reducedMotion\)/);
  assert.match(reel, /rollingOrbRarityAt\(frame\)/);
  assert.match(reel, /const stageInfo = busy\\s+\\? previewInfo\\s+: orb/);
  assert.match(reel, /aria-busy=\{busy\}/);
  assert.match(reel, /busy \? 'ROLLING'/);
  assert.match(reel, /\!busy && orb\?\.isCrit/);
  assert.match(reel, /\!busy && orb\?\.isNew/);
  assert.match(reel, /OrbOrbit orbs=\{previewOrbit\} radius=\{radius\} rolling=\{busy\}/);
  assert.doesNotMatch(preview, /Math\.random/);
  assert.match(rollSection, /<DynamicOrbRoll/);
  assert.match(rollSection, /orb=\{displayOrb\}/);
});

test('rolling visual does not create a server result or touch roll rewards', () => {
  const reel = source('src/client/components/DynamicOrbRoll.tsx');
  const main = source('src/client/main.tsx');
  assert.doesNotMatch(reel, /fetch\(|\/api\/roll|setLastOrb|setState\(/);
  assert.match(main, /const res = await enqueueMutation\(\(\) => getJson<RollResponse>\('\/api\/roll'/);
  assert.match(main, /setLastOrb\(res\.orb\)/);
  assert.match(main, /setLastBatch\(res\.batch \?\? \[res\.orb\]\)/);
});
