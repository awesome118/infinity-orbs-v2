import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('mobile stylesheet is loaded after desktop and general experience polish', () => {
  const main = read('src/client/main.tsx');
  const styles = main.indexOf("import './styles.css'");
  const polish = main.indexOf("import './ui-polish.css'");
  const experience = main.indexOf("import './experience-200.css'");
  const mobile = main.indexOf("import './mobile-experience.css'");

  assert.ok(styles >= 0 && styles < polish);
  assert.ok(polish < experience && experience < mobile);
});

test('mobile navigation keeps core tabs visible and routes secondary tabs through More', () => {
  const main = read('src/client/main.tsx');
  const css = read('src/client/mobile-experience.css');

  assert.ok(main.includes("renderNavItem('roll', 'Roll', Sparkles)"));
  assert.ok(main.includes("renderNavItem('upgrades', 'Upgrades', Zap)"));
  assert.ok(main.includes("renderNavItem('collection', 'Collection', BookOpen)"));
  assert.ok(main.includes("renderNavItem('quests', 'Quests', Calendar, streakReady || questsReady, 'io-nav-mobile-only')"));
  assert.ok(main.includes("renderNavItem('social', 'Community', Users, false, 'io-nav-mobile-only')"));
  assert.ok(css.includes('.io-ui .app-nav:not(.io-nav-combat) .io-nav-primary > .nav-tab:nth-child(n + 4)'));
  assert.ok(css.includes('.io-ui .io-nav-mobile-only { display: flex !important; }'));
  assert.ok(css.includes('.io-ui .io-nav-combat .io-nav-combat-list'));
});

test('mobile shell respects safe areas and leaves one natural document scroller', () => {
  const css = read('src/client/mobile-experience.css');

  assert.ok(css.includes('env(safe-area-inset-top, 0px)'));
  assert.ok(css.includes('env(safe-area-inset-bottom, 0px)'));
  assert.ok(css.includes('position: fixed !important;'));
  assert.ok(css.includes('inset: auto 0 0;'));
  assert.ok(css.includes('overflow-y: auto !important;'));
  assert.ok(css.includes('max-height: none !important;'));
});

test('mobile roll and progression pages use readable card layouts and large actions', () => {
  const css = read('src/client/mobile-experience.css');

  assert.ok(css.includes('.io-ui .roll-controls .roll-button'));
  assert.ok(css.includes('min-height: 54px;'));
  assert.ok(css.includes('.io-ui .io-page-upgrades > .io-page-hero + div > section > .grid'));
  assert.ok(css.includes('.io-ui .io-page-codex > .grid[class*="grid-cols-"]'));
  assert.ok(css.includes('.io-ui .io-page-quests > .io-page-hero ~ div.space-y-3 > .grid'));
  assert.ok(css.includes('.io-ui .io-page-social > [role="group"][aria-label="Guilds and social sections"]'));
  assert.ok(css.includes('.io-ui .io-page-altar > form'));
  assert.ok(css.includes('.io-ui .io-page-mastery > .io-page-hero + div'));
  assert.ok(css.includes('.io-ui .io-page-boosters > section'));
});

test('all combat destinations and rune tools receive dedicated phone layouts', () => {
  const css = read('src/client/mobile-experience.css');

  for (const page of ['fight','dungeons','gear','forge','skills','arena']) {
    assert.ok(css.includes('.io-ui .io-combat-page-' + page), 'missing responsive rules for ' + page);
  }
  assert.ok(css.includes('.io-ui .io-runes-page .io-runes-inventory'));
  assert.ok(css.includes('.io-ui .io-runes-page .io-runes-filter-group'));
});

test('dialogs remain scrollable above the bottom navigation and preserve reduced motion', () => {
  const css = read('src/client/mobile-experience.css');

  assert.ok(css.includes('.io-ui .io-modal-backdrop'));
  assert.ok(css.includes('max-height: min(90dvh, 820px) !important;'));
  assert.ok(css.includes('overscroll-behavior: contain;'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
});
