import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  combatSkillRarityOdds,
  resolveCombatSkillRarity,
  skillRarityUnlocked,
  type CombatRarity,
} from '../src/shared/combat.js';

const tiers: CombatRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Mythic'];

test('Skill Gacha odds sum to 100% at every rank and never go out of range', () => {
  for (let rank = 1; rank <= 30; rank += 1) {
    const odds = combatSkillRarityOdds(rank);
    const total = tiers.reduce((sum, tier) => sum + odds[tier], 0);
    assert.ok(Math.abs(total - 1) < 1e-10, `rank ${rank} totals ${total}`);
    for (const tier of tiers) {
      assert.ok(odds[tier] >= 0 && odds[tier] <= 1, `rank ${rank} ${tier} odds out of range`);
    }
  }
});

test('Skill Gacha starts Common-only and progressively introduces rarity tiers', () => {
  assert.deepEqual(combatSkillRarityOdds(1), {
    Common: 1, Uncommon: 0, Rare: 0, Epic: 0, Mythic: 0,
  });
  assert.deepEqual(combatSkillRarityOdds(2), {
    Common: 0.98, Uncommon: 0.02, Rare: 0, Epic: 0, Mythic: 0,
  });
  assert.deepEqual(combatSkillRarityOdds(5), {
    Common: 0.82, Uncommon: 0.16, Rare: 0.02, Epic: 0, Mythic: 0,
  });
  assert.deepEqual(combatSkillRarityOdds(12), {
    Common: 0.5, Uncommon: 0.24, Rare: 0.16, Epic: 0.0995, Mythic: 0.0005,
  });
  assert.deepEqual(combatSkillRarityOdds(18), {
    Common: 0.36, Uncommon: 0.25, Rare: 0.19, Epic: 0.198, Mythic: 0.002,
  });
  assert.deepEqual(combatSkillRarityOdds(24), {
    Common: 0.25, Uncommon: 0.25, Rare: 0.22, Epic: 0.277, Mythic: 0.003,
  });
  assert.deepEqual(combatSkillRarityOdds(30), {
    Common: 0.18, Uncommon: 0.25, Rare: 0.23, Epic: 0.335, Mythic: 0.005,
  });
  assert.equal(combatSkillRarityOdds(30).Mythic, 0.005, 'Mythic caps at 0.5% at maximum rank');
  assert.equal(skillRarityUnlocked('Uncommon', 1), false);
  assert.equal(skillRarityUnlocked('Uncommon', 2), true);
  assert.equal(skillRarityUnlocked('Rare', 2), false);
  assert.equal(skillRarityUnlocked('Rare', 3), true);
  assert.equal(skillRarityUnlocked('Epic', 5), false);
  assert.equal(skillRarityUnlocked('Epic', 6), true);
  assert.equal(skillRarityUnlocked('Mythic', 8), false);
  assert.equal(skillRarityUnlocked('Mythic', 9), true);
});

test('higher ranks never reduce the chance of an individual non-Common tier', () => {
  let previous = combatSkillRarityOdds(1);
  for (let rank = 2; rank <= 30; rank += 1) {
    const odds = combatSkillRarityOdds(rank);
    for (const tier of tiers.slice(1)) {
      assert.ok(odds[tier] + 1e-10 >= previous[tier], `${tier} odds fell at rank ${rank}`);
    }
    assert.ok(odds.Common <= previous.Common + 1e-10, `Common odds rose at rank ${rank}`);
    previous = odds;
  }
});

test('rarity resolver uses the rebalanced rank odds', () => {
  assert.equal(resolveCombatSkillRarity(0.999, 1), 'Common');
  assert.equal(resolveCombatSkillRarity(0.99, 2), 'Uncommon');
  assert.equal(resolveCombatSkillRarity(0.99, 5), 'Rare');
  assert.equal(resolveCombatSkillRarity(0.999, 8), 'Epic');
  assert.equal(resolveCombatSkillRarity(0.9999, 30), 'Mythic');
});
