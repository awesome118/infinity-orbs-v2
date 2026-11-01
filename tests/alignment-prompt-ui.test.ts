import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cooldownMs, createInitialState } from '../src/shared/game.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Celestial Alignment ignores stale pending polls after a choice succeeds', () => {
  const main = source('src/client/main.tsx');

  assert.ok(main.includes('alignmentDismissedPendingAtRef = useRef(0)'));
  assert.ok(main.includes('const chosenPendingAt = alignmentStatus?.pendingAt ?? 0'));
  assert.ok(main.includes('alignmentDismissedPendingAtRef.current = Math.max(alignmentDismissedPendingAtRef.current, chosenPendingAt)'));
  assert.ok(main.includes('const pendingWasDismissed = status.pending &&'));
  assert.ok(main.includes('if (pendingWasDismissed) return;'));
  assert.ok(main.includes('if (!alignmentConfirmationRef.current) setAlignmentPromptVisible(false)'));
});

test('Celestial Alignment closes the blocking chooser immediately after selection', () => {
  const main = source('src/client/main.tsx');
  const chooseHandler = main.slice(main.indexOf('const handleChooseCelestialAlignment'), main.indexOf('// Altar Sacrifice'));

  assert.ok(chooseHandler.includes('setAlignmentConfirmation(confirmation);'));
  assert.ok(chooseHandler.includes('setAlignmentConfirmationSeconds(60);'));
  assert.ok(chooseHandler.includes('setAlignmentPromptVisible(false);'));
  assert.ok(main.includes('alignmentPromptVisible && alignmentConfirmation === null && alignmentStatus?.pending'));
  assert.ok(main.includes('pointer-events-none fixed right-4 top-4'));
  assert.ok(main.includes('role="status" aria-live="polite"'));
  assert.ok(!main.includes('alignmentPromptVisible && (alignmentConfirmation !== null || alignmentStatus?.pending)'));
});

test('Clockwork reduces real Auto Roll cooldown by 20%, but does not change manual rolls', () => {
  const now = Date.now();
  const base = createInitialState(now);
  const active = {
    ...base,
    alignmentActiveChoice: 'clockwork' as const,
    alignmentActiveUntil: now + 60 * 60 * 1000,
  };

  const regularAutoCooldown = cooldownMs(base, true);
  const clockworkAutoCooldown = cooldownMs(active, true);
  assert.equal(clockworkAutoCooldown, Math.max(300, Math.round(regularAutoCooldown * 0.8)));
  assert.equal(cooldownMs(active, false), cooldownMs(base, false));
});

test('Clockwork applies through the Auto Roll request, server cooldown, and live client timer', () => {
  const client = source('src/client/main.tsx');
  const server = source('src/server/game.ts');
  const app = source('src/server/app.ts');
  const rollHandler = server.slice(
    server.indexOf('export async function roll('),
    server.indexOf('export async function subscribeToSubredditForReward'),
  );

  assert.ok(client.includes('auto: isAutoRoll'));
  assert.ok(app.includes('req.body?.auto === true'));
  assert.ok(rollHandler.includes('const cd = cooldownMs(s, isAuto)'));
  assert.ok(rollHandler.includes('rollsRemainingUntilNext: cd'));
  assert.ok(client.includes('setReadyAt(lastRollAt + cooldownMs(timingState, true))'));
});
