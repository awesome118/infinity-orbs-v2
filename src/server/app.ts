import express from 'express';
import { debugRouter, isDebugUser } from './debug.js';
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
  getDeveloperAnnouncement,
  loadRaw,
  recordSocialVisit,
  recordShareAction,
  save,
  sacrificeToAltar,
  upgradeMasterySkill,
  getCollectionPage,
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
} from './social.js';
import { context, reddit } from './devvit-mock.js';
import * as devvitServer from '@devvit/web/server';
import { PURCHASE_PACKS, spendShards, FEATURE_UNLOCK_LEVELS, type FeatureId } from '../shared/game.js';

type PaymentHandlerResponse = {
  success: boolean;
  reason?: string;
};

type PaymentOrder = {
  id?: string;
  userId?: string;
  status?: string;
  products?: Array<{ sku?: string }>;
};
const payments = (devvitServer as typeof devvitServer & {
  payments: {
    getProducts(): Promise<unknown>;
    getOrders(): Promise<unknown>;
  };
}).payments;

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  // Keep the enormous Codex collection out of ordinary client-state payloads.
  // The collection itself remains server-side and is fetched through /api/collection
  // in small pages when the Codex is opened.
  const stripPlayerCollection = (value: any): any => {
    if (!value || typeof value !== 'object') return value;
    if (
      !Array.isArray(value) &&
      'collection' in value &&
      'coins' in value &&
      'shards' in value &&
      'totalRolls' in value &&
      'highestRarity' in value
    ) {
      const copy = { ...value };
      copy.collection = {};
      copy.collectionCount = Object.keys(value.collection ?? {}).length;
      return copy;
    }
    if (!Array.isArray(value) && value.state && typeof value.state === 'object') {
      return { ...value, state: stripPlayerCollection(value.state) };
    }
    if (!Array.isArray(value) && value.state?.state && typeof value.state.state === 'object') {
      return { ...value, state: { ...value.state, state: stripPlayerCollection(value.state.state) } };
    }
    return value;
  };

  // Persistent player data is keyed by Reddit user ID. Logged-out users have
  // no account identity, so they must never reach player-state APIs.
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    const userId = String(context.userId ?? '').trim();
    if (!userId) {
      return res.status(401).json({
        error: 'REDDIT_LOGIN_REQUIRED',
        message: 'Log in to a Reddit account to play Infinity Orbs.',
      });
    }
    next();
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) return next();
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => originalJson(stripPlayerCollection(body))) as typeof res.json;
    next();
  });

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

  // Major systems unlock gradually so new players learn the core loop before
  // the advanced economy, social systems, and prestige layers appear.
  const featureForPath = (path: string): FeatureId | null => {
    if (path === '/upgrade' || path === '/upgrade/all') return 'upgrades';
    if (path === '/products' || path === '/payments/reconcile') return 'shop';
    if (path === '/collection') return 'collection';
    if (path === '/quests/claim') return 'quests';
    if (path === '/global-boosters' || path === '/global-boosters/activate' ||
        path === '/boosters/activate' || path === '/automation/buy') return 'boosters';
    if (path === '/leaderboard' || path === '/guilds' || path.startsWith('/guilds/') ||
        path === '/social/visit' || path === '/online' || path === '/world-event' ||
        path.startsWith('/community/')) return 'social';
    if (path.startsWith('/altar/')) return 'altar';
    if (path.startsWith('/mastery/')) return 'mastery';
    if (path === '/prestige' || path.startsWith('/prestige/')) return 'prestige';
    return null;
  };

  app.use('/api', async (req, res, next) => {
    const feature = featureForPath(req.path);
    if (!feature) return next();

    try {
      const s = await loadRaw();
      const requiredLevel = FEATURE_UNLOCK_LEVELS[feature];
      if ((s.level || 1) < requiredLevel) {
        return res.status(403).json({
          error: `Reach Level ${requiredLevel} to unlock this feature.`,
          feature,
          requiredLevel,
          currentLevel: s.level || 1,
        });
      }
    } catch (e) {
      console.error('Feature gate check failed:', e);
      return res.status(500).json({ error: 'Could not verify feature access.' });
    }

    next();
  });

  // Game bans are enforced server-side. Banned players can still load /api/me
  // so the client can render the ban screen, and the admin identity can still
  // use /api/dev to unban or otherwise recover the account. Admins do not bypass
  // the game ban for ordinary gameplay endpoints.
  app.use('/api', async (req, res, next) => {
    if (req.path === '/me' || req.path === '/dev' || req.path.startsWith('/dev/')) return next();

    try {
      const { getGameBanStatus } = await import('./game.js');
      const ban = await getGameBanStatus();
      if (ban) {
        return res.status(403).json({
          error: ban.reason || 'Your Infinity Orbs account is banned.',
          gameBan: {
            active: true,
            bannedAt: ban.bannedAt,
            bannedUntil: ban.bannedUntil,
            reason: ban.reason,
          },
        });
      }
    } catch (e) {
      console.error('Game ban check failed:', e);
    }
    next();
  });

  // Reddit Payments fulfillment follows Devvit's Order contract exactly.
  // The user identity for a payment comes from the Order, not from arbitrary request data.
  app.post('/internal/payments/fulfill', async (req, res) => {
    try {
      const order = req.body as PaymentOrder;
      const buyerUserId = String(order?.userId ?? '').trim();
      const orderId = String(order?.id ?? '').trim();
      console.error('[Payments] Fulfill received:', JSON.stringify({
        id: order?.id ?? null,
        orderUserId: order?.userId ?? null,
        status: order?.status ?? null,
        products: order?.products?.map((product: { sku?: string }) => ({ sku: product.sku })),
      }));

      // Devvit invokes this endpoint as part of the completed purchase flow.
      // Do not reject fulfillment solely because a status field is absent or
      // differs between payment environments. The official Devvit Web payments
      // example uses the fulfillment callback itself as the trusted signal and
      // takes the buyer from context.userId.
      if (!buyerUserId) {
        return res.json({
          success: false,
          reason: 'Unable to identify the purchasing Reddit account.',
        });
      }

      if (!Array.isArray(order.products) || order.products.length !== 1 || !order.products[0]?.sku) {
        return res.json({
          success: false,
          reason: 'Infinity Orbs purchases must contain one product.',
        });
      }

      if (!orderId) {
        return res.json({
          success: false,
          reason: 'Purchase order is missing its order ID.',
        });
      }

      await grantPurchasedPack(buyerUserId, order.products[0].sku, orderId);
      return res.json({ success: true });
    } catch (e: unknown) {
      console.error('[Payments] Fulfillment failed:', e instanceof Error ? e.stack ?? e.message : e);
      return res.json({
        success: false,
        reason: e instanceof Error ? e.message : 'Unable to fulfill purchase.',
      });
    }
  });

  app.post('/internal/payments/refund', async (req, res) => {
    try {
      const order = req.body as Order;
      const buyerUserId = String(order?.userId ?? '').trim();
      const orderId = String(order?.id ?? '').trim();
      if (!buyerUserId || !orderId) {
        return res.json({
          success: false,
          reason: 'Refund order is missing an identity.',
        });
      }
      if (!Array.isArray(order.products) || order.products.length !== 1 || !order.products[0]?.sku) {
        return res.json({
          success: false,
          reason: 'Refund must identify one product.',
        });
      }

      await refundPurchasedPack(buyerUserId, order.products[0].sku, orderId);
      return res.json({ success: true } satisfies PaymentHandlerResponse);
    } catch (e: unknown) {
      console.error('[Payments] Refund failed:', e instanceof Error ? e.stack ?? e.message : e);
      return res.json({
        success: false,
        reason: e instanceof Error ? e.message : 'Unable to process refund.',
      });
    }
  });

  app.post('/api/payments/reconcile', async (_req, res) => {
    try {
      const userId = String(context.userId ?? '').trim();
      if (!userId) return res.status(401).json({ error: 'REDDIT_LOGIN_REQUIRED' });

      const rawOrders = await payments.getOrders();
      const orders = Array.isArray(rawOrders)
        ? rawOrders
        : rawOrders && typeof rawOrders === 'object' && Array.isArray((rawOrders as { orders?: unknown }).orders)
          ? (rawOrders as { orders: unknown[] }).orders
          : [];

      let granted = 0;
      for (const rawOrder of orders) {
        if (!rawOrder || typeof rawOrder !== 'object') continue;
        const order = rawOrder as PaymentOrder;
        if (order.userId !== userId || order.status !== 'PAID' || !order.id) continue;
        if (!Array.isArray(order.products) || order.products.length !== 1) continue;
        const sku = String(order.products[0]?.sku ?? '');
        if (!sku) continue;
        try {
          if (await grantPurchasedPack(userId, sku, order.id)) granted++;
        } catch (error) {
          console.error('[Payments] Reconciliation failed for order', order.id, error);
        }
      }

      res.json({ ok: true, granted });
    } catch (e: unknown) {
      console.error('[Payments] Reconciliation lookup failed:', e instanceof Error ? e.stack ?? e.message : e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Unable to reconcile purchases.' });
    }
  });

  app.get('/api/products', async (_req, res) => {
    const fallbackProducts = PURCHASE_PACKS.map(pack => ({
      sku: pack.sku,
      displayName: pack.name,
      description: pack.description,
      price: pack.priceGold,
    }));

    try {
      const raw = await payments.getProducts();
      const products = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { products?: unknown }).products)
          ? (raw as { products: unknown[] }).products
          : null;

      if (!products) {
        console.error('[Payments] Product lookup returned an unexpected response shape.');
        return res.json(fallbackProducts);
      }

      const normalized = products
        .filter((product): product is Record<string, unknown> => Boolean(product) && typeof product === 'object')
        .map(product => ({
          sku: String(product.sku ?? ''),
          displayName: String(product.displayName ?? 'Shard Pack'),
          description: String(product.description ?? ''),
          price: Number(product.price ?? 0),
        }))
        .filter(product => product.sku && Number.isFinite(product.price) && product.price > 0);

      return res.json(normalized.length > 0 ? normalized : fallbackProducts);
    } catch (e: unknown) {
      console.error('[Payments] Product lookup failed:', e instanceof Error ? e.stack ?? e.message : e);
      // Keep the shop usable in playtest if the payment catalog lookup is temporarily unavailable.
      return res.json(fallbackProducts);
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

  app.get('/api/developer-announcement', async (_req, res) => {
    try {
      res.json(await getDeveloperAnnouncement());
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to fetch developer announcement.' });
    }
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/me', async (_req, res) => {
    try { res.json(await getMe()); }
    catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch player state.' }); }
  });

  app.get('/api/collection', async (req, res) => {
    try {
      const offset = Math.max(0, Math.floor(Number(req.query.offset ?? 0) || 0));
      const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit ?? 60) || 60)));
      const sortValue = String(req.query.sort ?? 'rarity_desc');
      const sort =
        sortValue === 'rarity_asc' || sortValue === 'count'
          ? sortValue
          : 'rarity_desc';
      const tier = String(req.query.tier ?? 'all');
      res.json(await getCollectionPage({ offset, limit, tier, sort }));
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to fetch Codex entries.' });
    }
  });

  app.get('/api/leaderboard', async (_req, res) => {
    try {
      res.json(await leaderboard());
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch leaderboard.' }); }
  });

  app.get('/api/guilds', async (_req, res) => {
    try {
      res.json(await guildInfo());
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch guilds.' }); }
  });

  // Count an explicit visit to the social tab, not background API refreshes.
  app.post('/api/social/visit', async (_req, res) => {
    try {
      const s = await getMe();
      await recordSocialVisit(s);
      res.json({ ok: true, state: s });
    } catch (e: any) { badRequest(res, e, 'Could not record social visit.'); }
  });

  app.get('/api/global-boosters', async (_req, res) => {
    try { res.json(await getGlobalBoosters()); }
    catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to fetch World Boosters.' }); }
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

  // Debug routes are always mounted, but debug.ts rejects every request unless
  // the trusted Devvit username is exactly "shadow_fen".
  app.use('/api/dev', debugRouter);

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
        'luckyFloor', 'astralArsenal', 'deepVault', 'masteryEngine', 'steadyHands', 'offlineFortune',
        'frenzyVolley'
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
