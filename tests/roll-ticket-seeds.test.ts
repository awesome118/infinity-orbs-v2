import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRollRandomSource } from '../src/shared/roll-rng.js';

test('roll seed streams are deterministic', () => {
  const seed = '0123456789abcdef'.repeat(4);
  const a = createRollRandomSource(seed);
  const b = createRollRandomSource(seed);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(a.next(), b.next());
    assert.equal(a.nextRarity(), b.nextRarity());
  }
});

test('ticket seeds are retained, ordered, and replayed for the committed result', () => {
  const game = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const main = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(game, /seeds: string\[\]/);
  assert.match(game, /requestedSeed !== ticket\.seeds\[ticketIndex\]/);
  assert.match(game, /createRollRandomSource\(ticketUse\.ticket\.seeds\[ticketUse\.index\]\)/);
  assert.match(main, /setLastOrb\(prediction\.orb\)/);
  assert.match(main, /ticketSeed,/);
});

test('Auto Roll uses the current saved cooldown and a self-rescheduling timer', () => {
  const main = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  const start = main.indexOf('// Auto Roll uses a single scheduled wake-up');
  const end = main.indexOf('// Standard upgrades are applied optimistically', start);
  assert.ok(start >= 0 && end > start);
  const effect = main.slice(start, end);
  assert.match(effect, /stateRef\.current/);
  assert.match(effect, /cooldownMs\(latest, true\)/);
  assert.match(effect, /window\.setTimeout/);
  assert.doesNotMatch(effect, /setInterval/);
});
test('roll ticket preview simulation runs outside the player mutation lock', () => {
  const game = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const start = game.indexOf('export async function getRollTicket():');
  const end = game.indexOf('async function loadRollTicketForUse(', start);
  assert.ok(start >= 0 && end > start);
  const ticketHandler = game.slice(start, end);
  const lockCallbackEnd = ticketHandler.indexOf('  });');
  const previewStart = ticketHandler.indexOf('await createRollTicketPreviews');
  assert.ok(lockCallbackEnd >= 0 && previewStart > lockCallbackEnd,
    'preview simulation must run after the player mutation lock is released');
  assert.match(ticketHandler, /Preview generation failed; continuing without instant preview/);
});
