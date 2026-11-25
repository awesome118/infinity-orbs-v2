import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerState, RollResponse } from '../../shared/game.js';
import { formatRarity } from '../../shared/game.js';
import { RIFT_ASCENT, RIFT_CHALLENGES } from '../../shared/rift-challenges.js';

interface CreatedFrenzyPost {
  postId: string;
  title: string;
  body: string;
  subredditName: string;
  ownerUsername: string;
  runAs: 'USER';
  entry: 'frenzy';
  flairId: string | null;
  rarity: number;
  isInfinity: boolean;
  createdAt: number;
  expiresAt: number;
}

interface CreatedRiftCompletionPost {
  postId: string;
  title: string;
  body: string;
  subredditName: string;
  ownerUsername: string;
  entry: 'rift';
  challengeId: string;
  challengeName: string;
  createdAt: number;
  previewOnly: true;
}

type CreatedPost = CreatedFrenzyPost | CreatedRiftCompletionPost;
type SimulatorMode = 'frenzy' | 'rift';

interface RedditPostSimulatorProps {
  state: PlayerState;
  onClaimed: (response: RollResponse) => void;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { error?: unknown };
  return typeof payload.error === 'string' ? payload.error : fallback;
}

export const RedditPostSimulator: React.FC<RedditPostSimulatorProps> = ({ state, onClaimed }) => {
  const [mode, setMode] = useState<SimulatorMode>('frenzy');
  const [rarityInput, setRarityInput] = useState(() => String(Math.max(2, Number(state.highestRarity) || 2)));
  const [challengeId, setChallengeId] = useState<string>(RIFT_ASCENT.id);
  const [post, setPost] = useState<CreatedPost | null>(null);
  const [loadingPost, setLoadingPost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const previewUrl = useMemo(() => {
    if (!post) return '';
    const entry = post.entry === 'rift' ? 'rift.html' : 'frenzy.html';
    const url = new URL(entry, window.location.href);
    url.searchParams.set('previewPostId', post.postId);
    return url.toString();
  }, [post?.postId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as { type?: unknown; result?: unknown } | null;
      if (message?.type !== 'io-frenzy-preview-claimed' || !message.result || typeof message.result !== 'object') return;
      const result = message.result as RollResponse;
      if (!result.state || !result.orb) return;
      onClaimed(result);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClaimed]);

  const createAndViewPost = async () => {
    setLoadingPost(true);
    setError(null);
    setPost(null);
    try {
      if (mode === 'frenzy') {
        const selectedRarity = Number(rarityInput.trim());
        if (!Number.isFinite(selectedRarity) || !Number.isInteger(selectedRarity) || selectedRarity < 2) {
          throw new Error('Enter a whole-number rarity of at least 2. Scientific notation is accepted.');
        }
        const response = await fetch('/api/frenzy/simulator/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rarity: selectedRarity }),
        });
        if (!response.ok) throw new Error(await readApiError(response, 'Could not generate the Frenzy post preview.'));
        setPost(await response.json() as CreatedFrenzyPost);
      } else {
        const response = await fetch('/api/rift-completion/simulator/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId }),
        });
        if (!response.ok) throw new Error(await readApiError(response, 'Could not generate the Rift completion preview.'));
        setPost(await response.json() as CreatedRiftCompletionPost);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate the Reddit post preview.');
    } finally {
      setLoadingPost(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 text-slate-900">
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-900 px-4 py-3 text-xs text-cyan-100">
        <strong className="font-black uppercase tracking-wider">GitHub Pages Reddit Simulator</strong>
        <p className="mt-1 text-slate-400">
          Preview the same custom-post entry used by the game. Frenzy previews keep their local claim test;
          Rift previews show the first-clear announcement without publishing anything to Reddit or changing your save.
        </p>
      </div>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-white">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setMode('frenzy'); setPost(null); setError(null); }}
            aria-pressed={mode === 'frenzy'}
            className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider ${mode === 'frenzy' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            Orb Frenzy post
          </button>
          <button
            type="button"
            onClick={() => { setMode('rift'); setPost(null); setError(null); }}
            aria-pressed={mode === 'rift'}
            className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider ${mode === 'rift' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            Rift first-clear post
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {mode === 'frenzy' ? (
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
          ) : (
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Challenge to preview</span>
              <select
                value={challengeId}
                onChange={event => setChallengeId(event.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              >
                <option value={RIFT_ASCENT.id}>{RIFT_ASCENT.name}</option>
                {RIFT_CHALLENGES.map(challenge => (
                  <option key={challenge.id} value={challenge.id}>{challenge.name}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => void createAndViewPost()}
            disabled={loadingPost}
            className={`rounded-lg px-5 py-2.5 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60 ${mode === 'rift' ? 'bg-violet-600 hover:bg-violet-500' : 'bg-cyan-600 hover:bg-cyan-500'}`}
          >
            {loadingPost ? 'Generating preview…' : post ? 'Create new preview' : 'Create and view post'}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          {mode === 'rift'
            ? 'Builds a local first-clear record and opens the actual rift custom-post entry. It never submits a Reddit post.'
            : 'Builds the local Frenzy submission payload and opens its actual custom-post entry. Preview claims use the local Frenzy test flow.'}
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
      </section>

      {!post ? (
        <div className="rounded-xl border border-slate-300 bg-white p-8 text-center">
          <div className="text-lg font-black text-slate-800">No post preview yet</div>
          <p className="mt-1 text-sm text-slate-500">Choose a post type above to generate its payload and embedded view.</p>
        </div>
      ) : (
        <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl">
          <header className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <strong className="text-slate-900">r/{post.subredditName}</strong>
              <span>·</span>
              <span>u/{post.ownerUsername}</span>
              <span>·</span>
              <span>{post.entry === 'rift' ? 'Rift first-clear custom post' : 'Orb Frenzy custom post'}</span>
              {post.entry === 'rift'
                ? <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-800">PREVIEW ONLY</span>
                : <span className="rounded-full bg-cyan-100 px-2 py-0.5 font-bold text-cyan-800">LOCAL CLAIM TEST</span>}
            </div>
            <h2 className="mt-2 text-lg font-black leading-tight text-slate-950">{post.title}</h2>
            {post.entry === 'rift' ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{post.body}</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{post.isInfinity ? 'Infinity' : formatRarity(post.rarity)}</span>
                <span>·</span>
                <span>{post.flairId ? 'Frenzy flair applied' : 'No subreddit flair selected'}</span>
              </div>
            )}
          </header>
          <div className="bg-slate-100 p-2 sm:p-4">
            <iframe
              ref={frameRef}
              key={previewUrl}
              src={previewUrl}
              title={post.entry === 'rift' ? 'Rift first-clear Reddit post preview' : 'Orb Frenzy Reddit post preview'}
              className="w-full rounded-xl border border-slate-300 bg-[#080e18]"
              style={{ height: post.entry === 'rift' ? '740px' : '1180px' }}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        </article>
      )}
    </div>
  );
};
