import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMBAT_MAJOR_ABILITY_IDS,
  combatRuneBonuses,
  combatRuneLuckMultiplier,
  combatRuneMajorAbilityEffects,
  combatStatsFor,
  createCombatState,
  getEnemyForDungeonDepth,
  resolveCombatSkillRarity,
  skillPullCost,
  undercryptOrbLuckMultiplier,
  type CombatRune,
} from '../src/shared/combat.js';
import {
  SHARD_DECIMAL_PLACES,
  formatShardAmount,
  resolveShardPityReward,
  roundShardAmount,
} from '../src/shared/game.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('player Speed comes from gear and stays depth-independent while enemy Speed scales', () => {
  const player = createCombatState();
  const basePlayerSpeed = combatStatsFor({ ...player, depth: 1 }).speed;
  const deepPlayerSpeed = combatStatsFor({ ...player, depth: 100 }).speed;
  assert.equal(deepPlayerSpeed, basePlayerSpeed, 'same loadout must grant the same player Speed at all depths');
  const weapon = player.inventory.find(item => item.slot === 'weapon');
  assert.ok(weapon);
  weapon.speedBonus = 35;
  assert.equal(combatStatsFor({ ...player, depth: 1 }).speed, basePlayerSpeed + 35);
  assert.equal(combatStatsFor({ ...player, depth: 100 }).speed, basePlayerSpeed + 35);
  const baseEnemySpeed = getEnemyForDungeonDepth('undercrypt', 1).speed;
  const deepEnemySpeed = getEnemyForDungeonDepth('undercrypt', 100).speed;
  assert.ok(deepEnemySpeed > baseEnemySpeed, 'enemy Speed must increase with depth');
  assert.ok(Number.isFinite(combatStatsFor({ ...player, depth: 50_000 }).speed));
  assert.ok(Number.isFinite(getEnemyForDungeonDepth('undercrypt', 50_000).speed));
});

test('Skill Gacha pull cost rises with Gacha rank and lifetime pulls', () => {
  assert.equal(skillPullCost(0, 1), 75);
  assert.ok(skillPullCost(0, 2) > skillPullCost(0, 1));
  assert.ok(skillPullCost(0, 30) > skillPullCost(0, 20));
  assert.ok(skillPullCost(10_000, 2) > skillPullCost(0, 2));
  assert.ok(Number.isSafeInteger(skillPullCost(Number.MAX_SAFE_INTEGER, 30)));
});

test('Skill Gacha rarity is independent of legacy pity counters', () => {
  for (const rank of [1, 10, 20, 30]) {
    for (const randomValue of [0, 0.1, 0.33, 0.7, 0.99999]) {
      assert.equal(
        resolveCombatSkillRarity(randomValue, rank, 0, 0),
        resolveCombatSkillRarity(randomValue, rank, 39, 9),
        'legacy pity values must not change the same weighted draw',
      );
    }
  }
});

test('Shards are whole numbers and legacy Shard pity never grants a guaranteed payout', () => {
  assert.equal(SHARD_DECIMAL_PLACES, 0);
  assert.equal(roundShardAmount(4.99), 4);
  assert.equal(roundShardAmount(0.99), 0);
  assert.equal(roundShardAmount(-3), 0);
  assert.equal(formatShardAmount(302.13), '302');
  assert.equal(formatShardAmount(3), '3');
  const miss = { shardPityRolls: 250 };
  assert.equal(resolveShardPityReward(miss, false), 0);
  assert.equal(miss.shardPityRolls, 0, 'legacy dry-streak counters reset without a pity payout');
  const proc = { shardPityRolls: 99 };
  assert.equal(resolveShardPityReward(proc, true), 1);
  assert.equal(proc.shardPityRolls, 0);
});

test('all Rune Major Abilities have a runtime path; main-game Rune abilities still avoid combat stats', () => {
  const shared = source('src/shared/combat.ts');
  const server = source('src/server/combat.ts');
  const effects = source('src/server/game.ts');
  for (const id of COMBAT_MAJOR_ABILITY_IDS) {
    assert.ok(shared.includes("'" + id + "'"), 'shared combat contract must include ' + id);
    assert.ok(server.includes("'" + id + "'"), 'server combat must handle ' + id);
  }
  const combatRuneAbilityIds = [
    'echo-chamber', 'paradox-engine', 'event-horizon', 'shard-constellation',
    'temporal-loop', 'prismatic-fork', 'critical-convergence', 'rarity-ladder',
    'stellar-dividend', 'shard-jackpot', 'milestone-engine', 'shard-tithe',
    'discovery-oracle', 'dry-streak-refinery',
  ];
  for (const id of combatRuneAbilityIds) {
    assert.ok(shared.includes("'" + id + "'"), 'shared Rune Major Ability must include ' + id);
    assert.ok(server.includes("'" + id + "'") || effects.includes("'" + id + "'"), 'server-side Rune Major Ability path must include ' + id);
    const rune = {
      id: 'ability-test-' + id, name: id, rarity: 'Cosmic' as const, stat: 'luckPct' as const,
      value: 1, level: 1, sourceDepth: 1, sourceDungeon: 'undercrypt' as const,
      majorAbility: { id, name: id, valuePct: 25, description: id },
    } as unknown as CombatRune;
    assert.notDeepEqual(
      combatRuneMajorAbilityEffects([rune], [rune.id]),
      combatRuneMajorAbilityEffects([], []),
      id + ' must resolve to a non-empty major ability effect',
    );
  }
  for (const id of ['fateweaver', 'midas-engine', 'memory-well']) {
    assert.ok(shared.includes("'" + id + "'"), 'main-game Rune Major Ability must include ' + id);
    assert.ok(server.includes("'" + id + "'") || effects.includes("'" + id + "'"), 'main-game Rune Major Ability path must include ' + id);
  }
  const fateweaver: CombatRune = {
    id: 'fateweaver-luck-test', name: 'Fateweaver', rarity: 'Mythic', stat: 'luckPct',
    value: 1, level: 1, sourceDepth: 1, sourceDungeon: 'undercrypt',
    majorAbility: { id: 'fateweaver', name: 'Fateweaver', valuePct: 25, description: 'Luck test' },
  };
  const midas: CombatRune = {
    ...fateweaver, id: 'midas-coin-test', stat: 'coinGainPct',
    majorAbility: { id: 'midas-engine', name: 'Midas Engine', valuePct: 25, description: 'Coin test' },
  };
  const memory: CombatRune = {
    ...fateweaver, id: 'memory-xp-test', stat: 'xpGainPct',
    majorAbility: { id: 'memory-well', name: 'Memory Well', valuePct: 25, description: 'XP test' },
  };
  assert.ok(combatRuneBonuses([fateweaver], [fateweaver.id]).luckPct > combatRuneBonuses([], []).luckPct);
  assert.ok(combatRuneBonuses([midas], [midas.id]).coinGainPct > 0);
  assert.ok(combatRuneBonuses([memory], [memory.id]).xpGainPct > 0);
  assert.ok(effects.includes('addRuneBonusRolls'));
  assert.ok(effects.includes('eventHorizonRarityMultiplier'));
  assert.ok(effects.includes('shardProcChance'));
  assert.ok(effects.includes('runeBonuses.shardChancePct'));
});

test('all roll-earned Shard chance sources are reduced and all Shard additions are integer-only', () => {
  const game = source('src/server/game.ts');
  const shared = source('src/shared/game.ts');
  const ui = source('src/client/components/BoostersAndAutomation.tsx');
  assert.match(game, /const shardProcChance = Math\.min\([\s\S]*?\) \* 0\.5\s*\);/);
  assert.match(game, /shardJackpotChance \* 0\.5/);
  assert.match(shared, /0\.005 \* transLevel/);
  assert.match(shared, /SHARD_DECIMAL_PLACES = 0/);
  assert.match(shared, /Math\.floor\(n\)/);
  assert.doesNotMatch(shared, /shardsGained\s*\+\s*0\.001/);
  assert.doesNotMatch(ui, /fractional amounts/);
});

test('10x Skill Gacha is costed before mutation and returns every result', () => {
  const combat = source('src/server/combat.ts');
  const api = source('src/server/app.ts');
  const ui = source('src/client/components/CombatSection.tsx');
  assert.match(combat, /rollCombatSkill\(countValue: unknown = 1\)/);
  assert.match(combat, /const totalCost = Array\.from\(\{ length: pullCount \}/);
  assert.match(combat, /if \(s\.combatMarks < totalCost\) throw new Error/);
  assert.match(combat, /skillRolls: results/);
  assert.match(api, /req\.body\?\.count === 10 \? 10 : 1/);
  assert.match(ui, /Roll 10x/);
  assert.match(ui, /mutate\('\/api\/combat\/skills\/roll',\{count:10\}\)/);
  assert.doesNotMatch(ui, /Epic pity \{state\.skillPityEpic/);
  assert.doesNotMatch(ui, /Mythic pity \{state\.skillPityMythic/);
});

test('Luck display combines equipped Rune and Undercrypt multipliers and uses x notation', () => {
  const rune: CombatRune = {
    id: 'luck-display-test', name: 'Luck Test Rune', rarity: 'Mythic',
    stat: 'luckPct', value: 100, level: 1, sourceDepth: 1,
    sourceDungeon: 'undercrypt',
  };
  const bonuses = combatRuneBonuses([rune], [rune.id]);
  assert.ok(combatRuneLuckMultiplier(bonuses.luckPct) > 1);
  assert.ok(undercryptOrbLuckMultiplier(21) > undercryptOrbLuckMultiplier(1));
  const roll = source('src/client/components/RollSection.tsx');
  assert.match(roll, /combatRuneLuckMultiplier\(runeLuckPct\)/);
  assert.match(roll, /undercryptOrbLuckMultiplier/);
  assert.match(roll, /Total Luck/);
  assert.match(roll, /\{totalLuckMultiplier\.toFixed\(2\)\}x/);
  assert.doesNotMatch(roll, /Math\.round\(\(luck - 1\) \* 100\)\}%/);
});

test('Auto-buy has an explicit off-by-default toggle and respects spend serialization', () => {
  const ui = source('src/client/components/UpgradesSection.tsx');
  assert.match(ui, /getItem\('io-auto-buy-upgrades'\) === 'true'/);
  assert.match(ui, /checked=\{autoBuyEnabled\}/);
  assert.match(ui, /setAutoBuyEnabled\(event\.target\.checked\)/);
  assert.match(ui, /if \(!autoBuyEnabled \|\| busy \|\| upgradingAll/);
  assert.match(ui, /onBuyUpgrade\(candidate\.id\)/);
  assert.match(ui, /autoBuyInFlightRef\.current/);
});

test('Roll menu is centered, redundant Pity Luck tier text is absent, and Shards are integer-formatted', () => {
  const roll = source('src/client/components/RollSection.tsx');
  const styles = source('src/client/styles.css');
  const shared = source('src/shared/game.ts');
  assert.doesNotMatch(roll, /Pity Luck · Tier/);
  assert.match(roll, /totalLuckMultiplier\.toFixed\(2\)/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 272px/);
  assert.doesNotMatch(styles, /grid-template-columns: minmax\(0, 760px\) !important/);
  assert.match(shared, /formatShardAmount\(value: unknown\): string/);
});

test('Gear and skill tooltips follow the pointer and close when it leaves the right icon', () => {
  const combat = source('src/client/components/CombatSection.tsx');
  const styles = source('src/client/styles.css');
  assert.match(combat, /onPointerMove=\{event=>\{if\(event\.pointerType==='mouse'\)moveTooltip\(event\.clientX,event\.clientY\);\}\}/);
  assert.ok(combat.includes('createPortal('), 'gear tooltips should render outside overflow and stacking-context ancestors');
  assert.ok(combat.includes('onPointerLeave={event=>closeTooltipIfOutside(event.relatedTarget)}'));
  assert.ok(styles.includes('pointer-events:auto;opacity:1;visibility:visible;transform:translateY(0)'));
  assert.match(combat, /setInspectedSkillId\(current=>current===skill\.id\?null:current\)/);
  assert.match(combat, /const closeOutside=\(event:PointerEvent\)/);
  assert.doesNotMatch(styles, /io-combat-gear-icon-wrap:hover \.io-combat-gear-tooltip/);
  assert.doesNotMatch(styles, /io-combat-skill-icon-wrap:focus-within \.io-combat-skill-tooltip/);
});

test('main-game Auto Roll and combat beats cannot overlap, and abilities queue for the next beat', () => {
  const main = source('src/client/main.tsx');
  const combat = source('src/client/components/CombatSection.tsx');
  assert.ok(main.includes('if (combatModeRef.current || combatBeatInFlightRef.current) return;'));
  assert.ok(main.includes('rollActionLockRef.current) {'));
  assert.ok(main.includes('Wait for the current combat beat to finish before returning to Orbs.'));
  assert.ok(main.includes("body: JSON.stringify({ enabled: false })"));
  assert.ok(combat.includes('Queue the selected ability; the next scheduled/manual beat consumes it.'));
  assert.ok(combat.includes("setQueuedAbilityId(skillId)"), 'the chosen skill should visibly remain queued');
  assert.ok(combat.includes("'Queued · next beat'"));
  assert.ok(!combat.includes("setError('');void beat();"), 'clicking a skill must not trigger a beat immediately');
});

test('Skill Codex is sorted by rarity then name, and the Forge no longer repeats the Major Ability guide', () => {
  const combat = source('src/client/components/CombatSection.tsx');
  assert.match(combat, /const skillRarityOrder:Record<string,number>/);
  assert.match(combat, /\.sort\(\(a,b\)=>\(skillRarityOrder\[a\.rarity\]/);
  assert.doesNotMatch(combat, /io-combat-major-info/);
});

test('PvP result uses the combat-stat showcase and animated per-round battle log', () => {
  const combat = source('src/client/components/CombatSection.tsx');
  const styles = source('src/client/styles.css');
  assert.match(combat, /io-combat-arena-showdown/);
  assert.match(combat, /arenaResult\.opponent\.speed/);
  assert.match(combat, /arenaResult\.opponent\.damage/);
  assert.match(combat, /io-combat-arena-turn/);
  assert.match(styles, /@keyframes io-arena-combatant-in/);
  assert.match(styles, /@keyframes io-arena-turn-in/);
});

test('Global Chat never lets launcher context override the registered comment destination', () => {
  const social = source('src/server/social.ts');
  assert.match(social, /async function requireGlobalChatLauncher\(\): Promise<string>/);
  assert.match(social, /return resolveGlobalGamePostId\(\)/);
  assert.doesNotMatch(social, /currentPostId !== destination/);
  assert.match(social, /targetPostId !== registeredPostId/);
});


test('combat health bar separates HP, overhealth, and shields by color', () => {
  const ui = source('src/client/components/CombatSection.tsx');
  const css = source('src/client/styles.css');
  assert.ok(ui.includes('io-combat-hp-overhealth'), 'overhealth must have its own visual segment');
  assert.ok(ui.includes('io-combat-hp-shield'), 'shield must have its own visual segment');
  assert.ok(css.includes('.io-combat-hp-overhealth') && css.includes('#f4d04c'), 'overhealth must be yellow');
  assert.ok(css.includes('.io-combat-hp-shield') && css.includes('#58a6ff'), 'shield must be blue');
});

test('desktop roll layout keeps discovery cards right of a centered orb column', () => {
  const roll = source('src/client/components/RollSection.tsx');
  const css = source('src/client/styles.css');
  assert.ok(roll.includes('<aside className="roll-sidebar"'), 'discovery summary should remain a separate sidebar');
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) 272px'), 'desktop roll layout must reserve a right-hand sidebar');
  assert.ok(!css.includes('grid-template-columns: minmax(0, 760px) !important'), 'a one-column desktop override must not push discovery cards below the orb');
});
