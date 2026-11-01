import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cooldownMs, createInitialState } from '../src/shared/game.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Celestial Alignment ignores stale pending polls after a choice succeeds', () => {
  const main = source('src/client/main.tsx');

  assert.ok(main.includes('alignmentDismissedPendingAtRef = useRef(0)'));
  assert.ok(main.includes('const chosenPendingAt = Math.max('));
  assert.ok(main.includes('alignmentPendingSeenRef.current'));
  assert.ok(main.includes('Date.now(),'));
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
  assert.ok(chooseHandler.indexOf('setAlignmentPromptVisible(false);') < chooseHandler.indexOf('const result = await getJson'));
  assert.ok(chooseHandler.includes('setAlignmentChoiceError(message);'));
  assert.ok(chooseHandler.includes('setAlignmentPromptVisible(true);'));
  assert.ok(main.includes('data-testid="celestial-alignment-saving"'));
  assert.ok(main.includes('role="alert"'));
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

test('Alignment activation notice remains non-blocking and auto-dismisses after 60 seconds', () => {
  const main = source('src/client/main.tsx');

  assert.ok(main.includes('closesAt: Date.now() + 60_000'));
  assert.ok(main.includes('setAlignmentConfirmationSeconds(60)'));
  assert.ok(main.includes('const remaining = Math.max(0, Math.ceil((closesAt - Date.now()) / 1000))'));
  assert.ok(main.includes('setAlignmentConfirmation(null)'));
  assert.ok(main.includes('autoCooldownBeforeMs === alignmentConfirmation.autoCooldownMs'));
  assert.ok(main.includes('Clockwork cannot shorten it further.'));
});

test('admin-forced Alignment effects remain visible without unlocking mastery', () => {
  const server = source('src/server/game.ts');
  const statusHandler = server.slice(
    server.indexOf('export async function getCelestialAlignmentStatus'),
    server.indexOf('export async function chooseCelestialAlignment'),
  );

  assert.ok(statusHandler.includes('if (!hasMastery && !forcedPending)'));
  assert.ok(statusHandler.includes('const activeChoice = (s.alignmentActiveUntil ?? 0) > now'));
  assert.ok(statusHandler.includes('activeUntil: activeChoice ? s.alignmentActiveUntil ?? 0 : 0'));
  assert.ok(statusHandler.includes('unlocked: false'));
});

test('Alignment statistics are a retryable post-commit projection, not a reason to reject a saved choice', () => {
  const server = source('src/server/game.ts');
  const choiceHandler = server.slice(
    server.indexOf('export async function chooseCelestialAlignment'),
    server.indexOf('export async function synthesizeDust'),
  );
  const statsWriter = server.slice(
    server.indexOf('async function recordCelestialAlignmentChoiceStats'),
    server.indexOf('export async function forceCelestialAlignmentPromptForCurrentUser'),
  );

  assert.ok(choiceHandler.includes('stageSavePostCommitAction(s, async () =>'));
  assert.ok(choiceHandler.includes('await recordCelestialAlignmentChoiceStats(choice, username, now, wasAdminTest)'));
  assert.ok(choiceHandler.indexOf('stageSavePostCommitAction(s') < choiceHandler.indexOf('await save(s)'));
  assert.ok(!choiceHandler.includes('Alignment choice statistics changed during your selection'));
  assert.ok(statsWriter.includes('const maxAttempts = 16'));
  assert.ok(statsWriter.includes('redis.watch(CELESTIAL_ALIGNMENT_CHOICE_STATS_KEY)'));
  assert.ok(statsWriter.includes('if (committed !== null) return;'));
  assert.ok(statsWriter.includes('const alreadyRecorded = previous.recent.some'));
  assert.ok(statsWriter.includes('Player choice was saved, but shared choice statistics could not be updated.'));
});

test('Alignment choice requests wait in both player-action queues instead of failing on short contention', () => {
  const app = source('src/server/app.ts');
  const playerLock = source('src/server/player-lock.ts');
  assert.ok(app.includes('const MUTATION_LOCK_WAIT_MS = 60_000'));
  assert.ok(app.includes('const deadline = Date.now() + MUTATION_LOCK_WAIT_MS'));
  assert.ok(app.includes('await new Promise(resolve => setTimeout(resolve, 100))'));
  assert.ok(playerLock.includes('const PLAYER_MUTATION_LOCK_ATTEMPTS = 1_200'));
  assert.ok(playerLock.includes('const PLAYER_MUTATION_LOCK_RETRY_MS = 25'));
});
