import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMBAT_MAX_DEPTH,
  combatActionsDue,
  combatActionTimeline,
  combatHighestDepthReached,
} from '../src/shared/combat.js';

test('player and enemy strikes interleave by their Speed thresholds', () => {
  const playerActions = combatActionsDue(310, 1, 0);
  const enemyActions = combatActionsDue(215, 1, 0);
  const timeline = combatActionTimeline(310, 215, 1, 0, 0, playerActions, enemyActions);

  assert.deepEqual(timeline.map(action => action.actor), ['player', 'enemy', 'player', 'enemy', 'player']);
  assert.ok(timeline[0]!.time < timeline[1]!.time);
  assert.ok(timeline[1]!.time < timeline[2]!.time);
});

test('a faster enemy can strike before a slower Delver', () => {
  const playerActions = combatActionsDue(310, 1, 0);
  const enemyActions = combatActionsDue(400, 1, 0);
  const timeline = combatActionTimeline(310, 400, 1, 0, 0, playerActions, enemyActions);

  assert.deepEqual(timeline.map(action => action.actor), ['enemy', 'player', 'enemy', 'player', 'enemy', 'player', 'enemy']);
  assert.ok(timeline[0]!.time < timeline[1]!.time);
});

test('the leaderboard depth metric uses the best saved depth across every dungeon', () => {
  assert.equal(combatHighestDepthReached({
    depth: 4,
    bestDepth: 12,
    dungeonBestDepths: { undercrypt: 12, 'cinder-vault': 87, 'glass-labyrinth': 33 },
  }), 87);
  assert.equal(combatHighestDepthReached({ depth: COMBAT_MAX_DEPTH + 20 }), COMBAT_MAX_DEPTH);
  assert.equal(combatHighestDepthReached({ depth: 0, bestDepth: -3, dungeonBestDepths: { undercrypt: Infinity } }), 0);
  assert.equal(combatHighestDepthReached(null), 0);
});

test('Social leaderboard displays a saved-data-backed Highest Depth Reached board', () => {
  const social = readFileSync(resolve(process.cwd(), 'src/server/social.ts'), 'utf8');
  const ui = readFileSync(resolve(process.cwd(), 'src/client/components/GuildsAndSocial.tsx'), 'utf8');

  assert.ok(social.includes('infinity-orbs:combat:'));
  assert.ok(social.includes('combatHighestDepthReached(combatSave)'));
  assert.ok(social.includes('highestDepthReached: sortLeaderboard('));
  assert.ok(ui.includes("label: 'Highest Depth Reached'"));
  assert.ok(ui.includes("case 'highestDepthReached': return"));
});
