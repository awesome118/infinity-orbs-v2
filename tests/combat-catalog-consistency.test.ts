import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMBAT_COMMANDS,
  COMBAT_DUNGEONS,
  COMBAT_TACTICS,
  COMBAT_INTENTS,
  COMBAT_RUNE_RARITIES,
  COMBAT_RUNE_STATS,
  COMBAT_TRAITS,
  COMBAT_GEAR_SLOTS,
} from '../src/shared/combat.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Combat command, tactic, and dungeon types share runtime catalogs', () => {
  const app = source('src/server/app.ts');
  const combat = source('src/server/combat.ts');
  const shared = source('src/shared/combat.ts');

  assert.match(app, /COMBAT_COMMANDS\.includes/);
  assert.match(app, /const command = intent as typeof COMBAT_COMMANDS\[number\]/);
  assert.match(app, /performCombatBeat\(sequence,command/);
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

test('Rune rarity and stat types are derived from the arrays used by validators and RNG', () => {
  const shared = source('src/shared/combat.ts');
  const combat = source('src/server/combat.ts');

  assert.match(shared, /export type CombatRuneRarity = \(typeof COMBAT_RUNE_RARITIES\)\[number\]/);
  assert.match(shared, /export type CombatRuneStat = \(typeof COMBAT_RUNE_STATS\)\[number\]/);
  assert.match(shared, /new Set<CombatRuneStat>\(COMBAT_RUNE_STATS\)/);
  assert.match(combat, /COMBAT_RUNE_STATS\.includes\(stat as CombatRuneStat\)/);
  assert.match(combat, /pick\(COMBAT_RUNE_STATS\)/);
  assert.deepEqual([...COMBAT_RUNE_RARITIES], [
    'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic',
    'Cosmic', 'Astral', 'Celestial', 'Transcendent',
  ]);
  assert.deepEqual([...COMBAT_RUNE_STATS], ['luckPct', 'coinGainPct', 'shardChancePct', 'xpGainPct']);
});

test('gear slot and trait types come from catalogs used by persisted gear normalization', () => {
  const shared = source('src/shared/combat.ts');
  const combat = source('src/server/combat.ts');

  assert.match(shared, /export type CombatTrait = \(typeof COMBAT_TRAITS\)\[number\]/);
  assert.match(shared, /export type CombatGearSlot = \(typeof COMBAT_GEAR_SLOTS\)\[number\]/);
  assert.match(combat, /COMBAT_GEAR_SLOTS\.includes\(rawSlot as CombatGearSlot\)/);
  assert.match(combat, /COMBAT_TRAITS\.includes\(x\.trait as CombatTrait\)/);
  assert.match(combat, /rawSlot==='chest'\?'armor'/);
  assert.deepEqual([...COMBAT_GEAR_SLOTS], ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'ring', 'amulet']);
  assert.deepEqual([...COMBAT_TRAITS], ['bleed', 'keen', 'first-strike', 'bulwark', 'regeneration', 'desperation']);
});
