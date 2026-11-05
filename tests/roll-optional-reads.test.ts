import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compressStorageString } from '../src/server/storage-compression.js';
import { readRedisLargeValue } from '../src/server/redis-large-values.js';

test('optional shared roll bonuses fail open when Redis reads fail', () => {
  const game = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const start = game.indexOf('const [freshGlobalBoosters, worldEvent, fakeCcuBonus, combatStateRaw] = await Promise.all([');
  const end = game.indexOf('  s.globalBoosters = freshGlobalBoosters;', start);
  assert.ok(start >= 0 && end > start, 'roll optional-read block must exist');
  const block = game.slice(start, end);

  assert.match(block, /getGlobalBoosters\(\)\.catch\(error =>/);
  assert.match(block, /s\.globalBoosters \?\? createInitialGlobalBoosters\(now\)/);
  assert.match(block, /getCommunityEvent\(\)\.catch\(error =>/);
  assert.match(block, /getFakeCcuBonus\(\)\.catch\(error =>/);
  assert.match(block, /return 0;/);
  assert.match(game, /readRedisLargeValue as readRedisLargeValueForRolls/);
  assert.match(block, /redis\.get\('infinity-orbs:combat:' \+ spyUserId\)[\s\S]*?readRedisLargeValueForRolls\('infinity-orbs:combat:' \+ spyUserId, storedValue\)/);
  assert.match(block, /Read\/decode failed; rolling without the bonus/);
  assert.doesNotMatch(block, /redis\.get\('infinity-orbs:combat:' \+ spyUserId\)\.catch/);
});

test('the shared Combat reader decodes compressed inline saves before cross-mode bonuses are parsed', async () => {
  const combatState = {
    bestDepth: 900,
    dungeonBossesBeaten: { undercrypt: 40, 'cinder-vault': 25 },
    runes: Array.from({ length: 200 }, (_, index) => ({
      id: 'rune-' + index,
      name: 'Celestial Resonance Rune',
      rarity: 'mythic',
      majorAbility: { id: 'stellar-dividend', description: 'Repeated save payload for compression coverage.' },
      experience: index * 1_000,
    })),
    equippedRunes: ['rune-0', 'rune-1', 'rune-2'],
  };
  const serialized = JSON.stringify(combatState);
  const storedValue = compressStorageString(serialized);
  assert.ok(storedValue.startsWith('ioz1:'), 'fixture must cross the inline compression threshold');
  assert.equal(
    await readRedisLargeValue('infinity-orbs:combat:roll-reader-test', storedValue),
    serialized,
  );
});
