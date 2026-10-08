import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  createInitialGuildCombo,
  activateGuildComboStack,
  decayGuildComboState,
  guildComboDurationMs,
  guildComboLuckMultiplier,
  guildComboSpeedMultiplier,
  guildComboCritChanceBonus,
  guildComboCritLuckBonus,
  guildComboRemainingMs,
  guildComboProgress,
  GUILD_COMBO_BASE_DURATION_MS,
  GUILD_COMBO_ACTIVATIONS_PER_TIER,
  GUILD_COMBO_MAX_TIER,
  grantFreeShards,
  onlinePlayerLuckMultiplier,
  luckMultiplier,
  frenzyClaimCountForRarity,
  frenzyOrbCountForRarity,
  FRENZY_LOG_BASE,
  bestCodexChain,
  applyLevelProgress,
  xpRequiredForLevel,
  SINGULARITY_TITHE_ROLLS_PER_DUST,
  singularityTitheDustForRolls,
  getLevelProgress,
  getLevelBenefits,
  totalXpRequiredBeforeLevel,
  calculateLevelFromXp,
  rollContinuum,
  luckRarityFactor,
  luckRarityExponent,
  rollsPerActivation,
  autoUnlocked,
  spendShards,
  isPremiumBoosterActive,
  premiumBoosterRemainingMs,
  altarCoinFloor,
  altarCoinDevotionChancePercent,
  calculateAltarMultipliers,
  createInitialGlobalBoosters,
  activateGlobalBoosterStack,
  decayGlobalBoosterState,
  globalBoosterRemainingMs,
  globalBoosterLuckMultiplier,
  globalBoosterSpeedMultiplier,
  globalBoosterCritChanceBonus,
  globalBoosterCritLuckBonus,
  GLOBAL_BOOSTER_DURATION_MS,
  GLOBAL_BOOSTER_ACTIVATIONS_PER_TIER,
  featureUnlockLevel,
  FEATURE_UNLOCK_LEVELS,
} from '../src/shared/game.js';
import {
  createGuildTask,
  createInitialGuildTasks,
} from '../src/shared/social.js';

const NOW = 1_800_000_000_000;

test('Level progression awards one Mastery Point per level gained', () => {
  const state = createInitialState();
  state.xp =
    xpRequiredForLevel(1) +
    xpRequiredForLevel(2) +
    xpRequiredForLevel(3);
  const gained = applyLevelProgress(state);
  assert.equal(gained, 3);
  assert.equal(state.level, 4);
  assert.equal(state.masteryPoints, 3);
});

test('Legacy high-level accounts can progress after the XP curve changed', () => {
  const state = createInitialState();
  state.level = 320;
  state.xp = 100_000_000;
  delete state.levelXpFloor;

  const firstPass = applyLevelProgress(state, 1);
  assert.equal(firstPass, 0);
  assert.equal(state.level, 320);
  assert.equal(state.levelXpFloor, state.xp);

  state.xp += xpRequiredForLevel(320);
  const secondPass = applyLevelProgress(state, 1);
  assert.equal(secondPass, 1);
  assert.equal(state.level, 321);
  assert.equal(state.masteryPoints, 1);
});

test('Singularity Tithe awards dust every 200 processed rolls and counts batches', () => {
  assert.equal(SINGULARITY_TITHE_ROLLS_PER_DUST, 200);
  assert.equal(singularityTitheDustForRolls(199, 1, 1), 1);
  assert.equal(singularityTitheDustForRolls(198, 2, 2), 2);
  assert.equal(singularityTitheDustForRolls(200, 100, 1), 0);
});

test('fresh state starts with an inactive Guild Combo', () => {
  const state = createInitialGuildCombo(NOW);

  assert.equal(state.tier, 0);
  assert.equal(state.activationProgress, 0);
  assert.equal(state.endsAt, 0);
  assert.equal(guildComboRemainingMs(state, NOW), 0);
  assert.equal(guildComboLuckMultiplier(state, NOW), 1);
  assert.equal(guildComboSpeedMultiplier(state, NOW), 1);
  assert.equal(guildComboCritChanceBonus(state, NOW), 0);
  assert.equal(guildComboCritLuckBonus(state, NOW), 0);
});

test('one Guild Task completion activates Combo tier 1', () => {
  const state = activateGuildComboStack(createInitialGuildCombo(NOW), NOW);

  assert.equal(state.tier, 1);
  assert.equal(state.activationProgress, 1);
  assert.equal(guildComboRemainingMs(state, NOW), guildComboDurationMs(1));
  assert.equal(guildComboProgress(state, NOW), 25);
});

test('four Guild Task completions advance Combo to tier 2', () => {
  let state = createInitialGuildCombo(NOW);

  for (let i = 0; i < GUILD_COMBO_ACTIVATIONS_PER_TIER; i += 1) {
    state = activateGuildComboStack(state, NOW);
  }

  assert.equal(state.tier, 2);
  assert.equal(state.activationProgress, 0);
  assert.ok(state.endsAt > NOW);
  assert.ok(guildComboDurationMs(2) < guildComboDurationMs(1));
});

test('Guild Combo keeps adding time on repeated task completions', () => {
  const first = activateGuildComboStack(createInitialGuildCombo(NOW), NOW);
  const second = activateGuildComboStack(first, NOW);

  assert.equal(second.tier, 1);
  assert.equal(second.activationProgress, 2);
  assert.equal(second.endsAt, first.endsAt + guildComboDurationMs(1));
});

test('Guild Combo bonuses match the half-strength design', () => {
  const tier1 = {
    tier: 1,
    activationProgress: 0,
    endsAt: NOW + GUILD_COMBO_BASE_DURATION_MS,
    lastTickAt: NOW,
  };
  const tier10 = {
    tier: GUILD_COMBO_MAX_TIER,
    activationProgress: 0,
    endsAt: NOW + GUILD_COMBO_BASE_DURATION_MS,
    lastTickAt: NOW,
  };

  assert.equal(guildComboLuckMultiplier(tier1, NOW), 1.05);
  assert.equal(guildComboSpeedMultiplier(tier1, NOW), 0.975);
  assert.equal(guildComboCritChanceBonus(tier1, NOW), 0.01);
  assert.equal(guildComboCritLuckBonus(tier1, NOW), 0.05);

  assert.equal(guildComboLuckMultiplier(tier10, NOW), 1.5);
  assert.equal(guildComboSpeedMultiplier(tier10, NOW), 0.75);
  assert.equal(guildComboCritChanceBonus(tier10, NOW), 0.10);
  assert.equal(guildComboCritLuckBonus(tier10, NOW), 0.50);
});

test('Guild Combo expires and clears its tier and progress', () => {
  const active = activateGuildComboStack(createInitialGuildCombo(NOW), NOW);
  const decayed = decayGuildComboState(active, active.endsAt + 1);

  assert.deepEqual(decayed, {
    tier: 0,
    activationProgress: 0,
    endsAt: 0,
    lastTickAt: active.endsAt + 1,
  });
});

test('higher Guild Combo tiers drain faster', () => {
  const elapsed = 10_000;
  const tier1 = {
    tier: 1,
    activationProgress: 0,
    endsAt: NOW + 600_000,
    lastTickAt: NOW,
  };
  const tier4 = {
    tier: 4,
    activationProgress: 0,
    endsAt: NOW + 600_000,
    lastTickAt: NOW,
  };

  const d1 = decayGuildComboState(tier1, NOW + elapsed);
  const d4 = decayGuildComboState(tier4, NOW + elapsed);

  assert.ok(d1.endsAt > d4.endsAt);
  assert.equal(d1.endsAt, tier1.endsAt - Math.round(elapsed * 1 * 0.25));
  assert.equal(d4.endsAt, tier4.endsAt - Math.round(elapsed * 4 * 0.25));
});

test('Combo Reserve duration multiplier increases Combo time', () => {
  const base = guildComboDurationMs(3);
  const boosted = guildComboDurationMs(3, 1.10);

  assert.equal(boosted, Math.round(base * 1.10));
});

test('Guild Combo tier cannot exceed the configured maximum', () => {
  let state = createInitialGuildCombo(NOW);

  for (let i = 0; i < 100; i += 1) {
    state = activateGuildComboStack(state, NOW, GUILD_COMBO_MAX_TIER);
  }

  assert.equal(state.tier, GUILD_COMBO_MAX_TIER);
});

test('Guild task set starts with one task of each type', () => {
  const tasks = createInitialGuildTasks(1);

  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map(task => task.type).sort(), ['rare', 'rolls', 'value']);
  for (const task of tasks) {
    assert.equal(task.tier, 1);
    assert.equal(task.progress, 0);
    assert.ok(task.target > 0);
    assert.ok(task.reward > 0);
    assert.ok(task.guildXpReward > 0);
  }
});

test('Guild task difficulty and rewards scale upward by tier', () => {
  for (const type of ['rolls', 'value', 'rare'] as const) {
    const tier1 = createGuildTask(type, 1, 1);
    const tier2 = createGuildTask(type, 2, 1);
    const tier5 = createGuildTask(type, 5, 1);

    assert.ok(tier2.target > tier1.target, `${type}: tier 2 target should exceed tier 1`);
    assert.ok(tier5.target > tier2.target, `${type}: tier 5 target should exceed tier 2`);
    assert.ok(tier2.reward > tier1.reward, `${type}: tier 2 token reward should exceed tier 1`);
    assert.ok(tier5.reward > tier2.reward, `${type}: tier 5 token reward should exceed tier 2`);
    assert.ok(tier2.guildXpReward > tier1.guildXpReward, `${type}: tier 2 XP reward should exceed tier 1`);
  }
});

test('Guild task targets scale with Guild level', () => {
  const level1 = createGuildTask('rolls', 4, 1);
  const level25 = createGuildTask('rolls', 4, 25);

  assert.ok(level25.target > level1.target);
  assert.equal(level25.tier, level1.tier);
});

test('Guild task rewards remain capped', () => {
  const extreme = createGuildTask('rolls', 10_000, 10_000);

  assert.ok(extreme.reward <= 25_000);
  assert.ok(extreme.guildXpReward <= 10_000);
});

test('free Shards respect the hard 50-per-day cap', () => {
  const state = createInitialState(NOW);
  state.lastFreeShardReset = new Date(NOW).toISOString().slice(0, 10);
  state.freeShardsEarnedToday = 49;
  state.shards = 0;
  state.lifetimeShards = 0;

  assert.equal(grantFreeShards(state, 10, NOW), 1);
  assert.equal(state.shards, 1);
  assert.equal(state.freeShardsEarnedToday, 50);
  assert.equal(grantFreeShards(state, 10, NOW), 0);
});

test('Orb Frenzy batch size follows logarithmic rarity scaling', () => {
  assert.equal(frenzyOrbCountForRarity(1), 1);
  assert.equal(frenzyOrbCountForRarity(2), Math.floor(Math.log(2) / Math.log(FRENZY_LOG_BASE)));
  assert.ok(frenzyOrbCountForRarity(1_000) > frenzyOrbCountForRarity(100));
  assert.ok(frenzyOrbCountForRarity(1_000_000) < 1_000_000);
  assert.ok(frenzyOrbCountForRarity(1e15) < 1_000);
});

test('Codex Devotion reports the best consecutive rarity chain', () => {
  const chain = bestCodexChain({
    '2': 1,
    '3': 4,
    '4': 2,
    '6': 1,
    '7': 1,
    '8': 1,
    '10': 1,
  });

  assert.deepEqual(chain, { start: 6, end: 8, length: 3 });
});

test('online population Luck is monotonic and sane', () => {
  assert.equal(onlinePlayerLuckMultiplier(1), 1);
  assert.equal(onlinePlayerLuckMultiplier(2), 1.05);
  assert.ok(onlinePlayerLuckMultiplier(100) > onlinePlayerLuckMultiplier(10));
  assert.equal(onlinePlayerLuckMultiplier(0), 1);
});

test('Astral Reserve adds exactly 2% Luck per level', () => {
  const state = createInitialState(NOW);
  state.prestigeUpgrades.astralReserve = 0;
  assert.equal(luckMultiplier(state), 1);

  state.prestigeUpgrades.astralReserve = 1;
  assert.equal(luckMultiplier(state), 1.02);

  state.prestigeUpgrades.astralReserve = 5;
  assert.equal(luckMultiplier(state), 1.10);
});

test('Frenzy Volley counts each additional multiball at 20% efficiency', () => {
  const base = frenzyOrbCountForRarity(100);
  assert.equal(frenzyClaimCountForRarity(100, 1, 0), base);
  assert.equal(frenzyClaimCountForRarity(100, 2, 1), Math.floor(base * 1.20));
  assert.equal(frenzyClaimCountForRarity(100, 3, 1), Math.floor(base * 1.40));
});


test('fresh player state starts with the expected core economy and progression baseline', () => {
  const state = createInitialState(NOW);
  assert.equal(state.level, 1);
  assert.equal(state.xp, 0);
  assert.equal(state.coins, 50);
  assert.equal(state.shards, 5);
  assert.equal(state.totalRolls, 0);
  assert.equal(state.manualRolls, 0);
});

test('XP requirements increase with level', () => {
  assert.ok(xpRequiredForLevel(2) > xpRequiredForLevel(1));
  assert.ok(xpRequiredForLevel(25) > xpRequiredForLevel(10));
  assert.ok(xpRequiredForLevel(100) > xpRequiredForLevel(50));
});

test('total XP before level 1 is zero and level 2 equals the level 1 requirement', () => {
  assert.equal(totalXpRequiredBeforeLevel(1), 0);
  assert.equal(totalXpRequiredBeforeLevel(2), xpRequiredForLevel(1));
});

test('calculateLevelFromXp crosses a level exactly at the XP boundary', () => {
  const xp = xpRequiredForLevel(1);
  const result = calculateLevelFromXp(xp);
  assert.equal(result.level, 2);
  assert.equal(result.currentLevelXp, 0);
  assert.equal(result.progressPercent, 0);
});

test('getLevelProgress respects an explicit level XP floor', () => {
  const result = getLevelProgress(10, 1_000, 750);
  assert.equal(result.level, 10);
  assert.equal(result.currentLevelXp, 250);
  assert.equal(result.progressPercent, Math.min(100, Math.round((250 / result.nextLevelXp) * 100)));
});

test('calculateLevelFromXp clamps progression at level 1000', () => {
  const result = calculateLevelFromXp(Number.MAX_SAFE_INTEGER);
  assert.equal(result.level, 1000);
  assert.equal(result.progressPercent, 100);
});

test('level benefits are monotonic for base Luck and coin multipliers', () => {
  const low = getLevelBenefits(5);
  const high = getLevelBenefits(50);
  assert.ok(high.luckMultiplier > low.luckMultiplier);
  assert.ok(high.coinsMultiplier > low.coinsMultiplier);
});

test('level 15 grants the documented cooldown reduction milestone', () => {
  assert.equal(getLevelBenefits(14).cooldownReductionMs, 0);
  assert.equal(getLevelBenefits(15).cooldownReductionMs, 150);
});

test('level 20 grants the documented Altar effect milestone', () => {
  assert.equal(getLevelBenefits(19).altarEffectMultiplier, 1);
  assert.equal(getLevelBenefits(20).altarEffectMultiplier, 1.15);
});

test('rollContinuum never returns below the minimum rarity even at u=1', () => {
  assert.equal(rollContinuum(1, () => 1), 2);
});

test('rollContinuum honors its hard rarity ceiling for extreme RNG inputs', () => {
  const result = rollContinuum(Number.MAX_SAFE_INTEGER, () => Number.MIN_VALUE);
  assert.ok(result <= 1_000_000_000_000_000_000);
  assert.ok(result >= 2);
});

test('luck rarity factor is exactly 1× at baseline Luck', () => {
  assert.equal(luckRarityFactor(1), 1);
  assert.equal(luckRarityFactor(0), 1);
  assert.equal(luckRarityFactor(-100), 1);
});

test('luck rarity factor caps at 5× even with absurd Luck', () => {
  assert.equal(luckRarityFactor(Number.MAX_SAFE_INTEGER), 5);
});

test('Continuum exponent remains fixed at one after the tail rebalance', () => {
  assert.equal(luckRarityExponent(1), 1);
  assert.equal(luckRarityExponent(1_000_000), 1);
});

test('rollsPerActivation combines the primary ball sources', () => {
  const state = createInitialState(NOW);
  state.upgrades.multi = 2;
  state.upgrades.clusterRoll = 3;
  state.prestigeUpgrades.astralBarrage = 4;
  state.masterySkills.celestialVolley = 2;
  state.prestigeUpgrades.astralArsenal = 5;
  assert.ok(rollsPerActivation(state) >= 17);
});

test('Premium Orb Barrage adds 25 balls only while active', () => {
  const state = createInitialState(NOW);
  const base = rollsPerActivation(state);
  state.activeBoosters.barrage = NOW + 60_000;
  assert.equal(rollsPerActivation(state), base + 25);
  state.activeBoosters.barrage = NOW - 1;
  assert.equal(rollsPerActivation(state), base);
});

test('Auto Roll unlocks at exactly three manual rolls', () => {
  const state = createInitialState(NOW);
  state.manualRolls = 2;
  assert.equal(autoUnlocked(state), false);
  state.manualRolls = 3;
  assert.equal(autoUnlocked(state), true);
});

test('spendShards deducts only the requested amount', () => {
  const state = createInitialState(NOW);
  state.shards = 20;
  assert.equal(spendShards(state, 7), 7);
  assert.equal(state.shards, 13);
});

test('spendShards consumes purchased shards before leaving other purchased balance untouched', () => {
  const state = createInitialState(NOW);
  state.shards = 20;
  state.purchasedShards = 12;
  spendShards(state, 5);
  assert.equal(state.shards, 15);
  assert.equal(state.purchasedShards, 7);
});

test('spendShards cannot spend more than the current Shard balance', () => {
  const state = createInitialState(NOW);
  state.shards = 4;
  assert.throws(() => spendShards(state, 5), /Not enough Shards/);
  assert.equal(state.shards, 4);
});

test('inactive Premium Booster has no remaining time', () => {
  const state = createInitialState(NOW);
  state.activeBoosters.fortune = 0;
  assert.equal(isPremiumBoosterActive(state, 'fortune', NOW), false);
  assert.equal(premiumBoosterRemainingMs(state, 'fortune', NOW), 0);
});

test('active Premium Booster reports its exact remaining duration', () => {
  const state = createInitialState(NOW);
  state.activeBoosters.fortune = NOW + 25_000;
  assert.equal(isPremiumBoosterActive(state, 'fortune', NOW), true);
  assert.equal(premiumBoosterRemainingMs(state, 'fortune', NOW), 25_000);
});

test('Altar coin floor doubles every level', () => {
  assert.equal(altarCoinFloor(0), 10_000);
  assert.equal(altarCoinFloor(1), 20_000);
  assert.equal(altarCoinFloor(2), 40_000);
});

test('Altar devotion chance is zero below the current coin floor', () => {
  const floor = altarCoinFloor(4);
  assert.equal(altarCoinDevotionChancePercent(floor - 1, 0, 4), 0);
});

test('Altar devotion pity increases chance without bypassing the floor', () => {
  const floor = altarCoinFloor(3);
  const noPity = altarCoinDevotionChancePercent(floor, 0, 3);
  const pity = altarCoinDevotionChancePercent(floor, 5, 3);
  assert.ok(pity > noPity);
  assert.equal(altarCoinDevotionChancePercent(floor - 1, 999, 3), 0);
});

test('Altar coin and shard layers compound into the total Altar multiplier', () => {
  const state = createInitialState(NOW);
  state.sacrifices.altarLevel = 5;
  state.sacrifices.shardsSacrificed = 10;
  const result = calculateAltarMultipliers(state);
  assert.ok(result.coinMultiplier > 1);
  assert.ok(result.shardMultiplier > 1);
  assert.equal(
    result.totalAltarMultiplier,
    Math.round(result.coinMultiplier * result.shardMultiplier * 100) / 100,
  );
});

test('Global Boosters start completely inactive', () => {
  const snapshot = createInitialGlobalBoosters(NOW);
  for (const state of Object.values(snapshot)) {
    assert.equal(state.tier, 0);
    assert.equal(state.activationProgress, 0);
    assert.equal(state.endsAt, 0);
    assert.equal(globalBoosterRemainingMs(state, NOW), 0);
  }
});

test('Global Booster activation starts tier 1 with one activation of progress', () => {
  const snapshot = createInitialGlobalBoosters(NOW);
  const next = activateGlobalBoosterStack(snapshot.luck, NOW);
  assert.equal(next.tier, 1);
  assert.equal(next.activationProgress, 1);
  assert.equal(globalBoosterRemainingMs(next, NOW), GLOBAL_BOOSTER_DURATION_MS);
});

test('Global Booster advances a tier only after the configured number of activations', () => {
  let state = createInitialGlobalBoosters(NOW).luck;
  for (let i = 0; i < GLOBAL_BOOSTER_ACTIVATIONS_PER_TIER - 1; i += 1) {
    state = activateGlobalBoosterStack(state, NOW);
  }
  assert.equal(state.tier, 1);
  assert.equal(state.activationProgress, GLOBAL_BOOSTER_ACTIVATIONS_PER_TIER - 1);
  state = activateGlobalBoosterStack(state, NOW);
  assert.equal(state.tier, 2);
  assert.equal(state.activationProgress, 0);
});

test('expired Global Boosters clear both tier and progress', () => {
  const active = activateGlobalBoosterStack(createInitialGlobalBoosters(NOW).luck, NOW);
  const expired = decayGlobalBoosterState(active, active.endsAt + 1);
  assert.deepEqual(expired, {
    tier: 0,
    activationProgress: 0,
    endsAt: 0,
    lastTickAt: active.endsAt + 1,
  });
});

test('Global Booster Luck, Speed, and Crit bonuses scale from the same tier', () => {
  const state = { tier: 3, activationProgress: 0, endsAt: NOW + 600_000, lastTickAt: NOW };
  assert.equal(globalBoosterLuckMultiplier(state, NOW), 1.3);
  assert.equal(globalBoosterSpeedMultiplier(state, NOW), 0.85);
  assert.equal(globalBoosterCritChanceBonus(state, NOW), 0.06);
  assert.equal(globalBoosterCritLuckBonus(state, NOW), 0.30);
});

test('Global Booster speed keeps its hard floor at very high tiers', () => {
  const state = { tier: 100, activationProgress: 0, endsAt: NOW + 600_000, lastTickAt: NOW };
  assert.equal(globalBoosterSpeedMultiplier(state, NOW), 0.35);
});

test('feature unlock levels stay ordered from core to endgame systems', () => {
  const expected = ['upgrades', 'quests', 'collection', 'boosters', 'shop', 'social', 'altar', 'mastery', 'prestige'] as const;
  for (let i = 1; i < expected.length; i += 1) {
    assert.ok(featureUnlockLevel(expected[i]) >= featureUnlockLevel(expected[i - 1]));
  }
  assert.deepEqual(FEATURE_UNLOCK_LEVELS, {
    upgrades: 2,
    quests: 3,
    collection: 4,
    boosters: 5,
    shop: 5,
    social: 7,
    altar: 10,
    mastery: 15,
    prestige: 20,
  });
});
