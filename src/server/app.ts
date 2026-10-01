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
  activatePremiumBooster,
  buyAutomation,
  claimCommunityReward,
  getOnlinePlayers,
  claimOrbFrenzy,
  getOrbFrenzyInfo,
  startOrbFrenzy,
  getGlobalBoosters,
  activateGlobalBooster,
  grantPurchasedPack,
  refundPurchasedPack,
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
import { payments } from '@devvit/web/server';
import type { Order, PaymentHandlerResponse } from '@devvit/web/server';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  // Serialize state-changing requests per player. The client is untrusted and may
  // double-submit buttons or send concurrent requests, so mutations must not race.
  const mutationQueues = new Map<string, Promise<void>>();
  app.use('/api', async (req, res, next) => {
    const mutatesState = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const readsAndPersistsPlayerState =
      req.method === 'GET' &&
      ['/me', '/leaderboard', '/guilds', '/achievements'].includes(req.path);
    if (!mutatesState && !readsAndPersistsPlayerState) return next();
    const playerKey = context.userId ?? req.ip ?? 'unknown';
    const previous = mutationQueues.get(playerKey) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    const chain = previous.then(() => current);
    mutationQueues.set(playerKey, chain);

    await previous;

    let released = false;
    const releaseOnce = () => {
      if (released) return;
      released = true;
      release();
      if (mutationQueues.get(playerKey) === chain) mutationQueues.delete(playerKey);
    };
    res.once('finish', releaseOnce);
    res.once('close', releaseOnce);
    next();
  });

  // Devvit custom-post entrypoints. These are called by Reddit's moderator menu and install trigger.
  app.post('/internal/payments/fulfill', async (req, res) => {
    try {
      const order = req.body as Order;
      if (order.status !== 'PAID' || !order.userId || !order.id) {
        return res.json<PaymentHandlerResponse>({ success: false, reason: 'Order is not payable.' });
      }
      const skus = order.products.map(product => product.sku);
      if (skus.length !== 1) {
        return res.json<PaymentHandlerResponse>({ success: false, reason: 'Infinity Orbs purchases must contain one product.' });
      }
      await grantPurchasedPack(order.userId, skus[0], order.id);
      return res.json<PaymentHandlerResponse>({ success: true });
    } catch (e: any) {
      console.error('Payment fulfillment failed:', e);
      return res.json<PaymentHandlerResponse>({
        success: false,
        reason: e?.message || 'Unable to fulfill purchase.',
      });
    }
  });

  app.post('/internal/payments/refund', async (req, res) => {
    try {
      const order = req.body as Order;
      if (!order.userId || !order.id) {
        return res.json<PaymentHandlerResponse>({ success: false, reason: 'Refund order is missing an identity.' });
      }
      const skus = order.products.map(product => product.sku);
      if (skus.length !== 1) {
        return res.json<PaymentHandlerResponse>({ success: false, reason: 'Refund must identify one product.' });
      }
      await refundPurchasedPack(order.userId, skus[0], order.id);
      return res.json<PaymentHandlerResponse>({ success: true });
    } catch (e: any) {
      console.error('Payment refund failed:', e);
      return res.json<PaymentHandlerResponse>({
        success: false,
        reason: e?.message || 'Unable to process refund.',
      });
    }
  });

  app.post('/internal/menu/post-create', async (_req, res) => {
    try {
      const subredditName = context.subredditName;
      if (!subredditName) return res.status(400).json({ showToast: 'No subreddit context available.' });
      const post = await reddit.submitCustomPost({
        title: 'Infinity Orbs',
        entry: 'default',
      });
      res.json({ navigateTo: `https://reddit.com/r/${subredditName}/comments/${post.id}` });
    } catch (e) {
      console.error('Failed to create Infinity Orbs post:', e);
      res.status(400).json({ showToast: 'Failed to create Infinity Orbs post.' });
    }
  });

  app.post('/internal/on-app-install', async (_req, res) => {
    try {
      const subredditName = context.subredditName;
      if (!subredditName) return res.status(400).json({ status: 'error', message: 'No subreddit context available.' });
      const post = await reddit.submitCustomPost({
        title: 'Infinity Orbs',
        entry: 'default',
      });
      res.json({ status: 'success', message: `Created Infinity Orbs post ${post.id} in r/${subredditName}.` });
    } catch (e) {
      console.error('Failed to create install post:', e);
      res.status(400).json({ status: 'error', message: 'Failed to create Infinity Orbs post.' });
    }
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/me', async (_req, res) => {
    try { res.json(await getMe()); }
    catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch player state.' }); }
  });

  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const lb = await leaderboard();
      const s = await getMe();
      await recordSocialVisit(s);
      res.json(lb);
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch leaderboard.' }); }
  });

  app.get('/api/guilds', async (_req, res) => {
    try {
      const gd = await guildInfo();
      const s = await getMe();
      await recordSocialVisit(s);
      res.json(gd);
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch guilds.' }); }
  });

  app.get('/api/global-boosters', async (_req, res) => {
    try { res.json(await getGlobalBoosters()); }
    catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch World Boosters.' }); }
  });

  app.get('/api/products', async (_req, res) => {
    try {
      res.json(await payments.getProducts());
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to fetch products.' });
    }
  });

  app.get('/api/online', async (_req, res) => {
    try {
      res.json({ onlinePlayers: await getOnlinePlayers() });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to fetch online players.' });
    }
  });

  app.get('/api/world-event', async (_req, res) => {
    try {
      const event = await getCommunityEvent();
      res.json(event);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to fetch world event.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/dev', debugRouter);
  }

  app.post('/api/dev/event', async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found.' });
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
        'autoBuyer', 'supernova', 'altarResonator', 'offlineOverdrive', 'singularityTithe',
        'luckyFloor', 'astralArsenal', 'deepVault', 'masteryEngine', 'steadyHands', 'offlineFortune'
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
      const numCoins = Number(coins);
      const numShards = Number(shards);
      if (!Number.isFinite(numCoins) || !Number.isFinite(numShards) ||
          numCoins < 0 || numShards < 0 ||
          !Number.isSafeInteger(Math.floor(numCoins)) || !Number.isSafeInteger(Math.floor(numShards))) {
        return res.status(400).json({ error: 'Invalid offering amounts.' });
      }
      const result = await sacrificeToAltar(numCoins, numShards);
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

  app.post('/api/cosmetics/buy', async (req, res) => {
    try { res.json({ state: await buyCosmetic(req.body?.id) }); } catch (e) { badRequest(res, e, 'Cosmetic purchase failed.'); }
  });

  app.post('/api/global-boosters/activate', async (req, res) => {
    try {
      const id = req.body?.id;
      const useCredit = req.body?.useCredit === true;
      const validIds = ['luck', 'speed', 'crit'];
      if (!validIds.includes(id)) return res.status(400).json({ error: 'Invalid World Booster.' });
      res.json(await activateGlobalBooster(id, useCredit));
    } catch (e) { badRequest(res, e, 'Failed to activate World Booster.'); }
  });

  app.post('/api/boosters/activate', async (req, res) => {
    try {
      const id = req.body?.id;
      const validIds = ['fortune', 'hyperdrive', 'barrage', 'prosperity', 'ascension'];
      if (!validIds.includes(id)) return res.status(400).json({ error: 'Invalid premium booster.' });
      res.json({ state: await activatePremiumBooster(id) });
    } catch (e) { badRequest(res, e, 'Failed to activate booster.'); }
  });

  app.post('/api/automation/buy', async (req, res) => {
    try {
      const id = req.body?.id;
      const validIds = ['autoQuestClaim', 'autoStreakClaim', 'autoCommunityClaim', 'autoOfflineClaim', 'autoUpgrade'];
      if (!validIds.includes(id)) return res.status(400).json({ error: 'Invalid automation.' });
      res.json({ state: await buyAutomation(id) });
    } catch (e) { badRequest(res, e, 'Failed to unlock automation.'); }
  });

  app.post('/api/community/reward/claim', async (_req, res) => {
    try {
      res.json(await claimCommunityReward());
    } catch (e) { badRequest(res, e, 'Could not claim community reward.'); }
  });

  app.post('/api/frenzy/start', async (_req, res) => {
    try { res.json(await startOrbFrenzy()); }
    catch (e) { badRequest(res, e, 'Could not start Orb Frenzy.'); }
  });

  app.get('/api/frenzy/info', async (_req, res) => {
    try { res.json(await getOrbFrenzyInfo()); }
    catch (e) { badRequest(res, e, 'Could not load Orb Frenzy.'); }
  });

  app.post('/api/frenzy/claim', async (_req, res) => {
    try { res.json(await claimOrbFrenzy()); }
    catch (e) { badRequest(res, e, 'Could not claim Orb Frenzy.'); }
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
      const numCoinsRaw = Number(coins);
      const numShardsRaw = Number(shards);
      if (!Number.isFinite(numCoinsRaw) || !Number.isFinite(numShardsRaw) ||
          numCoinsRaw < 0 || numShardsRaw < 0 ||
          !Number.isSafeInteger(Math.floor(numCoinsRaw)) || !Number.isSafeInteger(Math.floor(numShardsRaw))) {
        return res.status(400).json({ error: 'Invalid donation amounts.' });
      }
      const numCoins = Math.floor(numCoinsRaw);
      const numShards = Math.floor(numShardsRaw);
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
      if (!Number.isSafeInteger(value) || value <= 0 || (s.collection[String(value)] ?? 0) <= 0) {
        return res.status(400).json({ error: 'You can only share an orb you actually own.' });
      }
      if (s.lastShareAt && Date.now() - s.lastShareAt < 30_000) {
        return res.status(429).json({ error: 'Please wait before sharing another orb.' });
      }
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
      await recordShareAction(s);
      res.json({ success: true, id: postId, text });
    } catch (e) { badRequest(res, e, 'Could not create Reddit post.'); }
  });

  return app;
}
