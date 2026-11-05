import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMBAT_COMMANDS,
  COMBAT_DUNGEONS,
  COMBAT_TACTICS,
  COMBAT_INTENTS,
} from '../src/shared/combat.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Combat command, tactic, and dungeon types share runtime catalogs', () => {
  const app = source('src/server/app.ts');
  const combat = source('src/server/combat.ts');
  const shared = source('src/shared/combat.ts');

  assert.match(app, /COMBAT_COMMANDS\.includes/);
  assert.match(combat, /COMBAT_DUNGEONS\.includes\(dungeonValue as CombatDungeonId\)/);
  assert.match(combat, /COMBAT_TACTICS\.includes\(tacticValue as CombatTactic\)/);
  assert.match(combat, /COMBAT_DUNGEONS\.includes\(s\.dungeonId\)/);
  assert.match(combat, /COMBAT_TACTICS\.includes\(s\.autoTactic\)/);
  assert.match(shared, /export type CombatCommand = \(typeof COMBAT_COMMANDS\)\[number\]/);
  assert.match(shared, /export type CombatDungeonId = \(typeof COMBAT_DUNGEONS\)\[number\]/);
  assert.match(shared, /export type CombatTactic = \(typeof COMBAT_TACTICS\)\[number\]/);

  assert.deepEqual([...COMBAT_INTENTS], ['strike', 'heavy', 'guard', 'mend']);
  assert.deepEqual([...COMBAT_COMMANDS], ['auto', 'strike', 'heavy', 'guard', 'mend', 'ability']);
  assert.deepEqual([...COMBAT_TACTICS], ['balanced', 'aggressive', 'defensive', 'recovery']);
  assert.deepEqual([...COMBAT_DUNGEONS], ['undercrypt', 'cinder-vault', 'glass-labyrinth']);
});
