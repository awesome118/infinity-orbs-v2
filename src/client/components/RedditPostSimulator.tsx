import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Award,
  Bookmark,
  ChevronDown,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { PlayerState, RollResponse } from '../../shared/game.js';
import { formatNumber, formatRarity, getOrbInfo } from '../../shared/game.js';

interface FrenzySimulatorInfo {
  rarity: number;
  isInfinity: boolean;
  ownerUsername: string;
  createdAt: number;
  expiresAt: number;
  expired: boolean;
  consumed: boolean;
  claimedToday: boolean;
  claimsRemainingToday: number;
  claimLimitPerDay: number;
  isOwner: boolean;
  canClaim: boolean;
  selfClaimTest: boolean;
  postId: string;
  claimCount: number;
  recentClaimers: Array<{ username: string; claimedAt: number }>;
  baseOrbCount: number;
  multiRolls: number;
  rewardOrbCount: number;
  frenzyVolleyBonus: boolean;
  inGame?: boolean;
}

interface CreatedFrenzyPost {
  postId: string;
  title: string;
  body: string;
  rarity: number;
  isInfinity: boolean;
  createdAt: number;
  expiresAt: number;
}

interface RedditPostSimulatorProps {
  state: PlayerState;
  onClaimed: (response: RollResponse) => void;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { error?: unknown };
  return typeof payload.error === 'string' ? payload.error : fallback;
}

/**
 * Pages-only Reddit feed preview. It creates a locally stored Frenzy post record
 * and calls the same server-side info and claim handlers as a real Reddit post.
 */
export const RedditPostSimulator: React.FC<RedditPostSimulatorProps> = ({ state, onClaimed }) => {
  const [rarityInput, setRarityInput] = useState(() => String(Math.max(2, Number(state.highestRarity) || 2)));
  const [info, setInfo] = useState<FrenzySimulatorInfo | null>(null);
  const [postBody, setPostBody] = useState('');
  const [loadingPost, setLoadingPost] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<RollResponse | null>(null);
  const [upvoted, setUpvoted] = useState(false);
  const [downvoted, setDownvoted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!info) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [info?.postId]);

  const refreshInfo = async (postId: string) => {
    const response = await fetch('/api/frenzy/simulator/info?postId=' + encodeURIComponent(postId), {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(await readApiError(response, 'Could not load the simulated Frenzy post.'));
    const data = await response.json() as FrenzySimulatorInfo;
    setInfo(data);
    return data;
  };

  const createAndViewPost = async () => {
    const selectedRarity = Number(rarityInput.trim());
    if (!Number.isFinite(selectedRarity) || !Number.isInteger(selectedRarity) || selectedRarity < 2) {
      setError('Enter a whole-number rarity of at least 2. Scientific notation is accepted.');
      return;
    }
    setLoadingPost(true);
    setError(null);
    setClaimResult(null);
    setUpvoted(false);
    setDownvoted(false);
    setSaved(false);
    try {
      const response = await fetch('/api/frenzy/simulator/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rarity: selectedRarity }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'Could not create a local Frenzy post.'));
      const created = await response.json() as CreatedFrenzyPost;
      setPostBody(created.body);
      await refreshInfo(created.postId);
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a local Frenzy post.');
    } finally {
      setLoadingPost(false);
    }
  };

  const claimFrenzy = async () => {
    if (!info?.canClaim || claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const attemptId = 'pages-simulator-' + Date.now().toString(36) + '-' +
        Math.floor(Math.random() * 0x7fffffff).toString(36);
      const response = await fetch('/api/frenzy/simulator/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: info.postId, attemptId }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'The Frenzy claim failed.'));
      const result = await response.json() as RollResponse;
      setClaimResult(result);
      onClaimed(result);
      await refreshInfo(info.postId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Frenzy claim failed.');
    } finally {
      setClaiming(false);
    }
  };

  const rarity = info?.rarity ?? Math.max(2, Number(state.highestRarity) || 2);
  const isInfinity = info?.isInfinity ?? state.highestRarityIsInfinity === true;
  const orb = getOrbInfo(rarity, isInfinity);
  const username = String(info?.ownerUsername ?? state.username ?? 'Redditor').replace(/^u\//i, '');
  const score = 184 + (upvoted ? 1 : 0) - (downvoted ? 1 : 0);
  const rarityLabel = '1/' + formatRarity(rarity, isInfinity);
  const expiryMs = info ? Math.max(0, info.expiresAt - now) : 0;
  const expiryMinutes = Math.floor(expiryMs / 60_000);
  const expirySeconds = Math.floor((expiryMs % 60_000) / 1000);
  const expiryLabel = info
    ? info.expired || expiryMs <= 0
      ? 'EXPIRED'
      : Math.floor(expiryMinutes / 60) + ':' + String(expiryMinutes % 60).padStart(2, '0') + ':' + String(expirySeconds).padStart(2, '0')
    : '24:00:00';

  return (
    <div className="mx-auto max-w-6xl space-y-4 text-slate-900">
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-900 px-4 py-3 text-xs text-cyan-100">
        <strong className="font-black uppercase tracking-wider">GitHub Pages Reddit Simulator</strong>
        <span className="ml-2 text-slate-400">Creates a local post record and runs the real Frenzy preview, payout, claim-limit, and reward logic. Nothing is submitted to Reddit.</span>
      </div>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-white">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Orb rarity to publish</span>
            <input
              type="text"
              inputMode="decimal"
              value={rarityInput}
              onChange={event => setRarityInput(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void createAndViewPost(); }}
              placeholder="e.g. 1000000 or 1e100"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-mono text-white outline-none focus:border-cyan-400"
            />
          </label>
          <button
            type="button"
            onClick={() => void createAndViewPost()}
            disabled={loadingPost}
            className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-black text-white hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingPost ? 'Creating post…' : info ? 'Create new post' : 'Create and view post'}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          The rarity is stored on the local mock post and controls the actual Frenzy payout calculation. Creating a preview does not spend a roll or trigger the normal 23-hour post cooldown.
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
      </section>

      {!info ? (
        <div className="rounded-xl border border-slate-300 bg-white p-8 text-center">
          <div className="text-lg font-black text-slate-800">No preview post yet</div>
          <p className="mt-1 text-sm text-slate-500">Choose a rarity above and create a local Reddit post.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-[#dae0e6] shadow-2xl">
          <header className="flex items-center gap-4 border-b border-slate-300 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-xl font-black tracking-tight text-[#ff4500]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ff4500] text-white">r</span>
              reddit
            </div>
            <div className="hidden flex-1 sm:block">
              <div className="mx-auto max-w-xl rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-500">Search Reddit</div>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-600">
              <span>Log In</span>
              <span className="rounded-full bg-[#ff4500] px-3 py-2 text-white">Sign Up</span>
            </div>
          </header>

          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-3">
              <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
                <div className="h-24 bg-gradient-to-r from-indigo-950 via-purple-800 to-fuchsia-700" />
                <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4">
                  <div className="flex items-end gap-3">
                    <div className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-slate-950 text-3xl font-black text-cyan-300 shadow">∞</div>
                    <div>
                      <h1 className="text-xl font-bold text-slate-900">r/InfinityOrbs</h1>
                      <p className="text-xs text-slate-500">Roll. Discover. Transcend.</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#0079d3] px-4 py-2 text-xs font-bold text-white">Joined</span>
                </div>
              </section>

              <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-500">
                <span>Posts</span>
                <span className="flex items-center gap-1">Hot <ChevronDown size={14} /></span>
              </div>

              <article className="flex overflow-hidden rounded-xl border border-slate-300 bg-white hover:border-slate-400">
                <div className="flex w-11 shrink-0 flex-col items-center gap-1 bg-slate-50 py-3">
                  <button type="button" aria-label="Upvote post" aria-pressed={upvoted} onClick={() => { setUpvoted(value => !value); setDownvoted(false); }} className={upvoted ? 'text-[#ff4500]' : 'text-slate-400 hover:text-[#ff4500]'}>
                    <ArrowUp size={21} fill={upvoted ? 'currentColor' : 'none'} />
                  </button>
                  <strong className="text-xs text-slate-700">{score}</strong>
                  <button type="button" aria-label="Downvote post" aria-pressed={downvoted} onClick={() => { setDownvoted(value => !value); setUpvoted(false); }} className={downvoted ? 'text-[#7193ff]' : 'text-slate-400 hover:text-[#7193ff]'}>
                    <ArrowDown size={21} fill={downvoted ? 'currentColor' : 'none'} />
                  </button>
                </div>

                <div className="min-w-0 flex-1 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="font-bold text-slate-800">r/InfinityOrbs</span>
                    <span>·</span>
                    <span>Posted by u/{username}</span>
                    <span>·</span>
                    <span>just now</span>
                    <span aria-hidden="true" className="ml-auto text-slate-400"><MoreHorizontal size={18} /></span>
                  </div>

                  <h2 className="mt-2 text-base font-bold leading-snug text-slate-900 sm:text-lg">
                    u/{username} got a {rarityLabel} Orb in their Frenzy
                  </h2>
                  <div className="mt-2 inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-800" style={{ backgroundColor: orb.color + '22' }}>Frenzy</div>

                  <section className="mt-3 overflow-hidden rounded-xl border border-[#34305f] bg-gradient-to-br from-[#0b1020] via-[#171238] to-[#30134f] text-white">
                    <div className="border-b border-white/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-fuchsia-200">
                        <Sparkles size={14} /> Orb Frenzy
                        <span className="ml-auto text-cyan-200">Community event</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-200">{postBody}</p>
                    </div>

                    <div className="flex flex-col items-center gap-3 p-5 sm:flex-row sm:justify-center sm:gap-6">
                      <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: orb.color, background: orb.bgGradient, boxShadow: '0 0 36px ' + orb.color + '55' }}>
                        <div className="h-16 w-16 rounded-full opacity-90" style={{ background: orb.color, boxShadow: 'inset -8px -8px 18px #0005, inset 7px 7px 14px #fff5' }} />
                        <div className="absolute inset-3 rounded-full border border-white/20" />
                      </div>
                      <div className="text-center sm:text-left">
                        <div className="text-[10px] font-black uppercase tracking-[.2em] text-slate-400">Featured discovery</div>
                        <div className="mt-1 text-2xl font-black" style={{ color: orb.color }}>{rarityLabel}</div>
                        <div className="text-xs font-bold text-slate-300">{orb.tier} · {orb.name}</div>
                        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100">
                          <Zap size={14} /> Actual Frenzy payout: {formatNumber(info.rewardOrbCount)} Orbs
                        </div>
                      </div>
                    </div>

                    <div className="mx-4 mb-4 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/5 p-3 text-center">
                      <div className="text-[10px] font-black uppercase tracking-widest text-fuchsia-200">Community claim</div>
                      <button
                        type="button"
                        onClick={() => void claimFrenzy()}
                        disabled={!info.canClaim || claiming}
                        className="mt-2 w-full rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {claiming ? 'Claiming Frenzy…' : info.consumed ? 'Already claimed' : info.expired ? 'Frenzy expired' : info.canClaim ? 'Claim Frenzy' : 'No claims remaining today'}
                      </button>
                      <p className="mt-2 text-[10px] text-slate-400">
                        {info.consumed
                          ? 'This player has already claimed this post.'
                          : info.expired
                            ? 'This post is past its 24-hour lifetime.'
                            : info.canClaim
                              ? 'This runs the real server-side Frenzy claim and reward path against your Pages test save.'
                              : 'The current player is not eligible to claim this post.'}
                      </p>
                    </div>
                  </section>

                  {claimResult && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <strong>Claim saved.</strong> {formatNumber(claimResult.frenzyCount ?? 0)} Orbs rolled. The results were applied to your game save.
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500">
                    <button type="button" onClick={() => setShowComments(value => !value)} className="flex items-center gap-1.5 hover:text-slate-800">
                      <MessageCircle size={16} /> {showComments ? 'Hide comments' : `${info.claimCount} Claims`}
                    </button>
                    <span className="flex items-center gap-1.5"><Share2 size={16} /> Share</span>
                    <button type="button" onClick={() => setSaved(value => !value)} aria-pressed={saved} className={saved ? 'flex items-center gap-1.5 text-[#0079d3]' : 'flex items-center gap-1.5 hover:text-slate-800'}>
                      <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}
                    </button>
                    <span className="ml-auto flex items-center gap-1"><Award size={15} /> Award</span>
                  </div>

                  {showComments && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                      <strong>Recent claimers</strong>
                      {info.recentClaimers.length ? info.recentClaimers.map(player => (
                        <div key={player.username + player.claimedAt} className="mt-2 border-t border-slate-200 pt-2">
                          <strong>u/{player.username}</strong>
                          <span className="ml-2 text-slate-400">{new Date(player.claimedAt).toLocaleString()}</span>
                        </div>
                      )) : <p className="mt-2">No claims yet.</p>}
                    </div>
                  )}
                </div>
              </article>
            </div>

            <aside className="hidden space-y-3 lg:block">
              <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
                <div className="bg-[#0079d3] px-4 py-3 text-xs font-bold text-white">About Community</div>
                <div className="p-4 text-sm text-slate-700">
                  <h3 className="font-bold">r/InfinityOrbs</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">A place to share discoveries, compare records, and roll toward the impossible.</p>
                  <div className="my-3 flex justify-between border-y border-slate-200 py-3 text-xs"><span>Members</span><strong>8.4k</strong><span>Online</span><strong>126</strong></div>
                  <span className="block w-full rounded-full bg-[#0079d3] py-2 text-center text-xs font-bold text-white">Create Post</span>
                </div>
              </section>
              <section className="rounded-xl border border-slate-300 bg-white p-4 text-xs text-slate-600">
                <strong className="text-slate-800">Post state</strong>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between gap-2"><span>Frenzy claims</span><strong>{info.claimCount}</strong></div>
                  <div className="flex justify-between gap-2"><span>Claims left today</span><strong>{info.claimsRemainingToday} / {info.claimLimitPerDay}</strong></div>
                  <div className="flex justify-between gap-2"><span>Multiball</span><strong>×{formatNumber(info.multiRolls)}</strong></div>
                  <div className="flex justify-between gap-2"><span>Base payout</span><strong>{formatNumber(info.baseOrbCount)}</strong></div>
                  <div className="flex justify-between gap-2"><span>Expires in</span><strong>{expiryLabel}</strong></div>
                  <div className="break-all border-t border-slate-200 pt-2 text-[10px] text-slate-400">Post ID: {info.postId}</div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
};
