import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('mobile primary navigation keeps core destinations visible and moves Quests and Community into More', () => {
  const main = read('src/client/main.tsx');
  const css = read('src/client/experience-200.css');

  assert.ok(main.includes("renderNavItem('roll', 'Roll', Sparkles)"));
  assert.ok(main.includes("renderNavItem('upgrades', 'Upgrades', Zap)"));
  assert.ok(main.includes("renderNavItem('collection', 'Collection', BookOpen)"));
  assert.ok(main.includes("renderNavItem('quests', 'Quests', Calendar, streakReady || questsReady, 'io-nav-mobile-only')"));
  assert.ok(main.includes("renderNavItem('social', 'Community', Users, false, 'io-nav-mobile-only')"));
  assert.ok(main.includes("io-nav-mobile-more-active"));
  assert.ok(css.includes('.io-ui .app-nav:not(.io-nav-combat) .io-nav-primary > .nav-tab:nth-child(n + 4)'));
  assert.ok(css.includes('.io-ui .io-nav-mobile-only { display: flex !important; }'));
});

test('mobile navigation is pinned to the safe-area-aware bottom edge and content clears it', () => {
  const css = read('src/client/experience-200.css');

  assert.ok(css.includes('position: fixed !important;'));
  assert.ok(css.includes('inset: auto 0 0;'));
  assert.ok(css.includes('env(safe-area-inset-bottom, 0px)'));
  assert.ok(css.includes('padding: 12px 11px calc(112px + env(safe-area-inset-bottom, 0px)) !important'));
  assert.ok(css.includes('.io-ui .io-nav-combat .io-nav-combat-list'));
});

test('mobile inputs and primary actions use larger touch targets without fixed-height page scrollers', () => {
  const css = read('src/client/experience-200.css');

  assert.ok(css.includes('min-height: 44px;'));
  assert.ok(css.includes('font-size: 16px;'));
  assert.ok(css.includes('.io-ui .roll-controls .roll-button'));
  assert.ok(css.includes('min-height: 52px;'));
  assert.ok(css.includes('.io-ui .io-page-codex,\n  .io-ui .io-page-quests,\n  .io-ui .io-page-boosters'));
  assert.ok(css.includes('max-height: none !important;'));
  assert.ok(css.includes('overflow: visible !important;'));
});

test('mobile layout preserves reduced-motion preferences', () => {
  const css = read('src/client/experience-200.css');

  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('.io-ui .app-nav,'));
});
