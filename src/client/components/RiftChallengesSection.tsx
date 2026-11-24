import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RIFT_CHALLENGE_UPGRADES,
  RIFT_FIRST_SPARK,
  riftChallengeUpgradeCost,
  type RiftChallengeSnapshot,
  type RiftChallengeUpgradeId,
} from '../../shared/rift-challenges.js';
import { formatNumber, formatRarity } from '../../shared/game.js';

async function challengeRequest<T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Rift Challenge request failed.');
  }
  return payload as T;
}

function formatCooldown(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1000;
  return seconds >= 10 ? seconds.toFixed(0) + 's' : seconds.toFixed(1) + 's';
}

export const RiftChallengesSection: React.FC = () => {
  const [snapshot, setSnapshot] = useState<RiftChallengeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const refresh = useCallback(async () => {
    const result = await challengeRequest<RiftChallengeSnapshot>('/api/rift-challenges');
    setSnapshot(result);
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void challengeRequest<RiftChallengeSnapshot>('/api/rift-challenges')
      .then(result => { if (!cancelled) setSnapshot(result); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load Rift Challenges.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (snapshot?.archive.activeRun?.status !== 'active') return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [snapshot?.archive.activeRun?.status]);

  const run = snapshot?.archive.activeRun ?? null;
  const remainingCooldown = Math.max(0, (run?.nextRollAt ?? 0) - now);
  const progressPercent = useMemo(() => {
    if (!run) return 0;
    const best = Math.max(2, run.bestRarity);
    return Math.max(0, Math.min(100, Math.log10(best) / Math.log10(RIFT_FIRST_SPARK.targetRarity) * 100));
  }, [run?.bestRarity]);

  const retryLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load Rift Challenges.');
    } finally {
      setLoading(false);
    }
  };

  const performAction = async (
    action: string,
    path: string,
    body?: Record<string, unknown>,
  ) => {
    setBusyAction(action);
    setError(null);
    try {
      const result = await challengeRequest<RiftChallengeSnapshot>(path, body ? 'POST' : 'GET', body);
      setSnapshot(result);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The challenge action failed.';
      if (message.includes('challenge run changed in another tab')) {
        try {
          await refresh();
          setError('The challenge changed in another tab. Your view has been refreshed.');
        } catch {
          setError(message);
        }
      } else {
        setError(message);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const startChallenge = () => void performAction(
    'start',
    '/api/rift-challenges/start',
    {},
  );

  const roll = () => void performAction(
    'roll',
    '/api/rift-challenges/roll',
    { runId: run?.runId },
  );

  const abandon = () => setConfirmAbandon(true);

  const buyUpgrade = (id: RiftChallengeUpgradeId) => void performAction(
    id,
    '/api/rift-challenges/upgrade',
    { upgradeId: id, runId: run?.runId },
  );

  if (loading) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-400">
        Loading Rift Challenge records…
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <h2 className="text-xl font-black text-white">Rift Challenges unavailable</h2>
        <p className="mt-2 text-sm text-slate-400">{error ?? 'The challenge archive could not be loaded.'}</p>
        <button type="button" onClick={() => void retryLoad()} disabled={loading} className="mt-4 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-400 disabled:opacity-40">
          {loading ? 'Retrying…' : 'Retry'}
        </button>
      </section>
    );
  }

  const mainLevel = snapshot?.mainProgress.level ?? 1;
  const archive = snapshot?.archive;
  const mechanicUnlocks = snapshot?.mechanicUnlocks;
  const isActive = run?.status === 'active';
  const isCompleted = run?.status === 'completed';

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-indigo-400/25 bg-gradient-to-br from-indigo-950/90 via-slate-950 to-purple-950/70 p-5 sm:p-7 shadow-xl shadow-indigo-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[10px] font-black uppercase tracking-[.24em] text-indigo-300">A separate way to play</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Rift Challenges</h2>
            <p className="mt-3 text-sm leading-relaxed text-indigo-100/70">
              Each challenge gives you a fresh save, a fixed objective, and a set of rules that change how you progress.
              Your main-game achievements unlock which mechanics you can use inside.
            </p>
          </div>
          <div className="rounded-2xl border border-indigo-300/20 bg-black/20 px-4 py-3 text-right">
            <div className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Rift Archive</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-white">{archive?.totalCompletedRuns ?? 0}</div>
            <div className="text-[10px] text-indigo-100/60">completed runs</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Main-game level at start</div>
            <div className="mt-1 text-lg font-black text-white">Lv {formatNumber(mainLevel)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Main-game rolls at start</div>
            <div className="mt-1 text-lg font-black text-white">{formatNumber(snapshot?.mainProgress.totalRolls ?? 0)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Main-game criticals at start</div>
            <div className="mt-1 text-lg font-black text-white">{formatNumber(snapshot?.mainProgress.totalCrits ?? 0)}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_.85fr]">
        <article className="rounded-3xl border border-slate-700/80 bg-slate-900/70 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Challenge 001</span>
            {snapshot?.challengeAvailable
              ? <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">Available</span>
              : <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-200">Locked · Level {RIFT_FIRST_SPARK.requiredMainLevel}</span>}
          </div>
          <h3 className="mt-3 text-2xl font-black text-white">{RIFT_FIRST_SPARK.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{RIFT_FIRST_SPARK.subtitle}</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">{RIFT_FIRST_SPARK.description}</p>

          <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-cyan-300">Required objective</div>
            <div className="mt-1 text-2xl font-black text-white">Find a 1 / {formatRarity(RIFT_FIRST_SPARK.targetRarity)} Orb</div>
            <div className="mt-1 text-xs text-slate-400">Build your own temporary economy until you can reach the target rarity.</div>
          </div>

          <div className="mt-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Challenge restrictions</div>
            <div className="mt-3 space-y-2">
              {RIFT_FIRST_SPARK.debuffs.map(debuff => (
                <div key={debuff.name} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <div>
                    <div className="text-xs font-bold text-slate-200">{debuff.name}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{debuff.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!snapshot?.challengeAvailable && (
            <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 text-xs text-amber-100/80">
              Reach Level {RIFT_FIRST_SPARK.requiredMainLevel} in the main game to access this challenge.
            </p>
          )}

          {!isActive && (
            <button
              type="button"
              onClick={startChallenge}
              disabled={!snapshot?.challengeAvailable || busyAction !== null}
              className="mt-5 w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busyAction === 'start'
                ? 'Creating fresh save…'
                : isCompleted ? 'Start a New Run' : 'Start Challenge'}
            </button>
          )}
          {isActive && (
            <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-3 py-3 text-center text-xs font-bold text-emerald-200">
              Your challenge is active below. Your run is saved separately and can be resumed later.
            </div>
          )}
          {isCompleted && (
            <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-3 py-3 text-xs text-emerald-100">
              Completed {RIFT_FIRST_SPARK.name}. Your main-game save was never changed.
            </div>
          )}
        </article>

        <aside className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">Main-game unlocks</div>
          <h3 className="mt-2 text-lg font-black text-white">Your progress opens mechanics</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Mechanics are checked when a run starts. Main-game progress earned during a run becomes available on your next attempt.
          </p>
          <div className="mt-4 space-y-3">
            {(['fortune', 'speed', 'prosperity', 'critical'] as RiftChallengeUpgradeId[]).map(id => {
              const definition = RIFT_CHALLENGE_UPGRADES[id];
              const unlocked = mechanicUnlocks?.[id] === true;
              return (
                <div key={id} className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-200">{definition.name}</div>
                    <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{definition.mainRequirement}</div>
                  </div>
                  <span className={unlocked
                    ? 'shrink-0 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-300'
                    : 'shrink-0 rounded-full bg-slate-800 px-2 py-1 text-[9px] font-black text-slate-500'}>
                    {unlocked ? 'UNLOCKED' : 'LOCKED'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rift Archive record</div>
            <div className="mt-1 text-sm font-bold text-white">
              {archive?.completedChallengeIds.includes(RIFT_FIRST_SPARK.id) ? 'First Spark completed' : 'No challenge completions yet'}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Best result: {formatRarity(archive?.bestRarityByChallenge[RIFT_FIRST_SPARK.id] ?? 2)}
            </div>
          </div>
        </aside>
      </div>

      {run && (
        <section className="rounded-3xl border border-indigo-400/25 bg-slate-900/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-indigo-300">
                {isCompleted ? 'Challenge completed' : 'Active challenge save'}
              </div>
              <h3 className="mt-1 text-xl font-black text-white">{RIFT_FIRST_SPARK.name}</h3>
              <p className="mt-1 text-xs text-slate-500">Started {new Date(run.startedAt).toLocaleString()}</p>
            </div>
            {isActive && (
              <button
                type="button"
                onClick={abandon}
                disabled={busyAction !== null}
                className="rounded-lg border border-rose-500/25 px-3 py-2 text-[11px] font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
              >
                Abandon Run
              </button>
            )}
          </div>

          {confirmAbandon && (
            <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/5 p-4" role="alertdialog" aria-label="Confirm abandoning this challenge">
              <div className="text-sm font-black text-white">Abandon this run?</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Its temporary Coins and upgrades will be discarded. Your main-game save and completed Rift Archive records will remain untouched.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setConfirmAbandon(false); void performAction('abandon', '/api/rift-challenges/abandon', { runId: run?.runId }); }}
                  disabled={busyAction !== null}
                  className="rounded-lg bg-rose-500 px-3 py-2 text-[10px] font-black text-white hover:bg-rose-400 disabled:opacity-40"
                >
                  {busyAction === 'abandon' ? 'Abandoning…' : 'Confirm Abandon'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAbandon(false)}
                  disabled={busyAction !== null}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  Keep Playing
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Challenge Coins</div>
              <div className="mt-1 text-xl font-black tabular-nums text-amber-200">{formatNumber(run.coins)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Rolls</div>
              <div className="mt-1 text-xl font-black tabular-nums text-white">{formatNumber(run.totalRolls)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Best rarity</div>
              <div className="mt-1 text-xl font-black tabular-nums text-cyan-200">{formatRarity(run.bestRarity)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Target</div>
              <div className="mt-1 text-xl font-black tabular-nums text-white">{formatRarity(RIFT_FIRST_SPARK.targetRarity)}</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span>Rarity progress</span><span>{Math.floor(progressPercent)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-950">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-400 transition-all" style={{ width: progressPercent + '%' }} />
            </div>
          </div>

          {run.lastRoll && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-cyan-300">Latest result</div>
                <div className="mt-1 text-lg font-black text-white">
                  1 / {formatRarity(run.lastRoll.rarity)} {run.lastRoll.isCritical ? '· CRITICAL' : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-amber-200">+{formatNumber(run.lastRoll.coinsGained)} Coins</div>
                <div className="text-[10px] text-slate-500">Challenge wallet only</div>
              </div>
            </div>
          )}

          {isActive && (
            <>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={roll}
                  disabled={busyAction !== null || remainingCooldown > 0}
                  className="min-h-12 flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyAction === 'roll'
                    ? 'Rolling…'
                    : remainingCooldown > 0
                      ? 'Ready in ' + formatCooldown(remainingCooldown)
                      : 'ROLL ORB'}
                </button>
                <div className="text-center text-[10px] text-slate-500 sm:max-w-48 sm:text-left">
                  The server enforces the challenge cooldown. Each result is rolled independently.
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">Challenge upgrades</div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(['fortune', 'speed', 'prosperity', 'critical'] as RiftChallengeUpgradeId[]).map(id => {
                    const definition = RIFT_CHALLENGE_UPGRADES[id];
                    const unlocked = mechanicUnlocks?.[id] === true;
                    const level = run.upgradeLevels[id] ?? 0;
                    const maxed = level >= definition.maxLevel;
                    const cost = riftChallengeUpgradeCost(id, level, run.totalRolls);
                    return (
                      <article key={id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black text-white">{definition.name}</h4>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{definition.description}</p>
                          </div>
                          <span className="shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black text-slate-300">Lv {level}/{definition.maxLevel}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-500">
                            {!unlocked ? definition.mainRequirement : maxed ? 'Maximum level' : formatNumber(cost) + ' Coins'}
                          </span>
                          <button
                            type="button"
                            onClick={() => buyUpgrade(id)}
                            disabled={!unlocked || maxed || run.coins < cost || busyAction !== null}
                            className="rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-[10px] font-black text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            {busyAction === id ? 'Buying…' : maxed ? 'MAXED' : 'UPGRADE'}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
                  Upgrade prices rise by 5% every 10 rolls, up to 50%. The displayed price includes the current Dimensional Tax.
                </p>
              </div>
            </>
          )}

          {isCompleted && (
            <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Objective achieved</div>
              <h4 className="mt-1 text-xl font-black text-white">The First Spark is stable.</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                You found a 1 / {formatRarity(RIFT_FIRST_SPARK.targetRarity)} Orb in {formatNumber(run.totalRolls)} rolls.
                This completion is recorded in your Rift Archive. Your normal save was not touched.
              </p>
              <button
                type="button"
                onClick={startChallenge}
                disabled={busyAction !== null || !snapshot?.challengeAvailable}
                className="mt-4 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                Start Another Fresh Run
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  );
};
