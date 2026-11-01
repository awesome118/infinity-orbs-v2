import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialState,
  cooldownMs,
  theoreticalCooldownMs,
  cooldownReclaimerEnergyPerActivationMs,
  timeEnergyActivationsAvailable,
} from '../src/shared/game.js';

const NOW = 1_800_000_000_000;

function buildSub300State() {
  const state = createInitialState(NOW);
  state.upgrades.speed = 20;
  state.masterySkills!.chronoFlow = 20;
  state.prestigeUpgrades.permSpeed = 5;
  state.prestigeUpgrades.steadyHands = 5;
  state.prestigeUpgrades.temporalCompression = 5;
  state.dailyStreakCommunity = {
    ...state.dailyStreakCommunity!,
    speedMultiplier: 0.05,
  };
  return state;
}

test('Chrono Flow can push theoretical cooldown below 300ms while live rolls retain the 300ms floor', () => {
  const state = buildSub300State();
  state.masterySkills!.cooldownReclaimer = 1;
  const theoretical = theoreticalCooldownMs(state);
  assert.ok(theoretical > 0 && theoretical < 300, `expected sub-300ms theory, got ${theoretical}ms`);
  assert.equal(cooldownMs(state), 300, 'actual activations must keep the 300ms safety floor');
});

test('Cooldown Reclaimer returns 10% of total underflow per level, up to 100% at level 10', () => {
  const state = buildSub300State();
  const theoretical = theoreticalCooldownMs(state);
  const underflow = Math.max(0, 300 - theoretical);
  state.masterySkills!.cooldownReclaimer = 1;
  assert.equal(cooldownReclaimerEnergyPerActivationMs(state), Math.floor(underflow * 0.10));
  state.masterySkills!.cooldownReclaimer = 10;
  assert.equal(cooldownReclaimerEnergyPerActivationMs(state), Math.floor(underflow));
  assert.ok(cooldownReclaimerEnergyPerActivationMs(state) <= 300);

});

test('Cooldown Reclaimer does not award Time Energy unless the skill is purchased', () => {
  const state = buildSub300State();
  state.masterySkills!.cooldownReclaimer = 0;
  assert.equal(cooldownReclaimerEnergyPerActivationMs(state), 0);
});


test('Time Energy funds as many whole activations as the current cooldown can afford', () => {
  assert.equal(timeEnergyActivationsAvailable(4_000, 2_000), 2);
  assert.equal(timeEnergyActivationsAvailable(3_999, 2_000), 1);
  assert.equal(timeEnergyActivationsAvailable(1_999, 2_000), 0);
  assert.equal(timeEnergyActivationsAvailable(4_500, 2_000), 2);
  assert.equal(timeEnergyActivationsAvailable(1_000_000_000, 300), 5_000);
  assert.equal(timeEnergyActivationsAvailable(-1, 2_000), 0);
  assert.equal(timeEnergyActivationsAvailable(4_000, 0), 0);
});

test('Time Energy requests spend one current cooldown per activation and do not regenerate energy', () => {
  const server = source('src/server/game.ts');
  const start = server.indexOf('export async function roll(');
  const end = server.indexOf('export async function subscribeToSubredditForReward', start);
  const handler = server.slice(start, end);
  assert.match(handler, /timeEnergyActivationsAvailable\(s\.timeEnergy \?\? 0, cd\)/);
  assert.match(handler, /const freeRollActivations = usingTimeEnergy\s*\? timeEnergyActivations/);
  assert.match(handler, /s\.timeEnergy = Math\.max\(0, \(s\.timeEnergy \?\? 0\) - \(cd \* freeRollActivations\)\)/);
  assert.match(handler, /if \(!usingTimeEnergy && !usingFreeRoll\)/);
});
