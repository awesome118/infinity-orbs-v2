import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMBAT_MAX_DEPTH,
  COMBAT_SPEED_PER_ACTION,
  combatActionsDue,
  combatActionTimeline,
  combatHighestDepthReached,
} from '../src/shared/combat.js';
import { ORB_TIER_NAMES, getOrbInfo } from '../src/shared/game.js';

test('Speed recharge means a base-speed Delver does not attack on every beat', () => {
  assert.equal(COMBAT_SPEED_PER_ACTION, 400);
  assert.equal(combatActionsDue(310, 1, 0), 1, 'the encounter begins with one action ready');
  assert.equal(combatActionsDue(310, 2, 1), 0, '310 Speed has not recharged 400 Speed by the next beat');
  assert.equal(combatActionsDue(310, 3, 1), 1, 'accumulated Speed earns the next action');
  assert.equal(combatActionsDue(800, 2, 1), 2, 'higher Speed earns multiple actions in the same beat');
});

test('player and enemy actions interleave according to their Speed thresholds', () => {
  const playerActions = combatActionsDue(900, 2, 1);
  const enemyActions = combatActionsDue(650, 2, 1);
  const timeline = combatActionTimeline(900, 650, 2, 1, 1, playerActions, enemyActions);

  assert.deepEqual(timeline.map(action => action.actor), ['player', 'enemy', 'player']);
  assert.ok(timeline[0]!.time < timeline[1]!.time);
  assert.ok(timeline[1]!.time < timeline[2]!.time);
});

test('opening initiative follows the actual Speed values instead of always favoring the Delver', () => {
  const playerFirst = combatActionTimeline(300, 200, 1, 0, 0, 1, 1);
  const enemyFirst = combatActionTimeline(200, 300, 1, 0, 0, 1, 1);

  assert.deepEqual(playerFirst.map(action => action.actor), ['player', 'enemy']);
  assert.deepEqual(enemyFirst.map(action => action.actor), ['enemy', 'player']);
  assert.ok(enemyFirst[0]!.time < enemyFirst[1]!.time);
});

test('a fast enemy can act while a slower Delver is still recharging', () => {
  const playerActions = combatActionsDue(310, 2, 1);
  const enemyActions = combatActionsDue(800, 2, 1);
  const timeline = combatActionTimeline(310, 800, 2, 1, 1, playerActions, enemyActions);

  assert.equal(playerActions, 0);
  assert.deepEqual(timeline.map(action => action.actor), ['enemy', 'enemy']);
  assert.ok(timeline[0]!.time < timeline[1]!.time);
});

test('player Speed charge carries into a new encounter while enemy cadence restarts', () => {
  const playerActions = combatActionsDue(310, 3, 1);
  const enemyActions = combatActionsDue(100, 1, 0);
  const timeline = combatActionTimeline(310, 100, 3, 1, 0, playerActions, enemyActions, 1);

  assert.equal(playerActions, 1, 'accumulated player Speed earns the action');
  assert.equal(enemyActions, 1, 'each new enemy receives its opening action');
  assert.deepEqual(timeline.map(action => action.actor), ['player', 'enemy']);
  assert.ok(timeline[0]!.time < timeline[1]!.time, 'room reset does not reset the player clock');
});

test('player Speed counter survives enemy kills in server state', () => {
  const server = readFileSync(resolve(process.cwd(), 'src/server/combat.ts'), 'utf8');
  assert.ok(server.includes('s.combatBeats=0;s.enemyActionsResolved=0;s.guardBeats=0'));
  assert.ok(!server.includes('s.combatBeats=0;s.playerActionsResolved=0;s.enemyActionsResolved=0;s.guardBeats=0'));
});

test('every orb rarity has an expanded, duplicate-free name pool', () => {
  for (const [tier, names] of Object.entries(ORB_TIER_NAMES)) {
    assert.ok(names.length >= 14, `${tier} should have at least fourteen names`);
    assert.equal(new Set(names).size, names.length, `${tier} names should be unique`);
  }
  assert.ok(getOrbInfo(100).name.length > 0);
  assert.equal(getOrbInfo(100).name, getOrbInfo(100).name, 'ordinary names stay deterministic');
  assert.ok(getOrbInfo(1e17).name.length > 0, 'large-rarity name selection remains defined');
});

test('combat Orb rolls ignore main-game Luck and the orb panel explains Luck and damage', () => {
  const server = readFileSync(resolve(process.cwd(), 'src/server/combat.ts'), 'utf8');
  const ui = readFileSync(resolve(process.cwd(), 'src/client/components/CombatSection.tsx'), 'utf8');
  assert.ok(server.includes('rollContinuum(1,secureRandom)'));
  assert.ok(!server.includes('rollContinuum(orbLuck,secureRandom)'));
  assert.ok(ui.includes('Combat Orb rolls use neutral 1× Luck'));
  assert.ok(ui.includes('totalDamageThisBeat'));
  assert.ok(ui.includes('TOTAL DAMAGE'));
});

test('Combat mode blocks main-game rolls, queues skills, and uses a stable gear inspector', () => {
  const main = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  const ui = readFileSync(resolve(process.cwd(), 'src/client/components/CombatSection.tsx'), 'utf8');
  assert.ok(main.includes('if (combatMode) return;'));
  assert.ok(main.includes('!splashEntered || combatMode || !autoRoll'));
  assert.ok(ui.includes('const queueAbility='));
  assert.ok(ui.includes('Queued for next beat'));
  assert.ok(ui.includes('createPortal('));
  assert.ok(ui.includes('io-combat-beat-state'));
});

test('Auto Fight countdown tracks reconciled server timestamps instead of stale render state', () => {
  const ui = readFileSync(resolve(process.cwd(), 'src/client/components/CombatSection.tsx'), 'utf8');
  assert.ok(
    ui.includes('Date.now()-(Number(stateRef.current?.lastAcceptedBeatAtMs)||0)'),
    'the countdown must read the same mutable timestamp the retry scheduler reconciles',
  );
  assert.ok(
    ui.includes('stateRef.current={...current,lastAcceptedBeatAtMs:Math.max(0,Date.now()+Math.max(0,remaining)-COMBAT_BEAT_INTERVAL_MS)}'),
    'an early server rejection must reconcile the timestamp consumed by the countdown',
  );
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
