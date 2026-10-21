import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeImpressionCount } from '../src/server/impressions.js';
import { classifyImpressionDeviceType } from '../src/client/impressions.js';

test('impression counters reject partial, negative, fractional, and unsafe values', () => {
  assert.equal(normalizeImpressionCount('123'), 123);
  assert.equal(normalizeImpressionCount('0'), 0);
  assert.equal(normalizeImpressionCount('12garbage'), 0);
  assert.equal(normalizeImpressionCount('-1'), 0);
  assert.equal(normalizeImpressionCount('1.5'), 0);
  assert.equal(normalizeImpressionCount(String(Number.MAX_SAFE_INTEGER + 1)), 0);
});

test('coarse device classification identifies Android tablets and unknown environments', () => {
  assert.equal(classifyImpressionDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel C) AppleWebKit/537.36', 'Linux arm', 5), 'tablet');
  assert.equal(classifyImpressionDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel 9 Mobile) Mobile', 'Linux arm', 5), 'mobile');
  assert.equal(classifyImpressionDeviceType('', '', 0), 'unknown');
  assert.equal(classifyImpressionDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)', 'MacIntel', 0), 'desktop');
});

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Rune mutations cannot overlap and delayed reads cannot override the current snapshot', () => {
  const runes = source('src/client/components/RunesSection.tsx');
  assert.match(runes, /const actionInFlightRef=useRef\(false\)/);
  assert.match(runes, /snapshotRequestSequenceRef\.current\+=1/);
  assert.match(runes, /requestSequence!==snapshotRequestSequenceRef\.current/);
  assert.match(runes, /if\(!beginAction\(\)\)return/);
  assert.match(runes, /aria-describedby=\{'io-rune-tooltip-'/);
});

test('Streak reward previews match the configured reward table and quest progress is accessible', () => {
  const quests = source('src/client/components/QuestsAndStreaks.tsx');
  assert.match(quests, /const reward = streakRewards\[day - 1\]/);
  assert.match(quests, /fmt\(reward\.coins\)/);
  assert.match(quests, /fmt\(reward\.shards\)/);
  assert.doesNotMatch(quests, /fmt\(day \* 100\)/);
  assert.match(quests, /const target = Number\.isFinite\(q\.target\) && q\.target > 0/);
  assert.match(quests, /role="progressbar" aria-label=\{q\.title \+ ' progress'\}/);
  assert.match(quests, /Resets daily at midnight UTC/);
});

test('Public share previews validate metadata and launch failures are visible and retryable', () => {
  const splash = source('src/client/splash.tsx');
  assert.match(splash, /function PlayGameButton/);
  assert.match(splash, /Promise\.resolve\(request\)\.catch\(failed\)/);
  assert.match(splash, /postData\.type === 'shared-orb'/);
  assert.match(splash, /Orb preview unavailable/);
  assert.match(splash, /Number\.isSafeInteger\(count\) && count >= 0/);
});

test('combat controls expose health and selection state and retry always refreshes', () => {
  const combat = source('src/client/components/CombatSection.tsx');
  assert.match(combat, /aria-label="Player health" aria-valuemin=\{0\} aria-valuemax=\{100\}/);
  assert.match(combat, /aria-label=\{enemy\.name\+' health'\}/);
  assert.match(combat, /aria-pressed=\{intent===cmd\}/);
  assert.match(combat, /setError\(''\);void load\(\)/);
  assert.match(combat, /cache:'no-store'/);
});

test('roll and feedback controls prevent duplicates and announce state', () => {
  const roll = source('src/client/components/RollSection.tsx');
  const feedback = source('src/client/components/FeedbackModal.tsx');
  const chat = source('src/client/components/GlobalChatWindow.tsx');
  assert.match(roll, /disabled=\{busy\}[\s\S]{0,40}aria-busy=\{busy\}/);
  assert.match(feedback, /maxLength=\{2000\}/);
  assert.match(feedback, /aria-pressed=\{type === 'bug'\}/);
  assert.match(feedback, /aria-live=\{error \? 'assertive' : 'polite'\}/);
  assert.match(chat, /role="log"/);
  assert.match(chat, /aria-label=\{sending \? 'Sending public comment' : 'Send public comment'\}/);
});

