import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sparkles, Users, Zap } from 'lucide-react';
import './styles.css';
import { formatRarity } from '../shared/game.js';

interface FrenzyInfo {
  rarity: number;
  ownerUsername: string;
  createdAt: number;
  claimedToday: boolean;
  isOwner: boolean;
  postId: string;
}

function FrenzyPost() {
  const [info, setInfo] = useState<FrenzyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [result, setResult] = useState<{ count: number; coins: number; xp: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/frenzy/info');
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load Frenzy.');
      const data = await res.json();
      setInfo(data);
      setClaimed(Boolean(data.claimedToday));
    } catch (e: any) {
      setError(e.message || 'Could not load Frenzy.');
    }
  };

  useEffect(() => { void load(); }, []);

  const claim = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/frenzy/claim', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not claim Frenzy.');
      setClaimed(true);
      setResult({
        count: data.frenzyCount ?? data.orb?.rarity ?? 0,
        coins: data.coinsGained,
        xp: data.xpGained,
      });
    } catch (e: any) {
      setError(e.message || 'Could not claim Frenzy.');
    } finally {
      setLoading(false);
    }
  };

  if (error && !info) {
    return <main className="min-h-screen bg-slate-950 text-slate-100 p-6 flex items-center justify-center"><div className="max-w-lg rounded-2xl border border-rose-500/20 bg-slate-900 p-5 text-sm">{error}</div></main>;
  }
  if (!info) return <main className="min-h-screen bg-slate-950 text-slate-500 p-6 flex items-center justify-center">Loading Orb Frenzy...</main>;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-5 flex items-center justify-center">
      <section className="w-full max-w-xl rounded-3xl border border-fuchsia-500/25 bg-gradient-to-br from-slate-900 via-fuchsia-950/15 to-slate-900 p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20">
            <Zap className="w-7 h-7 text-fuchsia-300" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-300">Orb Frenzy</p>
            <h1 className="text-2xl font-black">1/{info.formatRarity(rarity)}</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-300">
          {info.ownerUsername} found this Orb and used their daily Frenzy. Click the post to unleash
          a server-generated batch based on that exact rarity.
        </p>

        {result ? (
          <div className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <div className="text-sm font-black text-emerald-200">Frenzy claimed!</div>
            <div className="mt-1 text-xs text-slate-300">
              {result.count.toLocaleString()} Orbs rolled · Coins +{result.coins.toLocaleString()} · XP +{result.xp.toLocaleString()}
            </div>
          </div>
        ) : (
          <button
            onClick={() => void claim()}
            disabled={loading || claimed || info.isOwner}
            className="mt-5 w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 px-5 py-4 text-sm font-black text-white hover:from-fuchsia-500 hover:to-purple-500 disabled:bg-slate-800 disabled:text-slate-500"
          >
            {info.isOwner ? 'Your Frenzy' : claimed ? 'Already Claimed Today' : loading ? 'Rolling Frenzy...' : 'Unleash the Frenzy'}
          </button>
        )}

        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

        <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-500">
          <Users className="w-3.5 h-3.5" />
          <span>Each player can claim one other player's Frenzy per day.</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          <Sparkles className="w-3.5 h-3.5" />
          <span>The Frenzy post is created when its owner presses the button.</span>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<FrenzyPost />);
