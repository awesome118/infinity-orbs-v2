import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import { ArrowRight, CalendarDays, Sparkles, Trophy } from 'lucide-react';
import './styles.css';

interface RiftCompletionPostInfo {
  postId: string;
  ownerUsername: string;
  challengeId: string;
  challengeName: string;
  subredditName: string;
  createdAt: number;
  previewOnly: boolean;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not load the Rift completion post.');
  }
  return payload as T;
}

function RiftCompletionPost() {
  const previewPostId = new URLSearchParams(window.location.search).get('previewPostId');
  const fetchPostApi = (url: string, init?: RequestInit) => {
    let fetcher: typeof fetch = fetch;
    if (previewPostId && window.parent !== window) {
      try {
        if (window.parent.location.origin === window.location.origin) {
          fetcher = window.parent.fetch.bind(window.parent);
        }
      } catch {
        // Pages previews use the parent window's local API adapter when embedded.
      }
    }
    return fetcher(url, init);
  };
  const [info, setInfo] = useState<RiftCompletionPostInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    const query = previewPostId ? '?postId=' + encodeURIComponent(previewPostId) : '';
    void fetchPostApi('/api/rift-completion/info' + query, { cache: 'no-store' })
      .then(readJson<RiftCompletionPostInfo>)
      .then(result => { if (active) setInfo(result); })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load the Rift completion details.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [previewPostId]);

  const openGame = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!info || info.previewOnly || opening) return;
    setOpening(true);
    setError('');
    try {
      await requestExpandedMode(event.nativeEvent, 'game');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open Infinity Orbs.');
      setOpening(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070b16] px-4 py-8 text-slate-100">
      <div className="pointer-events-none fixed inset-0 opacity-40" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_25%,rgba(124,58,237,0.24),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:34px_34px]" />
      </div>
      <div className="relative mx-auto flex min-h-[78vh] max-w-2xl items-center justify-center">
        <article className="w-full overflow-hidden rounded-3xl border border-violet-400/25 bg-slate-950/90 shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2 text-[11px] font-black tracking-[0.18em] text-violet-200">
              <Sparkles size={14} /> INFINITY ORBS · RIFT RECORD
            </div>
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-black tracking-[0.16em] text-amber-200">
              FIRST CLEAR
            </span>
          </header>

          <div className="px-5 pb-6 pt-8 text-center sm:px-9">
            <div className="mx-auto mb-7 flex h-28 w-28 items-center justify-center rounded-full border border-violet-300/30 bg-[radial-gradient(circle_at_35%_30%,rgba(196,181,253,0.45),rgba(91,33,182,0.24)_42%,rgba(15,23,42,0.95)_72%)] shadow-[0_0_55px_rgba(139,92,246,0.25)]">
              <Trophy size={42} strokeWidth={1.5} className="text-violet-100" />
            </div>

            {loading ? (
              <>
                <div className="text-xs font-black tracking-[0.2em] text-violet-300">RECORD SYNCHRONIZING</div>
                <h1 className="mt-3 text-2xl font-black tracking-tight text-white">Loading first-clear details…</h1>
                <p className="mt-3 text-sm text-slate-400">Retrieving the completed Rift challenge.</p>
              </>
            ) : info ? (
              <>
                <div className="text-xs font-black tracking-[0.2em] text-violet-300">A NEW RECORD HAS BEEN WRITTEN</div>
                <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
                  u/{info.ownerUsername} completed the Rift {info.challengeName} for the first time.
                </h1>
                <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
                  A permanent first clear. The Rift remembers. The next challenge is waiting.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <Trophy size={13} className="text-amber-300" /> {info.challengeName}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <CalendarDays size={13} /> {new Date(info.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-black tracking-[0.2em] text-rose-300">RECORD UNAVAILABLE</div>
                <h1 className="mt-3 text-2xl font-black text-white">Could not load this first clear.</h1>
              </>
            )}

            {error && <p role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

            <div className="mt-8">
              {info?.previewOnly ? (
                <div className="rounded-xl border border-violet-300/20 bg-violet-400/10 px-4 py-3 text-xs font-semibold text-violet-100">
                  Simulator preview. This post has not been published to Reddit.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={event => void openGame(event)}
                  disabled={!info || loading || opening}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/40 bg-violet-600 px-5 py-3.5 text-sm font-black text-white shadow-[0_12px_35px_rgba(124,58,237,0.2)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {opening ? 'Opening Infinity Orbs…' : 'Play Infinity Orbs'}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
            {info?.subredditName && (
              <p className="mt-5 text-[11px] text-slate-500">Posted in r/{info.subredditName}</p>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<RiftCompletionPost />);
