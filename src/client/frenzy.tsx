import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Flame, Users, Zap } from 'lucide-react';
import './styles.css';
import { formatNumber, formatRarity, getOrbInfo } from '../shared/game.js';

interface FrenzyInfo {
  rarity: number;
  ownerUsername: string;
  createdAt: number;
  claimedToday: boolean;
  isOwner: boolean;
  postId: string;
}

function PublicBrand() {
  return (
    <div className="io-public-brand">
      <div className="io-public-brand-mark" aria-hidden="true"><span>∞</span></div>
      <div>
        <div className="io-public-brand-title">Infinity Orbs</div>
        <div className="io-public-brand-subtitle">ROLL · COLLECT · GO FURTHER</div>
      </div>
    </div>
  );
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load Frenzy.');
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not claim Frenzy.');
    } finally {
      setLoading(false);
    }
  };

  if (error && !info) {
    return (
      <main className="io-public">
        <div className="io-public-grid" aria-hidden="true" />
        <div className="io-public-frame io-public-error">
          <PublicBrand />
          <section className="io-public-card">
            <div className="io-public-eyebrow io-public-eyebrow-error">Frenzy error</div>
            <h1>Could not load Orb Frenzy</h1>
            <p>{error}</p>
          </section>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="io-public">
        <div className="io-public-grid" aria-hidden="true" />
        <div className="io-public-frame">
          <PublicBrand />
          <section className="io-public-card io-public-loading">
            <div className="io-public-loader" />
            <strong>Loading Orb Frenzy</strong>
            <span>Checking the current post state…</span>
          </section>
        </div>
      </main>
    );
  }

  const orb = getOrbInfo(info.rarity);
  const canClaim = !info.isOwner && !claimed && !result;

  return (
    <main className="io-public">
      <div className="io-public-grid" aria-hidden="true" />
      <div className="io-public-glow" aria-hidden="true" />
      <div className="io-public-frame">
        <PublicBrand />

        <section className="io-public-card io-frenzy-card">
          <div className="io-public-eyebrow io-public-eyebrow-frenzy">
            <Flame className="w-3.5 h-3.5" />
            Community event
          </div>

          <div className="io-frenzy-heading">
            <div>
              <h1>Orb Frenzy</h1>
              <p><span>u/{info.ownerUsername}</span> opened a daily Frenzy from a <strong>1/{formatRarity(info.rarity)}</strong> discovery.</p>
            </div>
            <div className="io-public-tier" style={{ color: orb.color, borderColor: \`\${orb.color}55\`, backgroundColor: \`\${orb.color}10\` }}>
              {orb.tier}
            </div>
          </div>

          <div className="io-frenzy-hero">
            <div
              className="io-public-orb io-frenzy-orb"
              style={{
                background: orb.bgGradient,
                borderColor: \`\${orb.color}66\`,
                boxShadow: \`0 0 42px \${orb.color}24, inset 0 1px rgba(255,255,255,.32)\`,
              }}
            >
              <span className="io-public-orb-ring" />
              <span className="io-public-orb-tier">{orb.tier}</span>
              <strong>1/{formatRarity(info.rarity)}</strong>
              <small>{orb.name}</small>
            </div>

            <div className="io-frenzy-stats">
              <div>
                <span>STARTED BY</span>
                <strong>u/{info.ownerUsername}</strong>
              </div>
              <div>
                <span>BASE DISCOVERY</span>
                <strong>1/{formatRarity(info.rarity)}</strong>
              </div>
              <div>
                <span>YOUR DAILY CLAIM</span>
                <strong>{claimed ? 'USED' : 'AVAILABLE'}</strong>
              </div>
            </div>
          </div>

          {result ? (
            <div className="io-public-result">
              <div className="io-public-eyebrow io-public-eyebrow-success">Frenzy claimed</div>
              <strong>{formatNumber(result.count)} Orbs rolled</strong>
              <p>+{formatNumber(result.coins)} Coins · +{formatNumber(result.xp)} XP</p>
            </div>
          ) : (
            <button
              onClick={() => void claim()}
              disabled={!canClaim || loading}
              className="io-public-button io-public-button-primary io-frenzy-button"
            >
              <Zap className="w-4 h-4" />
              {info.isOwner ? 'Your Frenzy' : claimed ? 'Already Claimed Today' : loading ? 'Unleashing…' : 'Unleash the Frenzy'}
              {canClaim && <ArrowRight className="w-4 h-4" />}
            </button>
          )}

          {error && <p className="io-public-inline-error">{error}</p>}

          <div className="io-public-note">
            <div><Users className="w-3.5 h-3.5" /> One Frenzy claim per player, per day.</div>
            <div><Flame className="w-3.5 h-3.5" /> The batch is generated by the server from the displayed discovery.</div>
          </div>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<FrenzyPost />);
