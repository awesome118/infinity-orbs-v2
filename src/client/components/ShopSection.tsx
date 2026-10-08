import React, { useEffect, useState } from 'react';
import { purchase, OrderResultStatus } from '@devvit/web/client';
import { Flame, Gem, Gift, ShoppingBag, Sparkles } from 'lucide-react';
import { formatNumber } from '../../shared/game.js';
import type { PlayerState } from '../../shared/game.js';

interface ShopProduct {
  sku: string;
  displayName: string;
  description: string;
  price: number;
}

function formatPaymentError(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    for (const key of ['message', 'errorMessage', 'reason', 'error']) {
      const candidate = objectValue[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeProducts(raw: unknown): ShopProduct[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { products?: unknown }).products)
      ? (raw as { products: unknown[] }).products
      : [];

  return source
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      sku: String(item.sku ?? ''),
      displayName: String(item.displayName ?? 'Shard Pack'),
      description: String(item.description ?? ''),
      price: Number(item.price ?? 0),
    }))
    .filter(product => product.sku.length > 0 && Number.isFinite(product.price) && product.price > 0);
}

interface ShopSectionProps {
  state: PlayerState;
  busy: boolean;
  onClaimDailyStreak: () => Promise<void>;
  onPurchased: () => Promise<void>;
}

export const ShopSection: React.FC<ShopSectionProps> = ({ state, busy, onClaimDailyStreak, onPurchased }) => {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingSku, setBuyingSku] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const claimedToday = state.streak.lastClaimDate === today;
  const currentCount = Math.max(1, state.streak.count || 1);
  const nextStreak = claimedToday ? currentCount : state.streak.lastClaimDate ? currentCount + 1 : 1;
  const day = ((nextStreak - 1) % 7) + 1;
  const rewardCoins = day * 100;
  const rewardShards = day === 7 ? 5 : day === 3 ? 1 : 0;
  const rewardFreeRolls = day * 5;
  const community = state.dailyStreakCommunity;
  const communityGoal = Math.max(1, community?.goal ?? 250);
  const communityProgress = Math.max(0, community?.currentProgress ?? 0);
  const communityPercent = Math.min(100, communityProgress / communityGoal * 100);
  const luckPercent = Math.max(0, Math.round(((community?.luckMultiplier ?? 1) - 1) * 100));
  const speedPercent = Math.max(0, Math.round((1 - (community?.speedMultiplier ?? 1)) * 100));

  useEffect(() => {
    fetch('/api/products')
      .then(async r => {
        if (!r.ok) throw new Error('Unable to load products.');
        return normalizeProducts(await r.json());
      })
      .then(setProducts)
      .catch(e => {
        setProducts([]);
        setMessage(e?.message || 'Unable to load the shop.');
      })
      .finally(() => setLoading(false));
  }, []);

  const reconcilePurchase = async (baselineShards: number, baselineCredits: number): Promise<boolean> => {
    try {
      const reconcileRes = await fetch('/api/payments/reconcile', { method: 'POST' });
      if (!reconcileRes.ok) return false;

      const meRes = await fetch('/api/me');
      if (!meRes.ok) return false;
      const next = await meRes.json() as PlayerState;
      const fulfilled =
        next.shards > baselineShards ||
        (next.globalBoosterCredits ?? 0) > baselineCredits;

      if (fulfilled) await onPurchased();
      return fulfilled;
    } catch {
      return false;
    }
  };

  const buy = async (sku: string) => {
    if (buyingSku) return;
    setBuyingSku(sku);
    setMessage(null);
    const baselineShards = state.shards;
    const baselineCredits = state.globalBoosterCredits ?? 0;
    try {
      const result = await purchase(sku);
      console.error('[Payments] Client purchase result:', result);
      if (result.status === OrderResultStatus.STATUS_SUCCESS) {
        let fulfillmentObserved = false;
        for (const delayMs of [0, 500, 1000, 2000, 3000]) {
          if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
          if (await reconcilePurchase(baselineShards, baselineCredits)) {
            fulfillmentObserved = true;
            break;
          }
        }

        setMessage(
          fulfillmentObserved
            ? 'Purchase complete. Your Shards and Global Booster credits were added.'
            : 'Purchase accepted. Reddit is still finishing delivery; refresh shortly if the balances have not changed.'
        );
      } else {
        // Reddit can complete an order even when the client receives a malformed
        // or otherwise non-success response from the native payment bridge.
        // Reconcile before showing a hard failure so a paid entitlement is not
        // stranded behind a client-side parsing error.
        if (await reconcilePurchase(baselineShards, baselineCredits)) {
          setMessage('Purchase complete. Your Shards and Global Booster credits were added.');
        } else {
          setMessage(formatPaymentError(result.errorMessage, 'Purchase was not completed.'));
        }
      }
    } catch (e: unknown) {
      console.error('[Payments] Client purchase exception:', e);
      if (await reconcilePurchase(baselineShards, baselineCredits)) {
        setMessage('Purchase complete. Your Shards were added.');
      } else {
        setMessage(formatPaymentError(e, 'Purchase failed.'));
      }
    } finally {
      setBuyingSku(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 via-emerald-950/10 to-slate-900 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div><div className="flex items-center gap-2"><Flame className="w-5 h-5 text-emerald-300" /><h2 className="text-xl font-black text-white">Daily Streak</h2><span className="text-xs font-black text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-2 py-0.5">{claimedToday ? 'Claimed' : 'Ready'}</span></div><p className="mt-1 text-xs text-slate-400">Current streak: <span className="font-black text-white">{currentCount}</span> days · Longest: {state.streak.longestStreak} days.</p></div>
          <button onClick={() => { if (!claimedToday && !busy) void onClaimDailyStreak(); }} disabled={claimedToday || busy}
            className={claimedToday ? 'rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-black text-slate-500 border border-slate-700' : 'rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400 active:scale-95 transition-all'}>
            <Gift className="inline w-4 h-4 mr-1" />{claimedToday ? 'Claimed Today' : 'Claim Daily Reward'}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><span className="block text-[10px] uppercase font-black text-amber-300/70">Coins</span><span className="text-lg font-black text-white">+{formatNumber(rewardCoins)}</span></div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3"><span className="block text-[10px] uppercase font-black text-cyan-300/70">Shards</span><span className="text-lg font-black text-white">+{rewardShards}</span><span className="block text-[9px] text-cyan-400/70">Daily reward, outside roll cap</span></div>
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3"><span className="block text-[10px] uppercase font-black text-purple-300/70">Free Rolls</span><span className="text-lg font-black text-white">+{rewardFreeRolls}</span><span className="block text-[9px] text-slate-500">Manual rolls bypass cooldown</span></div>
          <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3"><span className="block text-[10px] uppercase font-black text-fuchsia-300/70">Community Tier</span><span className="text-lg font-black text-white">Tier {community?.tier ?? 1}</span><span className="block text-[9px] text-slate-500">Streak count adds to progress</span></div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-emerald-300">Daily Streak Community Goal</div><div className="text-[11px] text-slate-500 mt-1">Each claim contributes your full streak number.</div></div><div className="text-right text-[10px] font-black text-slate-400">{formatNumber(communityProgress)} / {formatNumber(communityGoal)}</div></div>
          <div className="mt-2 h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800"><div className="h-full bg-emerald-400 transition-all" style={{width: communityPercent + '%'}} /></div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold"><span className="text-emerald-300">+{luckPercent}% Luck</span><span className="text-cyan-300">+{speedPercent}% Speed</span><span className="text-slate-500">Next tier after the goal is completed.</span></div>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-500/20 bg-gradient-to-br from-slate-900 via-amber-950/10 to-slate-900 p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-amber-300" />
          <h2 className="text-xl font-black text-white">Shard Shop</h2>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Purchases use Reddit Gold through Reddit's native payment flow. Packs also include free Global Booster activations.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
            <span className="block text-[10px] uppercase font-black text-cyan-300/70">Shards</span>
            <span className="text-xl font-black text-cyan-200">{formatNumber(state.shards)} <Gem className="inline w-4 h-4" /></span>
          </div>
          <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-3">
            <span className="block text-[10px] uppercase font-black text-fuchsia-300/70">Free Global Boosts</span>
            <span className="text-xl font-black text-fuchsia-200">{state.globalBoosterCredits ?? 0} <Sparkles className="inline w-4 h-4" /></span>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
            {message}
          </div>
        )}
      </section>

      {loading ? (
        <div className="text-center text-sm text-slate-500 py-12">Loading products...</div>
      ) : (
        products.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {products.map(product => (
            <div key={product.sku} className="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 shadow-md">
              <h3 className="text-base font-black text-white">{product.displayName}</h3>
              <p className="mt-1 min-h-10 text-xs text-slate-400">{product.description}</p>
              <button
                onClick={() => void buy(product.sku)}
                disabled={busy || buyingSku !== null}
                className="mt-4 w-full rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-black text-white active:scale-95 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {buyingSku === product.sku ? 'Processing purchase…' : `Buy for ${product.price} Reddit Gold`}
              </button>
            </div>
          ))}
        </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <ShoppingBag className="w-8 h-8 mx-auto text-slate-600" />
            <div className="mt-3 text-sm font-bold text-slate-300">Shop products are unavailable</div>
            <div className="mt-1 text-xs text-slate-500">The game is still playable. Payment products could not be loaded right now.</div>
          </div>
        )
      )}
    </div>
  );
};
