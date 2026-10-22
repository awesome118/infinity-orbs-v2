import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('combat save normalization refuses corrupted and unknown-only saves without creating replacement state', () => {
  const combat = source('src/server/combat.ts');
  assert.match(combat, /Combat state is corrupted; refusing to overwrite it/);
  assert.match(combat, /Object\.prototype\.hasOwnProperty\.call\(s,key\)/);
  assert.match(combat, /hasPersistedInventory/);
  assert.match(combat, /explicitlyCleared/);
  assert.doesNotMatch(combat, /if\(s\.inventory\.length===0\)s\.inventory=defaults\.inventory/);
});

test('combat endpoint toggles require boolean intent for Rune and Skill loadouts', () => {
  const combat = source('src/server/combat.ts');
  assert.match(combat, /Choose whether to equip or unequip the Rune/);
  assert.match(combat, /Choose whether to equip or unequip the ability/);
});

test('dungeon switches clear encounter effects and queued reward modifiers', () => {
  const combat = source('src/server/combat.ts');
  const transition = combat.slice(combat.indexOf('export async function setCombatDungeon'), combat.indexOf('// Admin Combat Lab fixtures'));
  for (const field of ['pendingHealAmount = 0', 'burnTicks = 0', 'burnDamage = 0', 'shield = 0', 'delayedDamage = 0', 'nextKillMarkBonus = 0', 'nextKillXpBonus = 0', 'nextRuneDropBonus = 0', 'bountyStreak = 0']) {
    assert.ok(transition.includes(field), 'dungeon transition should clear ' + field);
  }
});

test('reservation and lock identifiers never fall back to Math.random', () => {
  for (const path of ['src/server/game.ts', 'src/server/app.ts', 'src/server/social.ts']) {
    const code = source(path);
    assert.doesNotMatch(code, /Math\.random\s*\(/, path + ' must not create security tokens with Math.random');
    assert.match(code, /getRandomValues/);
  }
});

test('Rune UI serializes mutations and exposes search, filters, progress, and destructive-action safeguards', () => {
  const runes = source('src/client/components/RunesSection.tsx');
  assert.match(runes, /operationLockRef/);
  assert.match(runes, /AbortController/);
  assert.match(runes, /Search Rune inventory by name, rarity, stat, or Major Ability/);
  assert.match(runes, /value="equipped"/);
  assert.match(runes, /value="unequipped"/);
  assert.match(runes, /role="progressbar"/);
  assert.match(runes, /window\.confirm\(/);
  assert.match(runes, /Inventory full/);
  assert.match(runes, /no Runes are equipped/);
});

test('combat UI avoids per-pixel tooltip rerenders and waits for active beats before settings writes', () => {
  const combat = source('src/client/components/CombatSection.tsx');
  assert.doesNotMatch(combat, /onPointerMove=\{event=>/);
  assert.match(combat, /onPointerEnter=\{event=>/);
  assert.match(combat, /const activeBeat=runtime\.current\.beatPromise;/);
  assert.match(combat, /role="alert"/);
});

test('single upgrades, bulk upgrades, and Turbo cannot overlap', () => {
  const upgrades = source('src/client/components/UpgradesSection.tsx');
  assert.match(upgrades, /upgradeActionLockRef/);
  assert.match(upgrades, /upgradingId !== null/);
  assert.match(upgrades, /if \(busy \|\| upgradeActionLockRef\.current\) return/);
});

test('daily streak preview resets after a missed day and quest bars are guarded and accessible', () => {
  const quests = source('src/client/components/QuestsAndStreaks.tsx');
  assert.match(quests, /lastClaimDate === yesterday/);
  assert.match(quests, /streakIsActive/);
  assert.match(quests, /progressPercent/);
  assert.match(quests, /role="progressbar"/);
});

test('Global Chat network requests have a bounded timeout and message input has an accessible label', () => {
  const chat = source('src/client/components/GlobalChatWindow.tsx');
  assert.match(chat, /function fetchChat/);
  assert.match(chat, /timeoutMs = 12_000/);
  assert.match(chat, /controller\.abort\(\)/);
  assert.match(chat, /aria-label="Write a public Global Chat message"/);
});

test('shared CSS supports keyboard focus, mobile Rune filters, and reduced motion', () => {
  const css = source('src/client/styles.css');
  assert.match(css, /\.io-runes-inventory-controls/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('game API client does not retry non-retryable HTTP errors as if they were network failures', () => {
  const main = source('src/client/main.tsx');
  assert.match(main, /let receivedNonRetryableHttpError = false/);
  assert.match(main, /!receivedNonRetryableHttpError/);
  assert.match(main, /const retryableRead =/);
});

test('upgrade feedback timers are cleaned up and reduced-motion users skip confetti', () => {
  const upgrades = source('src/client/components/UpgradesSection.tsx');
  assert.match(upgrades, /recentUpgradeTimerRef/);
  assert.match(upgrades, /window\.clearTimeout\(recentUpgradeTimerRef\.current\)/);
  assert.match(upgrades, /prefers-reduced-motion: reduce/);
  assert.match(upgrades, /allowMotionEffects\(\)/);
});

test('run resets clear stale Last Attack state before a new descent', () => {
  const combat = source('src/server/combat.ts');
  assert.match(combat, /state\.skillRuntime\.lastAttackDamage = 0/);
  assert.match(combat, /s\.skillRuntime\.lastAttackDamage=0/);
});

test('mobile Gear cards reveal details on touch before equipping and expose the popover state', () => {
  const combat = source('src/client/components/CombatSection.tsx');
  assert.match(combat, /lastPointerTypeRef\.current==='touch'\)setShowTooltip/);
  assert.match(combat, /aria-expanded=\{showTooltip\}/);
  assert.match(combat, /aria-controls=\{tooltipId\}/);
  assert.match(combat, /role="group" aria-label=\{item\.name\+' details'\}/);
});

test('Reddit Share dialog has a programmatic name and explicit dialog semantics', () => {
  const share = source('src/client/components/RedditShareModal.tsx');
  assert.match(share, /role="dialog" aria-modal="true"/);
  assert.match(share, /aria-labelledby="io-share-dialog-title"/);
  assert.match(share, /id="io-share-dialog-title"/);
});

test('Rune refresh announces loading and Strengthen selection cannot be cancelled mid-mutation', () => {
  const runes = source('src/client/components/RunesSection.tsx');
  assert.match(runes, /Refreshing Rune inventory/);
  assert.match(runes, /aria-busy=\{loading\|\|operationPending\}/);
  assert.match(runes, /disabled=\{operationPending\|\|sacrificing\}/);
});

test('Global Chat closes on Escape and announces new message additions', () => {
  const chat = source('src/client/components/GlobalChatWindow.tsx');
  assert.match(chat, /event\.key === 'Escape'/);
  assert.match(chat, /role="log"/);
  assert.match(chat, /aria-relevant="additions text"/);
});

test('inline post entrypoints are bounded tap-only previews with a click-driven Expanded Mode path', () => {
  const manifest = JSON.parse(source('devvit.json')) as {
    post: { entrypoints: Record<string, { inline?: boolean; height?: string; entry?: string }> };
  };
  assert.equal(manifest.post.entrypoints.default?.entry, 'splash.html');
  assert.equal(manifest.post.entrypoints.default?.height, 'tall');
  assert.equal(manifest.post.entrypoints.frenzy?.entry, 'frenzy.html');
  assert.equal(manifest.post.entrypoints.frenzy?.height, 'tall');
  assert.equal(manifest.post.entrypoints.game?.entry, 'game.html');

  for (const htmlPath of ['src/client/splash.html', 'src/client/frenzy.html']) {
    const html = source(htmlPath);
    assert.match(html, /class="io-inline-post"/, htmlPath + ' must declare the inline-safe document class');
    assert.match(html, /id="root" class="io-inline-post"/, htmlPath + ' must bound its root');
  }

  const splash = source('src/client/splash.tsx');
  const frenzy = source('src/client/frenzy.tsx');
  assert.match(splash, /requestExpandedMode\(e\.nativeEvent, 'game'\)/);
  assert.match(frenzy, /requestExpandedMode\(event\.nativeEvent, 'game'\)/);
  assert.doesNotMatch(splash, /overflow-(?:y-)?(?:auto|scroll)|overflow\s*:\s*(?:auto|scroll)/);
  assert.doesNotMatch(frenzy, /overflow-(?:y-)?(?:auto|scroll)|overflow\s*:\s*(?:auto|scroll)/);
  assert.doesNotMatch(frenzy, /GlobalChatWindow/, 'the inline Frenzy post must not mount the independently scrollable chat history');
  assert.doesNotMatch(splash, /onWheel\s*=|onTouchMove\s*=|onPointerMove\s*=/);
  assert.doesNotMatch(frenzy, /onWheel\s*=|onTouchMove\s*=|onPointerMove\s*=/);

  const css = source('src/client/styles.css');
  const publicRule = css.match(/^\s*\.io-public\s*\{([^}]+)\}/m)?.[1] ?? '';
  assert.match(publicRule, /overflow:\s*clip/);
  assert.match(publicRule, /touch-action:\s*pan-y pinch-zoom/);
  assert.match(publicRule, /overscroll-behavior:\s*auto/);
  assert.doesNotMatch(publicRule, /overflow(?:-y)?:\s*(?:auto|scroll)/);
  const documentRule = css.match(/html\.io-inline-post,\s*body\.io-inline-post\s*\{([^}]+)\}/)?.[1] ?? '';
  const rootRule = css.match(/#root\.io-inline-post\s*\{([^}]+)\}/)?.[1] ?? '';
  for (const rule of [documentRule, rootRule]) {
    assert.match(rule, /touch-action:\s*pan-y pinch-zoom/);
    assert.match(rule, /overscroll-behavior:\s*auto/);
    assert.doesNotMatch(rule, /touch-action:\s*none|overscroll-behavior:\s*none|overflow(?:-[xy])?:\s*(?:auto|scroll)/);
  }
  assert.match(frenzy, /io-frenzy-success-card/);
  assert.match(frenzy, /Continue in Infinity Orbs/);
  assert.match(guard, /Inline public-card selector/);
  assert.match(css, /#root\.io-inline-post \.io-frenzy-card \{\s*box-sizing: border-box;\s*padding: 14px 22px;\s*overflow: clip;/);
});

test('the deploy guard rejects inline scroll traps while keeping expanded-game scrolling available', () => {
  const guard = source('scripts/predeploy-check.mjs');
  assert.match(guard, /must not mount GlobalChatWindow/);
  assert.match(guard, /must not introduce a nested scroll panel into an inline post/);
  assert.match(guard, /must allow native vertical scrolling with touch-action: pan-y/);
  assert.match(guard, /addEventListener\\s\*\\\\?\s*\(\s*\[?['"]\(\?:wheel\|touchmove\|pointermove\)/);
  const css = source('src/client/styles.css');
  assert.match(css, /\.io-combat-log\{[^}]*overflow:auto/);
  assert.match(css, /#root\.io-inline-post > \.io-public/);
});
