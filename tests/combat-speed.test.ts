import assert from 'node:assert/strict';
import test from 'node:test';
import { combatActionTimeline, combatNextActor } from '../src/shared/combat.js';

function scheduledTurns(playerSpeed: number, enemySpeed: number, count: number): Array<'player' | 'enemy'> {
  let playerResolved = 0;
  let enemyResolved = 0;
  const turns: Array<'player' | 'enemy'> = [];

  for (let turn = 0; turn < count; turn += 1) {
    const actor = combatNextActor(playerSpeed, enemySpeed, playerResolved, enemyResolved);
    turns.push(actor);
    if (actor === 'player') playerResolved += 1;
    else enemyResolved += 1;
  }

  return turns;
}

test('300 player Speed versus 100 enemy Speed gives three player turns per enemy turn', () => {
  assert.deepEqual(scheduledTurns(300, 100, 8), [
    'player', 'player', 'player', 'enemy',
    'player', 'player', 'player', 'enemy',
  ]);
});

test('equal Speed alternates after resolving a player-favored tie', () => {
  assert.deepEqual(scheduledTurns(100, 100, 6), [
    'player', 'enemy', 'player', 'enemy', 'player', 'enemy',
  ]);
});

test('a combatant with zero Speed does not act while the other has Speed', () => {
  assert.deepEqual(scheduledTurns(0, 100, 3), ['enemy', 'enemy', 'enemy']);
  assert.deepEqual(scheduledTurns(100, 0, 3), ['player', 'player', 'player']);
});

test('turn timeline contains only the next integer-numbered slot, never a fractional beat', () => {
  assert.deepEqual(combatActionTimeline(300, 100, 1, 0, 0, 1, 1, 1), [
    { actor: 'player', actionIndex: 0, time: 0 },
  ]);
  assert.deepEqual(combatActionTimeline(300, 100, 2, 3, 0, 1, 1, 2), [
    { actor: 'enemy', actionIndex: 0, time: 0 },
  ]);
});
