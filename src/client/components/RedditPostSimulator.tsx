import React, { useState } from 'react';
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
  Users,
  Zap,
} from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
import { formatRarity, getOrbInfo } from '../../shared/game.js';

interface RedditPostSimulatorProps {
  state: PlayerState;
}

/** Local-only approximation of how an Infinity Orbs Frenzy post appears in a Reddit feed. */
export const RedditPostSimulator: React.FC<RedditPostSimulatorProps> = ({ state }) => {
  const [upvoted, setUpvoted] = useState(false);
  const [downvoted, setDownvoted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const rarity = Math.max(2, Number(state.highestRarity) || 2);
  const isInfinity = state.highestRarityIsInfinity === true;
  const orb = getOrbInfo(rarity, isInfinity);
  const username = String(state.username || 'Redditor').replace(/^u\//i, '');
  const score = 184 + (upvoted ? 1 : 0) - (downvoted ? 1 : 0);
  const rarityLabel = '1/' + formatRarity(rarity, isInfinity);

  return (
    <div className="mx-auto max-w-6xl space-y-4 text-slate-900">
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-900 px-4 py-3 text-xs text-cyan-100">
        <strong className="font-black uppercase tracking-wider">GitHub Pages Reddit Simulator</strong>
        <span className="ml-2 text-slate-400">Local preview only. Votes, comments, saves, and the claim button do not contact Reddit or grant rewards.</span>
      </div>

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
            <Bell size={17} />
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
                <span className="rounded-full bg-[#0079d3] px-4 py-2 text-xs font-bold text-white">Join</span>
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

                <h2 className="mt-2 text-base font-bold leading-snug text-slate-900 sm:text-lg">u/{username} got a {rarityLabel} Orb in their Frenzy</h2>
                <div className="mt-2 inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-800" style={{ backgroundColor: orb.color + '22' }}>Frenzy</div>

                <section className="mt-3 overflow-hidden rounded-xl border border-[#34305f] bg-gradient-to-br from-[#0b1020] via-[#171238] to-[#30134f] text-white">
                  <div className="border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-fuchsia-200">
                      <Sparkles size={14} /> Orb Frenzy
                      <span className="ml-auto text-cyan-200">Community event</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-200"><strong>u/{username}</strong> found an extraordinary Orb. Claim the Frenzy to roll a burst of Orbs of your own.</p>
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
                        <Zap size={14} /> Frenzy payout scales with your Multi Roll
                      </div>
                    </div>
                  </div>

                  <div className="mx-4 mb-4 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/5 p-3 text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fuchsia-200">Community claim</div>
                    <button type="button" onClick={() => setClaimed(value => !value)} className="mt-2 w-full rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg hover:brightness-110">
                      {claimed ? 'Preview claim complete' : 'Claim Frenzy'}
                    </button>
                    <p className="mt-2 text-[10px] text-slate-400">{claimed ? 'This is a local preview state. No rolls or rewards were granted.' : 'In the real post, this opens Infinity Orbs and processes the claim.'}</p>
                  </div>
                </section>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500">
                  <button type="button" onClick={() => setShowComments(value => !value)} className="flex items-center gap-1.5 hover:text-slate-800">
                    <MessageCircle size={16} /> {showComments ? 'Hide comments' : '12 Comments'}
                  </button>
                  <span className="flex items-center gap-1.5"><Share2 size={16} /> Share</span>
                  <button type="button" onClick={() => setSaved(value => !value)} aria-pressed={saved} className={saved ? 'flex items-center gap-1.5 text-[#0079d3]' : 'flex items-center gap-1.5 hover:text-slate-800'}>
                    <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}
                  </button>
                  <span className="ml-auto flex items-center gap-1"><Award size={15} /> Award</span>
                </div>

                {showComments && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    <strong>u/OrbSeeker</strong>
                    <p className="mt-1">That rarity is ridiculous. Good luck with the claims.</p>
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <strong>u/CodexKeeper</strong>
                      <p className="mt-1">Claimed. Time to fill the Codex.</p>
                    </div>
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
              <strong className="text-slate-800">Community rules</strong>
              <ol className="mt-2 list-inside list-decimal space-y-2">
                <li>Keep posts related to Infinity Orbs.</li>
                <li>Share genuine discoveries.</li>
                <li>Be respectful to other players.</li>
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};
