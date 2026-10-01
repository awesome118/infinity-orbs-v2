import express from 'express';
import { debugRouter } from './debug.js';
import {
  getMe,
  roll,
  buyUpgrade,
  buyAllUpgrades,
  claimOffline,
  claimDailyStreak,
  claimQuest,
  prestige,
  buyPrestigeUpgrade,
  synthesizeDust,
  buyCosmetic,
  activateTurbo,
  recordSocialVisit,
  recordShareAction,
  save,
  sacrificeToAltar,
  upgradeMasterySkill,
} from './game.js';
import {
  achievements,
  claimAchievement,
  createGuild,
  guildInfo,
  joinGuild,
  leaveGuild,
  postGuildMessage,
  buyGuildPerk,
  donateToGuild,
  leaderboard,
  shareText,
  getCommunityEvent,
  setCommunityEventConfig,
} from './social.js';
import { context, reddit } from './devvit-mock.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/me', async (_req, res) => {
    try { res.json(await getMe()); }
    catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch player state.' }); }
  });

  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const lb = await leaderboard();
      const s = await getMe();
      recordSocialVisit(s);
      res.json(lb);
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch leaderboard.' }); }
  });

  app.get('/api/guilds', async (_req, res) => {
    try {
      const gd = await guildInfo();
      const s = await getMe();
      recordSocialVisit(s);
      res.json(gd);
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch guilds.' }); }
  });

  app.get('/api/world-event', async (_req, res) => {
    try {
      const event = await getCommunityEvent();
      res.json(event);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to fetch world event.' });
    }
  });

  app.post('/api/dev/event', async (req, res) => {
    try {
      const { goal, progress, addRolls, tier, buffMultiplier, reset } = req.body || {};
      const updated = await setCommunityEventConfig({ goal, progress, addRolls, tier, buffMultiplier, reset });
      res.json({ event: updated });
    } catch (e: any) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to update community event.' });
    }
  });

  app.get('/api/achievements', async (_req, res) => {
    try { res.json(await achievements(await getMe())); }
    catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch achievements.' }); }
  });

  const badRequest = (res: express.Response, e: unknown, fallback: string) => {
    res.status(400).json({ error: e instanceof Error ? e.message : fallback });
  };

  app.post('/api/roll', async (_req, res) => {
    try { res.json(await roll()); } catch (e) { badRequest(res, e, 'Roll failed.'); }
  });

  app.post('/api/offline/claim', async (_req, res) => {
    try { res.json(await claimOffline()); } catch (e) { badRequest(res, e, 'Offline claim failed.'); }
  });

  app.post('/api/upgrade', async (req, res) => {
    try {
      const { id } = req.body || {};
      const validUpgradeIds = [
        'speed', 'multi', 'clusterRoll', 'auto', 'luck', 'coinBonus',
        'shardChance', 'xpBonus', 'critChance', 'critPower', 'offlineRate', 'valueBonus'
      ];
      if (!validUpgradeIds.includes(id ?? '')) return res.status(400).json({ error: 'Unknown upgrade.' });
      res.json({ state: await buyUpgrade(id) });
    } catch (e) { badRequest(res, e, 'Upgrade failed.'); }
  });

  app.post('/api/upgrade/all', async (_req, res) => {
    try {
      res.json(await buyAllUpgrades());
    } catch (e) { badRequest(res, e, 'Upgrade all failed.'); }
  });

  app.post('/api/streak/claim', async (_req, res) => {
    try { res.json(await claimDailyStreak()); } catch (e) { badRequest(res, e, 'Could not claim daily streak.'); }
  });

  app.post('/api/quests/claim', async (req, res) => {
    try {
      const { type, id } = req.body || {};
      if (type !== 'daily' && type !== 'weekly') return res.status(400).json({ error: 'Invalid quest type.' });
      res.json(await claimQuest(type, id));
    } catch (e) { badRequest(res, e, 'Could not claim quest.'); }
  });

  app.post('/api/prestige', async (_req, res) => {
    try { res.json(await prestige()); } catch (e) { badRequest(res, e, 'Prestige failed.'); }
  });

  app.post('/api/prestige/upgrade', async (req, res) => {
    try {
      const { id } = req.body || {};
      const validIds = [
        'permLuck', 'permSpeed', 'vaultCap', 'dustBounty', 'sonarPing', 'instantReveal',
        'autoOverclock', 'autoFilter', 'resonanceMeter', 'stellarMagnet', 'chronoOverdrive',
        'transmutation', 'shardSynthesis', 'astralBarrage', 'cosmicInheritance',
        'autoBuyer', 'supernova', 'altarResonator', 'offlineOverdrive', 'singularityTithe'
      ];
      if (!validIds.includes(id)) return res.status(400).json({ error: 'Invalid prestige upgrade.' });
      res.json({ state: await buyPrestigeUpgrade(id) });
    } catch (e) { badRequest(res, e, 'Prestige upgrade failed.'); }
  });

  app.post('/api/prestige/synthesize', async (_req, res) => {
    try { res.json(await synthesizeDust()); } catch (e) { badRequest(res, e, 'Dust synthesis failed.'); }
  });

  app.post('/api/altar/sacrifice', async (req, res) => {
    try {
      const { coins = 0, shards = 0 } = req.body || {};
      const result = await sacrificeToAltar(Number(coins), Number(shards));
      res.json(result);
    } catch (e) {
      badRequest(res, e, 'Sacrifice to altar failed.');
    }
  });

  app.post('/api/mastery/upgrade', async (req, res) => {
    try {
      const { skillId } = req.body || {};
      const state = await upgradeMasterySkill(skillId);
      res.json({ state });
    } catch (e) {
      badRequest(res, e, 'Mastery upgrade failed.');
    }
  });

  app.use('/api/dev', debugRouter);

  app.post('/api/cosmetics/buy', async (req, res) => {
    try { res.json({ state: await buyCosmetic(req.body?.id) }); } catch (e) { badRequest(res, e, 'Cosmetic purchase failed.'); }
  });

  app.post('/api/turbo/activate', async (_req, res) => {
    try { res.json({ state: await activateTurbo() }); } catch (e) { badRequest(res, e, 'Failed to activate Turbo Roll.'); }
  });

  app.post('/api/achievements/claim', async (req, res) => {
    try {
      const s = await getMe();
      res.json(await claimAchievement(s, req.body?.id ?? ''));
    } catch (e) { badRequest(res, e, 'Could not claim achievement.'); }
  });

  app.post('/api/guilds/create', async (req, res) => {
    try { res.json({ guild: await createGuild(req.body?.name ?? '', req.body?.tag ?? '') }); }
    catch (e) { badRequest(res, e, 'Could not create guild.'); }
  });

  app.post('/api/guilds/join', async (req, res) => {
    try { res.json({ guild: await joinGuild(req.body?.id ?? '') }); }
    catch (e) { badRequest(res, e, 'Could not join guild.'); }
  });

  app.post('/api/guilds/leave', async (_req, res) => {
    try { res.json(await leaveGuild()); } catch (e) { badRequest(res, e, 'Could not leave guild.'); }
  });

  app.post('/api/guilds/chat', async (req, res) => {
    try { res.json({ message: await postGuildMessage(req.body?.text ?? '') }); }
    catch (e) { badRequest(res, e, 'Could not post message.'); }
  });

  app.post('/api/guilds/perk', async (req, res) => {
    try {
      const { perk } = req.body || {};
      const validPerks = ['luckRank', 'speedRank', 'vaultRank', 'shardRank', 'critRank', 'coinRank'];
      if (!validPerks.includes(perk)) return res.status(400).json({ error: 'Invalid guild perk.' });
      res.json(await buyGuildPerk(perk));
    } catch (e) { badRequest(res, e, 'Failed to upgrade guild perk.'); }
  });

  app.post('/api/guilds/donate', async (req, res) => {
    try {
      const { coins = 0, shards = 0 } = req.body || {};
      const numCoins = Math.max(0, Math.floor(coins));
      const numShards = Math.max(0, Math.floor(shards));
      const s = await getMe();
      if (s.coins < numCoins) throw new Error('Not enough coins.');
      if ((s.shards ?? 0) < numShards) throw new Error('Not enough shards.');
      s.coins -= numCoins;
      s.shards = (s.shards ?? 0) - numShards;
      s.guildContribution = (s.guildContribution ?? 0) + numCoins + (numShards * 1000);
      await save(s);
      const result = await donateToGuild(numCoins, numShards);
      res.json({ ...result, state: s });
    } catch (e) { badRequest(res, e, 'Donation failed.'); }
  });

  app.post('/api/share', async (req, res) => {
    try {
      const s = await getMe();
      const value = Number(req.body?.rarity);
      if (!Number.isInteger(value) || value <= 0 || value > s.highestRarity) return res.status(400).json({ error: 'Invalid Orb.' });
      const subredditName = context.subredditName;
      const text = shareText(s, value);
      let postId = `share-${Date.now()}`;
      if (subredditName) {
        const post = await reddit.submitCustomPost({
          runAs: 'USER',
          subredditName,
          title: `I got a 1/${value.toLocaleString()} Orb in Infinity Orbs!`,
          entry: 'default',
          userGeneratedContent: { text },
        });
        postId = post.id;
      }
      recordShareAction(s);
      res.json({ success: true, id: postId, text });
    } catch (e) { badRequest(res, e, 'Could not create Reddit post.'); }
  });

  return app;
}
