import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCombatArenaRatingUpdate } from '../src/shared/combat.js';

test('Arena rating transfers conserve rating points at the lower and upper caps', () => {
  const cases = [
    { player: 10_000, opponent: 100, won: true },
    { player: 10_000, opponent: 100, won: false },
    { player: 100, opponent: 10_000, won: true },
    { player: 100, opponent: 10_000, won: false },
    { player: 9_999, opponent: 100, won: true },
    { player: 101, opponent: 10_000, won: false },
    { player: 100, opponent: 100, won: true },
    { player: 10_000, opponent: 10_000, won: false },
  ];

  for (const duel of cases) {
    const update = calculateCombatArenaRatingUpdate(duel.player, duel.opponent, duel.won);
    assert.ok(update.playerRating >= 100 && update.playerRating <= 10_000);
    assert.ok(update.opponentRating >= 100 && update.opponentRating <= 10_000);
    assert.equal(
      update.playerRating + update.opponentRating,
      duel.player + duel.opponent,
      `rating pool changed for ${JSON.stringify(duel)}`,
    );
    assert.equal(update.playerChange + update.opponentChange, 0);
    assert.equal(update.playerRating - duel.player, update.playerChange);
    assert.equal(update.opponentRating - duel.opponent, update.opponentChange);
  }
});

test('an outcome cannot award points through an opponent rating floor', () => {
  const topPlayerWin = calculateCombatArenaRatingUpdate(10_000, 100, true);
  assert.deepEqual(topPlayerWin, {
    playerRating: 10_000,
    opponentRating: 100,
    playerChange: 0,
    opponentChange: 0,
  });

  const bottomPlayerLoss = calculateCombatArenaRatingUpdate(100, 10_000, false);
  assert.deepEqual(bottomPlayerLoss, {
    playerRating: 100,
    opponentRating: 10_000,
    playerChange: 0,
    opponentChange: 0,
  });
});
