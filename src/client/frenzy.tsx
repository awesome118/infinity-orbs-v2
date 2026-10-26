import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { ArrowRight, Flame, Users, Sparkles, Zap } from 'lucide-react';
import './styles.css';
import './post-revamp.css';
import { formatNumber, formatRarity, getOrbInfo, FRENZY_POST_LIFETIME_MS, FRENZY_CLAIM_COOLDOWN_MS, MAX_ORB_RARITY } from '../shared/game.js';
import { recordPostImpression } from './impressions.js';

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. For claims or comments, refresh to verify the result before trying again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

interface FrenzyInfo {
  rarity: number;
  isInfinity?: boolean;
  ownerUsername: string;
  createdAt: number;
  expiresAt: number;
  expired: boolean;
  consumed?: boolean;
  claimedToday: boolean;
  claimCooldownRemainingMs: number;
  claimCooldownEndsAt: number;
  isOwner: boolean;
  canClaim: boolean;
  selfClaimTest: boolean;
  postId: string;
  inGame?: boolean;
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

function AnimatedRarity({ rarity, color, isInfinity = false }: { rarity: number; color: string; isInfinity?: boolean }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (isInfinity) {
      setDisplay(rarity);
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const handleMotionPreference = (event: MediaQueryListEvent) => {
      if (event.matches) {
        window.cancelAnimationFrame(frame);
        setDisplay(rarity);
      }
    };
    reducedMotion.addEventListener('change', handleMotionPreference);
    if (reducedMotion.matches) {
      setDisplay(rarity);
      return () => reducedMotion.removeEventListener('change', handleMotionPreference);
    }

    const started = performance.now();
    const duration = 1200;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = progress >= 1 ? rarity : Math.floor(rarity * eased);
      setDisplay(value);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    setDisplay(0);
    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      reducedMotion.removeEventListener('change', handleMotionPreference);
    };
  }, [rarity, isInfinity]);

  const rarityTextLength = formatRarity(rarity, isInfinity).length;
  const rarityFontVw = Math.min(8, 80 / Math.max(1, rarityTextLength));

  return (
    <div className="io-frenzy-rarity-lockup" style={{ color }}>
      <span className="io-frenzy-rarity-prefix">1 /</span>
      <span
        key={rarity}
        className="io-frenzy-rarity-number"
        aria-label={'1/' + formatRarity(rarity, isInfinity)}
        style={{ textShadow: '0 0 34px ' + color + '55', fontSize: 'clamp(16px, ' + rarityFontVw + 'vw, 82px)' }}
      >
        {formatRarity(display, isInfinity)}
      </span>
    </div>
  );
}

function FrenzyPost() {
  const [info, setInfo] = useState<FrenzyInfo | null>(null);
  const [playedBefore, setPlayedBefore] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const loadInFlightRef = useRef(false);
  const impressionRecordedRef = useRef(false);
  const [openedGame, setOpenedGame] = useState(false);
  const [inlineClaimedRarity, setInlineClaimedRarity] = useState<number | null>(null);
  const [inlineClaimedCount, setInlineClaimedCount] = useState(0);
  const [inlineClaimedIsInfinity, setInlineClaimedIsInfinity] = useState(false);
  const [inlineClaimedAt, setInlineClaimedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    // Loading the post state is read-only. A retry must never arm or claim it,
    // and repeated clicks/effect calls must not race one another.
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoadingInfo(true);
    setError(null);
    try {
      const res = await fetchWithTimeout('/api/frenzy/info');
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load Frenzy.');
      const data = await res.json() as FrenzyInfo;
      setInfo(data);
      setClaimed(Boolean(data.claimedToday));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load Frenzy.');
    } finally {
      loadInFlightRef.current = false;
      setLoadingInfo(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    let active = true;
    void fetchWithTimeout('/api/player/experience')
      .then(response => response.ok ? response.json() as Promise<{ playedBefore?: unknown }> : null)
      .then(result => { if (active && typeof result?.playedBefore === 'boolean') setPlayedBefore(result.playedBefore); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Viewing a Frenzy post is an impression, not a live-player heartbeat.
  useEffect(() => {
    if (impressionRecordedRef.current) return;
    impressionRecordedRef.current = true;
    void recordPostImpression('frenzy', context.postId);
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const syncTimer = () => {
      setNow(Date.now());
      if (document.visibilityState === 'hidden') {
        if (timer !== null) window.clearInterval(timer);
        timer = null;
      } else if (timer === null) {
        timer = window.setInterval(() => setNow(Date.now()), 1000);
      }
    };
    syncTimer();
    document.addEventListener('visibilitychange', syncTimer);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncTimer);
    };
  }, []);

  const claim = async () => {
    if (!info?.canClaim || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Claim on the Frenzy post itself. Do not rely on opening another entrypoint
      // to finish the reward; the server commits the full volley before success is shown.
      const res = await fetchWithTimeout('/api/frenzy/claim', { method: 'POST' });
      const data = await res.json() as {
        error?: unknown;
        orb?: { rarity?: unknown; isInfinity?: unknown };
        frenzyCount?: unknown;
      };
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not claim Frenzy.');
      const resultRarity = Number(data.orb?.rarity);
      const validResult = Number.isInteger(resultRarity) && resultRarity >= 2 && resultRarity <= MAX_ORB_RARITY;
      const claimedCount = Number(data.frenzyCount);
      setInlineClaimedRarity(validResult ? resultRarity : info.rarity);
      setInlineClaimedIsInfinity(validResult ? data.orb?.isInfinity === true : info.isInfinity === true);
      setInlineClaimedCount(Number.isSafeInteger(claimedCount) && claimedCount > 0 ? claimedCount : 1);
      setInlineClaimedAt(Date.now());
      setError(null);
      setClaimed(true);
      await load();
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
            <button
              type="button"
              className="io-public-button io-public-button-primary"
              onClick={() => void load()}
              disabled={loadingInfo}
            >
              {loadingInfo ? 'Retrying…' : 'Retry'}
            </button>
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

  const orb = getOrbInfo(info.rarity, info.isInfinity);
  const expiresAt = info.expiresAt || info.createdAt + FRENZY_POST_LIFETIME_MS;
  const expiresIn = Math.max(0, expiresAt - now);
  const totalExpirySeconds = Math.ceil(expiresIn / 1000);
  const expiryHours = Math.floor(totalExpirySeconds / 3600);
  const expiryMinutes = Math.floor((totalExpirySeconds % 3600) / 60);
  const expirySeconds = totalExpirySeconds % 60;
  const expiryLabel = expiresIn <= 0 ? 'EXPIRED' : expiryHours + ':' + String(expiryMinutes).padStart(2, '0') + ':' + String(expirySeconds).padStart(2, '0');
  const effectiveClaimCooldownEndsAt = Math.max(
    Number(info.claimCooldownEndsAt) || 0,
    inlineClaimedAt > 0 ? inlineClaimedAt + FRENZY_CLAIM_COOLDOWN_MS : 0,
  );
  const claimCooldownIn = Math.max(0, effectiveClaimCooldownEndsAt - now);
  const claimTotalSeconds = Math.ceil(claimCooldownIn / 1000);
  const claimHours = Math.floor(claimTotalSeconds / 3600);
  const claimMinutes = Math.floor((claimTotalSeconds % 3600) / 60);
  const claimSeconds = claimTotalSeconds % 60;
  const claimCooldownLabel = claimCooldownIn > 0 ? claimHours + ':' + String(claimMinutes).padStart(2, '0') + ':' + String(claimSeconds).padStart(2, '0') : '';
  const canClaim = info.canClaim && !openedGame && expiresIn > 0 && claimCooldownIn <= 0;

  if (inlineClaimedRarity !== null) {
    const rewardOrb = getOrbInfo(inlineClaimedRarity, inlineClaimedIsInfinity);
    const cooldownStatus = claimCooldownIn > 0 ? claimCooldownLabel : 'Claimed today';
    return (
      <main className="io-public io-frenzy-success-shell">
        <div className="io-public-grid" aria-hidden="true" />
        <div
          className="io-public-glow io-frenzy-success-glow"
          aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse at center, ' + rewardOrb.color + '30, transparent 68%)' }}
        />
        <div className="io-public-frame">
          <PublicBrand />
          <section className="io-public-card io-frenzy-card io-frenzy-success-card io-post-reveal">
            <div className="io-public-eyebrow io-public-eyebrow-success">
              <Sparkles className="w-3.5 h-3.5" />
              FRENZY REWARD CONFIRMED
            </div>
            <h1 className="io-frenzy-success-title">FRENZY CLAIMED</h1>
            <p className="io-frenzy-success-copy">
              {formatNumber(inlineClaimedCount)} Orbs were rolled and saved to your account.
              {playedBefore === true ? ' Carry the momentum into your next run.' : ' Keep rolling to start building your Codex.'}
            </p>

            <div
              className="io-frenzy-success-stage"
              style={{
                background: 'radial-gradient(ellipse at center, ' + rewardOrb.color + '30, rgba(5, 11, 19, .96) 70%)',
                borderColor: rewardOrb.color + '55',
              }}
              aria-label={rewardOrb.name + ' reward reveal'}
            >
              <div className="io-frenzy-success-stage-grid" aria-hidden="true" />
              <span className="io-frenzy-success-orbit io-frenzy-success-orbit-a" aria-hidden="true" />
              <span className="io-frenzy-success-orbit io-frenzy-success-orbit-b" aria-hidden="true" />
              <span className="io-frenzy-success-orbit io-frenzy-success-orbit-c" aria-hidden="true" />
              <span className="io-frenzy-success-particle io-frenzy-success-particle-a" aria-hidden="true" />
              <span className="io-frenzy-success-particle io-frenzy-success-particle-b" aria-hidden="true" />
              <span className="io-frenzy-success-particle io-frenzy-success-particle-c" aria-hidden="true" />
              <span className="io-frenzy-success-particle io-frenzy-success-particle-d" aria-hidden="true" />
              <div
                className="io-frenzy-success-orb"
                style={{
                  background: rewardOrb.bgGradient,
                  borderColor: rewardOrb.color + 'aa',
                  boxShadow: '0 0 38px ' + rewardOrb.color + '77, 0 0 90px ' + rewardOrb.color + '25, inset -12px -14px 22px rgba(0,0,0,.3), inset 10px 10px 18px rgba(255,255,255,.22)',
                }}
              >
                <div className="io-frenzy-orb-highlight" />
                <div className="io-frenzy-orb-core" style={{ background: rewardOrb.color }} />
                <span className="io-frenzy-success-orb-tier">{rewardOrb.tier}</span>
              </div>
            </div>
            <div className="io-frenzy-success-rarity">
              <AnimatedRarity rarity={inlineClaimedRarity} color={rewardOrb.color} isInfinity={inlineClaimedIsInfinity} />
            </div>
            <div className="io-frenzy-meta io-frenzy-success-meta" style={{ borderColor: rewardOrb.color + '44' }}>
              <span>{rewardOrb.tier}</span>
              <span>{rewardOrb.name}</span>
            </div>

            <div className="io-frenzy-success-stats">
              <div>
                <span>ORBS ROLLED</span>
                <strong>{formatNumber(inlineClaimedCount)}</strong>
              </div>
              <div>
                <span>PERSONAL COOLDOWN</span>
                <strong>{cooldownStatus}</strong>
              </div>
              <div>
                <span>POST EXPIRES IN</span>
                <strong>{expiryLabel}</strong>
              </div>
            </div>

            <div className="io-frenzy-cooldown-panel is-active" role="status">
              <div className="io-frenzy-cooldown-icon"><Zap className="w-4 h-4" /></div>
              <div className="io-frenzy-cooldown-copy">
                <strong>{claimCooldownIn > 0 ? 'Your next Frenzy claim' : 'You have used today’s Frenzy claim'}</strong>
                <span>{claimCooldownIn > 0 ? 'Available again in ' + claimCooldownLabel : 'The claim cooldown is still personal to you.'}</span>
              </div>
              <span className="io-frenzy-cooldown-value">{cooldownStatus}</span>
            </div>

            <div className="io-post-conversion io-frenzy-success-conversion">
              <div className="io-cta-caption"><span aria-hidden="true" /> {playedBefore === true ? 'YOUR NEXT RECORD IS ONE TAP AWAY' : 'KEEP THE FRENZY GOING'}</div>
              <button
                type="button"
                className="io-public-button io-public-button-primary io-frenzy-success-button io-post-cta"
                onClick={(event) => {
                  try {
                    void Promise.resolve(requestExpandedMode(event.nativeEvent, 'game')).catch(error => setError(error instanceof Error ? error.message : 'Could not open the full game.'));
                  } catch (error) {
                    setError(error instanceof Error ? error.message : 'Could not open the full game.');
                  }
                }}
              >
                <ArrowRight className="w-4 h-4" />
                {playedBefore === true ? 'Continue Playing' : 'Play Infinity Orbs'}
              </button>
              <a href={`https://www.reddit.com/comments/${info.postId.replace(/^t3_/, '')}/`} target="_blank" rel="noreferrer" className="io-public-note-link">Upvote the Frenzy post</a>
            </div>
            {error && <p className="io-public-inline-error" role="alert">{error}</p>}
          </section>
        </div>
      </main>
    );
  }



  return (
    <main className="io-public">
      <div className="io-public-grid" aria-hidden="true" />
      <div
        className="io-public-glow"
        aria-hidden="true"
        style={{ background: 'radial-gradient(ellipse at center, ' + orb.color + '18, transparent 68%)' }}
      />

      <div className="io-public-frame">
        <PublicBrand />

        <section className="io-public-card io-frenzy-card io-post-reveal">
          <div className="io-public-eyebrow io-public-eyebrow-frenzy">
            <Flame className="w-3.5 h-3.5" />
            Posted Frenzy
          </div>

          <div className="io-frenzy-copy">
            <p className="io-frenzy-lede">
              <strong>u/{info.ownerUsername}</strong> got a
            </p>

            <AnimatedRarity rarity={info.rarity} color={orb.color} isInfinity={info.isInfinity} />

            <div
              className="io-frenzy-orb-visual"
              aria-label={orb.name + ' orb'}
              style={{
                background: orb.bgGradient,
                borderColor: orb.color + '88',
                boxShadow: '0 0 28px ' + orb.color + '44, inset -12px -14px 22px rgba(0,0,0,.28), inset 10px 10px 18px rgba(255,255,255,.2)',
              }}
            >
              <span className="io-frenzy-orbit-arc io-frenzy-orbit-arc-a" aria-hidden="true" />
              <span className="io-frenzy-orbit-arc io-frenzy-orbit-arc-b" aria-hidden="true" />
              <div className="io-frenzy-orb-highlight" />
              <div className="io-frenzy-orb-core" style={{ background: orb.color }} />
            </div>

            <p className="io-frenzy-orb-label">orb in their Frenzy</p>
            <p className="io-frenzy-instruction">
              {info.consumed
                ? 'You have already claimed this Frenzy.'
                : info.expired
                  ? 'This Frenzy has expired.'
                  : 'Others can claim too—once every 23 hours per player. Upvote to thank the owner.'}
            </p>
            {canClaim && (
              <p className="io-frenzy-instruction">
                {playedBefore === true ? 'Claim it for a burst of Orbs, then push for your next best find.' : playedBefore === false ? 'Claim this reward to collect your first Orbs, then start building your Codex.' : 'Claim it to collect Orbs; Multi Roll scales the Frenzy size.'}
              </p>
            )}
          </div>

          <div className="io-frenzy-timer-grid">
            <div className="io-frenzy-expiry-timer" style={{ borderColor: orb.color + '33' }}>
              <div className="io-frenzy-timer-label">Frenzy expires in</div>
              <div className="io-frenzy-timer-value" style={{ color: expiresIn > 0 ? orb.color : '#94a3b8' }}>{expiryLabel}</div>
            </div>
            {(info.claimedToday || claimCooldownIn > 0) && (
              <div className="io-frenzy-cooldown-mini" role="status">
                <div className="io-frenzy-timer-label"><Zap className="w-3 h-3" /> Your claim cooldown</div>
                <div className="io-frenzy-timer-value">{claimCooldownIn > 0 ? claimCooldownLabel : 'Claimed today'}</div>
                <p>You can still play while this timer runs.</p>
              </div>
            )}
          </div>

          <div className="io-frenzy-meta" style={{ borderColor: orb.color + '22' }}>
            <span>{orb.tier}</span>
            <span>{orb.name}</span>
          </div>

          {!openedGame && (
            <div className="io-cta-caption">
              <span aria-hidden="true" />
              {canClaim ? playedBefore === true ? 'CLAIM THE FRENZY · CHASE YOUR NEXT RECORD' : playedBefore === false ? 'CLAIM YOUR FIRST FRENZY · GET STARTED' : 'CLAIM THE FRENZY · PLAY NOW' : playedBefore === true ? 'YOUR CODEX IS WAITING' : 'START YOUR OWN CODEX'}
            </div>
          )}
          {openedGame ? (
            <div className="io-public-result io-frenzy-opened">
              <div className="io-public-eyebrow io-public-eyebrow-success">Opening game</div>
              <strong>{playedBefore === true ? 'Your next run is loading.' : 'Your first reward is loading.'}</strong>
              <p>{playedBefore === true ? 'Pick up your Codex and chase a new record.' : 'The full claim result appears in the game.'}</p>
            </div>
          ) : canClaim ? (
            <button
              onClick={() => void claim()}
              disabled={loading}
              className="io-public-button io-public-button-primary io-frenzy-button io-post-cta"
              style={{
                borderColor: orb.color + '88',
                boxShadow: '0 10px 34px ' + orb.color + '35',
              }}
            >
              <ArrowRight className="w-4 h-4" />
              {loading
                ? 'Claiming Frenzy…'
                : info.selfClaimTest
                  ? 'Claim Your Frenzy · Test'
                  : playedBefore === true ? 'Claim Frenzy · Continue run' : playedBefore === false ? 'Claim your first Frenzy' : 'Claim Frenzy · Open Game'}
            </button>
          ) : (
            <button
              type="button"
              className="io-public-button io-public-button-primary io-frenzy-button io-post-cta"
              onClick={(event) => {
                try {
                  void Promise.resolve(requestExpandedMode(event.nativeEvent, 'game')).catch(error => {
                    setError(error instanceof Error ? error.message : 'Could not open Infinity Orbs.');
                  });
                } catch (error) {
                  setError(error instanceof Error ? error.message : 'Could not open Infinity Orbs.');
                }
              }}
            >
              <ArrowRight className="w-4 h-4" />
              {playedBefore === true ? 'Continue your run' : playedBefore === false ? 'Play Infinity Orbs' : 'Open Infinity Orbs'}
            </button>
          )}

          {error && <p className="io-public-inline-error" role="alert">{error}</p>}

          <div className="io-public-note">
            <div><Users className="w-3.5 h-3.5" /> One claim every 23 hours per player. Multi Roll scales your reward.</div>
          </div>
        </section>
      </div>


    </main>
  );
}

createRoot(document.getElementById('root')!).render(<FrenzyPost />);
