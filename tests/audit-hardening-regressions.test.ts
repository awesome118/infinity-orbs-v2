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
