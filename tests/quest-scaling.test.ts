import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialDailyQuests,
  createInitialWeeklyQuests,
  questDifficultyMultiplier,
  questRewardMultiplier,
} from '../src/shared/game.js';

test('quest difficulty scales gently with the highest Orb and has a hard ceiling', () => {
  assert.equal(questDifficultyMultiplier(2), 1);
  assert.equal(questDifficultyMultiplier(10_000), 1.05);
  assert.equal(questDifficultyMultiplier(1e6), 1.1);
  assert.equal(questDifficultyMultiplier(1e100), 1.2);
});

test('quest coin and Shard rewards scale independently from objective difficulty', () => {
  assert.equal(questRewardMultiplier(2), 1);
  assert.equal(questRewardMultiplier(1e6), 1.2);
  assert.equal(questRewardMultiplier(1e100), 1.5);

  const daily = createInitialDailyQuests(1e6);
  const dailyRolls = daily.find(quest => quest.id === 'daily-rolls-25');
  const dailyHundred = daily.find(quest => quest.id === 'daily-rolls-100');
  assert.equal(dailyRolls?.target, 28);
  assert.equal(dailyRolls?.rewardCoins, 120);
  assert.equal(dailyHundred?.rewardShards, 1);

  const weekly = createInitialWeeklyQuests(1e6);
  const weeklyRolls = weekly.find(quest => quest.id === 'weekly-grind');
  const weeklyEpic = weekly.find(quest => quest.id === 'weekly-epic');
  assert.equal(weeklyRolls?.target, 1100);
  assert.equal(weeklyRolls?.rewardCoins, 6000);
  assert.equal(weeklyRolls?.rewardShards, 6);
  assert.equal(weeklyEpic?.minRarity, 1100);
  assert.equal(weeklyEpic?.rewardShards, 4);

  const veryHigh = createInitialWeeklyQuests(1e100);
  assert.equal(veryHigh.find(quest => quest.id === 'weekly-share')?.rewardShards, 3);
});

test('rarity quest thresholds and Share quest unlocks follow the same mild difficulty scale', () => {
  const daily = createInitialDailyQuests(1e6);
  const weekly = createInitialWeeklyQuests(1e6);
  assert.equal(daily.find(quest => quest.id === 'daily-rare-100')?.minRarity, 110);
  assert.equal(weekly.find(quest => quest.id === 'weekly-epic')?.minRarity, 1100);
  assert.equal(weekly.find(quest => quest.id === 'weekly-share')?.unlockRarity, 110);
});
