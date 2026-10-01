import { Router } from 'express';
import { loadRaw, save, applyRolls } from './game.js';
import { context } from './devvit-mock.js';
import { setCommunityEventConfig } from './social.js';
import { cooldownMs } from '../shared/game.js';
import { recordLeaderboard } from './social.js';

const DEBUG_USERS = new Set([
  'shadow_fen',
  'u/shadow_fen',
  '/u/shadow_fen',
]);

export function isDebugUser(): boolean {
  return DEBUG_USERS.has(context.username ?? '');
}

export const debugRouter = Router();

// Never trust the client to decide whether the debug menu is available. This
// middleware protects every debug endpoint, including any future ones added here.
debugRouter.use((_req, res, next) => {
  if (!isDebugUser()) return res.status(404).json({ error: 'Not found.' });
  next();
});


debugRouter.post('/event', async (req, res) => {
  try {
    const { goal, progress, addRolls, tier, buffMultiplier, reset } = req.body || {};
    const updated = await setCommunityEventConfig({ goal, progress, addRolls, tier, buffMultiplier, reset });
    res.json({ event: updated });
  } catch (e: any) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to update community event.' });
  }
});

// Add currencies
debugRouter.post('/currency', async (req, res) => {
  try {
    const { coins = 0, shards = 0, dust = 0 } = req.body;
    const s = await loadRaw();
    s.coins = Math.max(0, s.coins + Number(coins));
    s.shards = Math.max(0, (s.shards ?? 0) + Number(shards));
    s.cosmicDust = Math.max(0, (s.cosmicDust ?? 0) + Number(dust));
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Reset cooldown to 0 immediately
debugRouter.post('/reset-cooldown', async (req, res) => {
  try {
    const s = await loadRaw();
    s.lastRollAt = 0;
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Force roll a specific exact rarity (e.g. 1,000, 100,000, 10,000,000)
debugRouter.post('/force-roll', async (req, res) => {
  try {
    const { rarity = 1000 } = req.body;
    const s = await loadRaw();
    const forcedRarity = Math.max(2, Math.floor(Number(rarity)));

    const { bestOrb, batch, totalVal, coinsGained, shardsGained, xpGained } = await applyRolls(s, 1, forcedRarity);
    const now = Date.now();
    s.lastRollAt = now;
    s.lastSeenAt = now;
    await save(s);
    await recordLeaderboard(s);

    res.json({
      orb: bestOrb,
      batch,
      totalValueGained: totalVal,
      totalRollValue: totalVal,
      coinsGained,
      shardsGained,
      xpGained,
      state: s,
      rollsRemainingUntilNext: cooldownMs(s),
      dramaticReveal: bestOrb.rarity >= 100,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Max or unlock standard upgrades
debugRouter.post('/unlock-upgrades', async (req, res) => {
  try {
    const s = await loadRaw();
    s.upgrades = {
      speed: 20,
      multi: 6,
      auto: 1,
      luck: 20,
      coinBonus: 10,
      shardChance: 10,
      xpBonus: 10,
      critChance: 10,
      critPower: 10,
      offlineRate: 10,
      valueBonus: 10,
    };
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Add offline rolls
debugRouter.post('/add-offline', async (req, res) => {
  try {
    const { amount = 50 } = req.body;
    const s = await loadRaw();
    s.offlineRolls = (s.offlineRolls ?? 0) + Number(amount);
    await save(s);
    res.json({ ok: true, state: s });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Reset all progress completely
debugRouter.post('/reset-all', async (req, res) => {
  try {
    const { createInitialState } = await import('../shared/game.js');
    const fresh = createInitialState();
    await save(fresh);
    res.json({ ok: true, state: fresh });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
