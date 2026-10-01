import React, { useEffect, useState } from 'react';
import { purchase, OrderResultStatus } from '@devvit/web/client';
import { Gem, Sparkles, ShoppingBag } from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';

interface ShopProduct {
  sku: string;
  displayName: string;
  description: string;
  price: number;
}

interface ShopSectionProps {
  state: PlayerState;
  busy: boolean;
  onPurchased: () => Promise<void>;
}

export const ShopSection: React.FC<ShopSectionProps> = ({ state, busy, onPurchased }) => {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Unable to load products.')))
      .then(setProducts)
      .catch(e => setMessage(e.message || 'Unable to load the shop.'))
      .finally(() => setLoading(false));
  }, []);

  const buy = async (sku: string) => {
    setMessage(null);
    try {
      const result = await purchase(sku);
      if (result.status === OrderResultStatus.STATUS_SUCCESS) {
        setMessage('Purchase complete. Your Shards and Global Booster credits are being added.');
        await onPurchased();
      } else {
        setMessage(result.errorMessage || 'Purchase was not completed.');
      }
    } catch (e: any) {
      setMessage(e?.message || 'Purchase failed.');
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
          Purchases use Reddit Gold through Reddit's native payment flow. Each pack also includes free Global Booster activations.
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {products.map(product => (
            <div key={product.sku} className="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 shadow-md">
              <h3 className="text-base font-black text-white">{product.displayName}</h3>
              <p className="mt-1 min-h-10 text-xs text-slate-400">{product.description}</p>
              <button
                onClick={() => void buy(product.sku)}
                disabled={busy}
                className="mt-4 w-full rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-black text-white active:scale-95 disabled:bg-slate-800 disabled:text-slate-500"
              >
                Buy for {product.price} Reddit Gold
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
