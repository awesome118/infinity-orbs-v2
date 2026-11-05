import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
