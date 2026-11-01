import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('rarity milestone icons use the canonical orb colors and only shine when reached', () => {
  const icon = readFileSync(resolve(process.cwd(), 'src/client/components/RarityOrbIcon.tsx'), 'utf8');
  const codex = readFileSync(resolve(process.cwd(), 'src/client/components/CollectionSection.tsx'), 'utf8');
  const table = readFileSync(resolve(process.cwd(), 'src/client/components/RarityTableModal.tsx'), 'utf8');

  assert.ok(icon.includes('getOrbInfo(rarity)'));
  assert.ok(icon.includes('info.color'));
  assert.ok(icon.includes('info.bgGradient'));
  assert.ok(icon.includes("unlocked ? 'is-unlocked' : 'is-locked'"));
  assert.ok(codex.includes('<RarityOrbIcon rarity={milestone.minRarity} unlocked={reached} />'));
  assert.ok(codex.includes("'--io-tier-color': milestone.color"));
  assert.ok(table.includes('<RarityOrbIcon rarity={tier.minRarity} unlocked={highestRarity >= tier.minRarity} compact />'));
});

test('rarity orb sizes increase in fullscreen and animated effects respect reduced motion', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/client/experience-200.css'), 'utf8');

  assert.ok(css.includes(':fullscreen .io-rarity-orb-icon'));
  assert.ok(css.includes('html:fullscreen .io-rarity-orb-icon'));
  assert.ok(css.includes('@media (display-mode: fullscreen)'));
  assert.ok(css.includes('width: clamp(62px, 6.2vw, 116px)'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('.io-rarity-orb-icon__shine'));
  assert.ok(css.includes('@keyframes io-rarity-orb-pulse'));
  assert.ok(css.includes('@keyframes io-rarity-orb-sheen'));
});

test('Devvit expanded mode gets roomy Codex cards and a wide rarity table', () => {
  const responsiveCss = readFileSync(resolve(process.cwd(), 'src/client/mobile-experience.css'), 'utf8');
  const main = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');

  assert.ok(main.includes("useState<'inline' | 'expanded'>"));
  assert.ok(main.includes('getWebViewMode()'));
  assert.ok(main.includes("window.addEventListener('focus', syncWebViewMode)"));
  assert.ok(main.includes("'io-expanded-view'"));
  assert.ok(responsiveCss.includes('.io-ui.io-expanded-view .io-page-codex .io-codex-milestone-grid'));
  assert.ok(responsiveCss.includes('repeat(auto-fit, minmax(min(100%, 220px), 1fr))'));
  assert.ok(responsiveCss.includes('width: clamp(84px, 6.5vw, 116px) !important'));
  assert.ok(responsiveCss.includes('.io-ui.io-expanded-view .io-rarity-modal'));
  assert.ok(responsiveCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important'));
});

test('the fourth rarity continuum row has animated shifting spectrum colors', () => {
  const responsiveCss = readFileSync(resolve(process.cwd(), 'src/client/mobile-experience.css'), 'utf8');
  const table = readFileSync(resolve(process.cwd(), 'src/client/components/RarityTableModal.tsx'), 'utf8');

  assert.ok(table.includes("tierIndex === 3 ? 'io-rarity-tier-row--shifting'"));
  assert.ok(responsiveCss.includes('.io-rarity-tier-row--shifting'));
  assert.ok(responsiveCss.includes('@keyframes io-rarity-epic-row-shift'));
  assert.ok(responsiveCss.includes('@keyframes io-rarity-epic-orb-shift'));
  assert.ok(responsiveCss.includes('io-rarity-tier-row--shifting::before'));
  assert.ok(responsiveCss.includes('@media (prefers-reduced-motion: reduce)'));
});
