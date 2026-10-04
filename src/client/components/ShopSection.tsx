import React, { useEffect, useState } from 'react';
import { purchase, OrderResultStatus } from '@devvit/web/client';
import { Gem, ShoppingBag, Sparkles } from 'lucide-react';
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
  onPurchased: () => Promise<void>;
}

export const ShopSection: React.FC<ShopSectionProps> = ({ state, busy, onPurchased }) => {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingSku, setBuyingSku] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  const reconcilePurchase = async (baselineShards: number, baselineCredits: number, orderId = ''): Promise<boolean> => {
    try {
      const reconcileRes = await fetch('/api/payments/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderId ? { orderId } : {}),
      });
      if (!reconcileRes.ok) return false;
      const reconciliation = await reconcileRes.json().catch(() => ({}));
      const granted = Number(reconciliation?.granted ?? 0) || 0;
      if (granted > 0) {
        await onPurchased();
        return true;
      }

      if (orderId) return false;

      // Legacy fallback when the native bridge did not expose an order ID.
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
          if (await reconcilePurchase(baselineShards, baselineCredits, orderId)) {
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
        if (await reconcilePurchase(baselineShards, baselineCredits, orderId)) {
          setMessage('Purchase complete. Your Shards and Global Booster credits were added.');
        } else {
          setMessage(formatPaymentError(result.errorMessage, 'Purchase was not completed.'));
        }
      }
    } catch (e: unknown) {
      console.error('[Payments] Client purchase exception:', e);
      if (await reconcilePurchase(baselineShards, baselineCredits, orderId)) {
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
            <span className="text-xl font-black text-cyan-200">{state.shards.toLocaleString()} <Gem className="inline w-4 h-4" /></span>
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
