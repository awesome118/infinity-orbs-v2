import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_RIFT_CHALLENGES,
  DEFAULT_RIFT_MODIFIERS,
  RIFT_ASCENT,
  RIFT_PERKS,
  RIFT_UNLOCKS,
  normalizeRiftChallengeToggles,
  normalizeRiftModifierSettings,
  riftModifierFromSliderPosition,
  riftModifierSliderPosition,
  getRiftChallengeDefinition,
  getRiftMutationDefinition,
  RIFT_MUTATION_UNLOCK_ROLLS,
  RIFT_MUTATION_UNLOCK_PROGRESS,
  riftMutationRewardMultiplier,
  riftModifierRewardPreview,
  riftRatePerHour,
  riftPerkCost,
  type RiftChallengeSnapshot,
  type RiftChallengeToggles,
  type RiftModifierId,
  type RiftModifierSettings,
  type RiftPerkId,
  type RiftUnlockId,
} from '../../shared/rift-challenges.js';
import { formatNumber, formatRarity } from '../../shared/game.js';
import { RIFT_RELICS, RIFT_RELIC_EQUIP_SLOTS, RIFT_RELIC_FORKED_EQUIP_SLOTS, getRiftRelicEffects, riftRelicCost, type RiftRelicId } from '../../shared/rift-relics.js';
import { Activity, ArrowUpRight, Zap, SlidersHorizontal, ShieldAlert } from 'lucide-react';

async function challengeRequest<T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Rift request failed.');
  }
  return payload as T;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  if (minutes > 0) return minutes + 'm ' + seconds + 's';
  return seconds + 's';
}

const MODIFIER_CONTROLS: Array<{
  id: RiftModifierId;
  name: string;
  description: string;
  effect: string;
}> = [
  { id: 'instability', name: 'Goal', description: 'Sets the rarity required to complete the Rift.', effect: 'Objective rarity × multiplier' },
  { id: 'temporalDrag', name: 'Temporal Drag', description: 'Slows the Rift’s base roll cadence.', effect: 'Base cooldown × multiplier' },
  { id: 'fortuneSuppression', name: 'Luck Suppression', description: 'Reduces all effective Rift Luck above the neutral baseline.', effect: 'Bonus Luck ÷ multiplier' },
  { id: 'coinScarcity', name: 'Coin Scarcity', description: 'Reduces Coins earned from every Rift roll.', effect: 'Coin earnings ÷ multiplier' },
];

const CHALLENGE_TOGGLES: Array<{
  id: keyof RiftChallengeToggles;
  name: string;
  description: string;
}> = [
  { id: 'secondBest', name: 'Second-best', description: 'The second-highest Orb in each roll batch determines whether the objective is reached.' },
  { id: 'noAutomation', name: 'No automation', description: 'Disables Auto Roll and offline progression during the run.' },
  { id: 'noCriticals', name: 'No criticals', description: 'Critical hits cannot occur in this run.' },
  { id: 'noShards', name: 'No Shards', description: 'Disables Shard drops, Shard rewards, and all personal/global Booster effects for this run.' },
];

function multiplierLabel(value: number): string {
  return '×' + (value >= 100 ? formatNumber(value) : value.toFixed(1));
}

export const RiftChallengesSection: React.FC<{
  panel: 'run' | 'upgrades' | 'relics';
  onEnterGame?: () => void;
  onExit?: () => void;
  onRefreshPlayer?: () => void;
}> = ({ panel, onEnterGame, onExit, onRefreshPlayer }) => {
  const activePanel = panel;
  const [snapshot, setSnapshot] = useState<RiftChallengeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [modifierSettings, setModifierSettings] = useState<RiftModifierSettings>({ ...DEFAULT_RIFT_MODIFIERS });
  const [challengeToggles, setChallengeToggles] = useState<RiftChallengeToggles>({ ...DEFAULT_RIFT_CHALLENGES });
  const [configDirty, setConfigDirty] = useState(false);

  const applySnapshot = useCallback((result: RiftChallengeSnapshot) => {
    setSnapshot(result);
    setModifierSettings(normalizeRiftModifierSettings(result.archive.modifierSettings));
    setChallengeToggles(normalizeRiftChallengeToggles(result.archive.challengeToggles));
    setConfigDirty(false);
  }, []);

  const refresh = useCallback(async () => {
    const result = await challengeRequest<RiftChallengeSnapshot>('/api/rift-challenges');
    applySnapshot(result);
    return result;
  }, [applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    void challengeRequest<RiftChallengeSnapshot>('/api/rift-challenges')
      .then(result => { if (!cancelled) applySnapshot(result); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load Rift progression.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applySnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const archive = snapshot?.archive;
  const run = archive?.activeRun ?? null;
  const challenge = run ? getRiftChallengeDefinition(run.challengeId) ?? RIFT_ASCENT : RIFT_ASCENT;
  const isActive = run?.status === 'active';
  const isCompleted = run?.status === 'completed';

  const riftProjection = useMemo(() => {
    if (!archive) return { points: 0, progress: 0, rate: 1, nextPointMs: 3_600_000 };
    const elapsed = Math.max(0, now - archive.riftLastAccruedAt);
    const accumulated = archive.riftProgress + elapsed / 3_600_000 * archive.riftRatePerHour;
    const whole = Math.floor(accumulated);
    return {
      points: Math.min(Number.MAX_SAFE_INTEGER, archive.riftPoints + whole),
      progress: accumulated - whole,
      rate: archive.riftRatePerHour,
      nextPointMs: Math.max(0, (1 - (accumulated - whole)) / Math.max(0.000001, archive.riftRatePerHour) * 3_600_000),
    };
  }, [archive?.riftPoints, archive?.riftProgress, archive?.riftRatePerHour, archive?.riftLastAccruedAt, now]);

  const rewardPreview = useMemo(
    () => riftModifierRewardPreview(modifierSettings, challengeToggles, archive?.riftPerkLevels.riftYield ?? 0),
    [modifierSettings, challengeToggles, archive?.riftPerkLevels.riftYield],
  );
  const relicSlotLimit = archive?.riftUnlocks.timelineFork ? RIFT_RELIC_FORKED_EQUIP_SLOTS : RIFT_RELIC_EQUIP_SLOTS;
  const relicEffects = useMemo(
    () => getRiftRelicEffects(archive?.equippedRiftRelics, archive?.riftRelicLevels, relicSlotLimit),
    [archive?.equippedRiftRelics, archive?.riftRelicLevels, relicSlotLimit],
  );
  const relicCompletionReward = Math.ceil(rewardPreview.pointsPerClear * relicEffects.completionRewardMultiplier);
  const projectedRate = useMemo(
    () => archive
      ? riftRatePerHour(archive.completedChallengeIds, archive.riftPerkLevels, archive.bestModifierSettings, archive.bestChallengeToggles, archive.riftPoints)
      : rewardPreview.rpPerHour,
    [archive?.completedChallengeIds, archive?.riftPerkLevels, archive?.bestModifierSettings, archive?.bestChallengeToggles, archive?.riftPoints, rewardPreview.rpPerHour],
  );
  const configuredBestRate = useMemo(() => {
    if (!archive) return rewardPreview.rpPerHour;
    const candidateRate = riftRatePerHour(
      [...archive.completedChallengeIds, RIFT_ASCENT.id],
      archive.riftPerkLevels,
      modifierSettings,
      challengeToggles,
      archive.riftPoints,
    );
    return Math.max(projectedRate, candidateRate);
  }, [archive?.completedChallengeIds, archive?.riftPerkLevels, archive?.riftPoints, modifierSettings, challengeToggles, projectedRate, rewardPreview.rpPerHour]);

  const runTarget = Math.max(2, run?.targetRarity ?? challenge?.targetRarity ?? RIFT_ASCENT.targetRarity);
  const progressPercent = useMemo(() => {
    if (!run) return 0;
    const best = Math.max(2, run.bestRarity);
    return Math.max(0, Math.min(100, Math.log10(best) / Math.log10(runTarget) * 100));
  }, [run?.bestRarity, runTarget]);
  const currentMutation = getRiftMutationDefinition(run?.mutationId);
  const mutationRollsRemaining = currentMutation && run
    ? Math.max(0, run.mutationEndsAtRoll - run.totalRolls)
    : 0;
  const mutationRewardBonusPercent = Math.round((riftMutationRewardMultiplier(run?.mutationsCompleted ?? 0) - 1) * 100);
  const mutationGateReached = Boolean(run &&
    run.totalRolls >= RIFT_MUTATION_UNLOCK_ROLLS &&
    progressPercent >= RIFT_MUTATION_UNLOCK_PROGRESS * 100);

  const retryLoad = async () => {
    setLoading(true);
    setError(null);
    try { await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load Rift progression.'); }
    finally { setLoading(false); }
  };

  const performAction = async (action: string, path: string, body?: Record<string, unknown>) => {
    setBusyAction(action);
    setError(null);
    try {
      const result = await challengeRequest<RiftChallengeSnapshot>(path, body ? 'POST' : 'GET', body);
      applySnapshot(result);
      setConfirmAbandon(false);
      if (action.startsWith('start-')) onEnterGame?.();
      else if (action === 'abandon') onExit?.();
      else onRefreshPlayer?.();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The Rift action failed.';
      if (message.includes('challenge run changed in another tab')) {
        try {
          await refresh();
          setError('The Rift changed in another tab. Your view has been refreshed.');
        } catch { setError(message); }
      } else {
        setError(message);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const startRift = () => void (async () => {
    setBusyAction('start-rift-ascent');
    setError(null);
    try {
      if (configDirty) {
        await challengeRequest<RiftChallengeSnapshot>('/api/rift-challenges/modifiers', 'POST', {
          modifierSettings,
          challengeToggles,
        });
      }
      const result = await challengeRequest<RiftChallengeSnapshot>('/api/rift-challenges/start', 'POST', {
        challengeId: RIFT_ASCENT.id,
      });
      applySnapshot(result);
      setConfirmAbandon(false);
      onEnterGame?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not begin the Rift run.');
    } finally {
      setBusyAction(null);
    }
  })();
  const saveModifiers = () => void performAction(
    'save-modifiers',
    '/api/rift-challenges/modifiers',
    { modifierSettings, challengeToggles },
  );
  const buyPerk = (id: RiftPerkId) => void performAction(id, '/api/rift-challenges/perk', { perkId: id });
  const buyUnlock = (id: RiftUnlockId) => void performAction('unlock-' + id, '/api/rift-challenges/unlock', { unlockId: id });
  const forgeRelic = (id: RiftRelicId) => void performAction('forge-' + id, '/api/rift-challenges/relic/forge', { relicId: id });
  const equipRelic = (id: RiftRelicId, equipped: boolean) => void performAction('equip-' + id, '/api/rift-challenges/relic/equip', { relicId: id, equipped });

  const updateModifier = (id: RiftModifierId, value: number) => {
    setModifierSettings(previous => ({ ...previous, [id]: value }));
    setConfigDirty(true);
  };
  const updateToggle = (id: keyof RiftChallengeToggles, checked: boolean) => {
    setChallengeToggles(previous => ({ ...previous, [id]: checked }));
    setConfigDirty(true);
  };

  if (loading) {
    return <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-400">Loading Rift records…</section>;
  }
  if (!snapshot || !archive) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <h2 className="text-xl font-black text-white">Rift progression unavailable</h2>
        <p className="mt-2 text-sm text-slate-400">{error ?? 'The Rift archive could not be loaded.'}</p>
        <button type="button" onClick={() => void retryLoad()} disabled={loading} className="mt-4 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-400 disabled:opacity-40">
          {loading ? 'Retrying…' : 'Retry'}
        </button>
      </section>
    );
  }

  const mainLevel = snapshot.mainProgress.level;
  const runIsLegacyChallenge = Boolean(run && run.challengeId !== RIFT_ASCENT.id);

  return (
    <section className="io-rift-page space-y-5 text-slate-100">
      <header className="overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-[#221342] via-[#110c25] to-[#1b1640] p-5 shadow-2xl shadow-slate-950/40 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.24em] text-violet-300">
              <Activity className="h-3.5 w-3.5" /> Persistent progression
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">The Rift</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Shape your own difficulty. Every modifier increases the reward, and the Rift continues generating points while you are away. Each run uses an isolated save, so your main progression remains untouched.
            </p>
          </div>
          <div className="grid min-w-[15rem] grid-cols-2 gap-2">
            <div className="rounded-2xl border border-violet-300/20 bg-black/20 px-3 py-3">
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-violet-200">Rift Points</div>
              <div className="mt-1 text-2xl font-black tabular-nums text-white">{formatNumber(riftProjection.points)}</div>
              <div className="mt-1 text-[9px] text-slate-500">Available balance</div>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-black/20 px-3 py-3">
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-amber-200">Scrap</div>
              <div className="mt-1 text-2xl font-black tabular-nums text-white">{formatNumber(snapshot.scrapBalance)}</div>
              <div className="mt-1 text-[9px] text-slate-500">Forge material</div>
            </div>
            <div className="col-span-2 px-1 text-right text-[9px] text-slate-500">Lifetime Rift Points earned: {formatNumber(archive.totalRiftPointsEarned)}</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-violet-300/20 bg-slate-950/55 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-violet-300">Rift Bar</div>
              <div className="mt-1 text-2xl font-black text-white">
                {riftProjection.rate.toFixed(2)} <span className="text-sm font-bold text-violet-200">RP / hour</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-200">{Math.floor(riftProjection.progress * 100)}% to next point</div>
              <div className="mt-1 text-[10px] text-slate-400">Next Rift Point in {formatDuration(riftProjection.nextPointMs)}</div>
            </div>
          </div>
          <div className="mt-4 h-4 overflow-hidden rounded-full border border-violet-300/15 bg-black/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-300 to-cyan-300 shadow-[0_0_18px_rgba(177,113,255,.38)] transition-[width] duration-500"
              style={{ width: Math.max(0, Math.min(100, riftProjection.progress * 100)) + '%' }}
              role="progressbar"
              aria-label="Rift Point progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.floor(riftProjection.progress * 100)}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
            <span>Passive generation only increases after you clear a run at a higher difficulty.</span>
            <span>Best cleared setup: {projectedRate.toFixed(2)} RP/h earned.</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Past trial clears</div>
            <div className="mt-1 text-lg font-black text-white">{archive.completedChallengeIds.filter(id => id !== RIFT_ASCENT.id).length}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Completed runs</div>
            <div className="mt-1 text-lg font-black text-white">{formatNumber(archive.totalCompletedRuns)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Main-game level</div>
            <div className="mt-1 text-lg font-black text-white">Lv {formatNumber(mainLevel)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Rift points spent</div>
            <div className="mt-1 text-lg font-black text-white">{formatNumber(Math.max(0, archive.totalRiftPointsEarned - archive.riftPoints))}</div>
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">{error}</div>}

      {run && (
        <section className="rounded-2xl border border-indigo-400/25 bg-slate-900/75 p-4 shadow-lg shadow-slate-950/20 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-indigo-300">
                {isCompleted ? 'Rift run completed' : 'Active Rift run'}
              </div>
              <h2 className="mt-1 text-xl font-black text-white">
                {runIsLegacyChallenge ? (challenge?.name ?? 'Legacy trial') : RIFT_ASCENT.name}
              </h2>
              <p className="mt-1 text-[10px] text-slate-500">Started {new Date(run.startedAt).toLocaleString()} · Isolated Rift save</p>
            </div>
            {isActive && (
              <button type="button" onClick={() => setConfirmAbandon(true)} disabled={busyAction !== null}
                className="rounded-lg border border-rose-500/25 px-3 py-2 text-[10px] font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40">
                Abandon run
              </button>
            )}
          </div>
          {confirmAbandon && (
            <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/5 p-3" role="alertdialog" aria-label="Confirm abandoning this Rift run">
              <div className="text-sm font-black text-white">Abandon this Rift run?</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">The isolated Rift save will be discarded. Your main save, Rift Points, permanent research, and completed records remain unchanged.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void performAction('abandon', '/api/rift-challenges/abandon', { runId: run.runId })} disabled={busyAction !== null} className="rounded-lg bg-rose-500 px-3 py-2 text-[10px] font-black text-white hover:bg-rose-400 disabled:opacity-40">
                  {busyAction === 'abandon' ? 'Abandoning…' : 'Confirm abandon'}
                </button>
                <button type="button" onClick={() => setConfirmAbandon(false)} disabled={busyAction !== null} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40">Keep playing</button>
              </div>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Rift Coins</div>
              <div className="mt-1 text-lg font-black tabular-nums text-amber-200">{formatNumber(run.coins)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Rolls</div>
              <div className="mt-1 text-lg font-black tabular-nums text-white">{formatNumber(run.totalRolls)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Selected best</div>
              <div className="mt-1 text-lg font-black tabular-nums text-cyan-200">{formatRarity(run.bestRarity)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Objective</div>
              <div className="mt-1 text-lg font-black tabular-nums text-white">1/{formatRarity(runTarget)}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span>Rift objective progress</span><span>{Math.floor(progressPercent)}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-950">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all" style={{ width: progressPercent + '%' }} />
            </div>
          </div>
          {isActive && (
            <div className="mt-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-3">
              <div className="text-[9px] font-black uppercase tracking-[.2em] text-fuchsia-300">Rift mutations</div>
              {currentMutation && mutationRollsRemaining > 0 ? (
                <>
                  <div className="mt-1 text-sm font-black text-white">{currentMutation.name} · {mutationRollsRemaining} rolls left</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{currentMutation.effect}</p>
                </>
              ) : (
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  {mutationGateReached
                    ? 'The Rift is between anomalies. Another mutation may emerge after the quiet interval.'
                    : 'Mutations begin after 20 rolls and 20% objective progress. Each lasts 12 rolls.'}
                </p>
              )}
              <div className="mt-2 text-[10px] font-bold text-fuchsia-200">
                {run.mutationsCompleted} endured · +{mutationRewardBonusPercent}% Rift Point reward at completion
              </div>
            </div>
          )}
          {run.lastRoll && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2.5">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-cyan-300">Latest result</div>
                <div className="mt-1 text-sm font-black text-white">1 / {formatRarity(run.lastRoll.rarity)} {run.lastRoll.isCritical ? '· CRITICAL' : ''}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-amber-200">+{formatNumber(run.lastRoll.coinsGained)} Coins</div>
                <div className="text-[10px] text-slate-500">Rift wallet only</div>
              </div>
            </div>
          )}
          {isActive && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-300">Normal game menus now use this isolated Rift save. Your main save remains untouched.</p>
              <button type="button" onClick={() => onEnterGame?.()} disabled={busyAction !== null || !onEnterGame}
                className="min-h-10 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-[10px] font-black text-slate-950 shadow-lg shadow-violet-950/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                ENTER RIFT GAME
              </button>
            </div>
          )}
          {isCompleted && (
            <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Objective achieved</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">The completion reward was credited using the settings captured when this run began. Adjust the configuration above and start another ascent.</p>
            </div>
          )}
        </section>
      )}



      <div className="space-y-5">
        {activePanel === 'run' && (
          <div className="space-y-5">
      {!isActive && (
        <section className="rounded-3xl border border-violet-400/25 bg-slate-900/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-violet-300">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Run configuration
              </div>
              <h2 className="mt-1 text-2xl font-black text-white">Rift Ascent</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
                Set each modifier independently, then combine them with optional challenge rules. The configuration is saved to your Rift archive and locked for the duration of a run.
              </p>
              <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-cyan-200">Second-best starts with +1 Multiball level.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-violet-300/20 bg-violet-400/5 px-3 py-2 text-right">
                <div className="text-[9px] font-black uppercase tracking-widest text-violet-200">Difficulty score</div>
                <div className="text-xl font-black tabular-nums text-white">{rewardPreview.difficultyScore.toFixed(2)}</div>
              </div>
              
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {MODIFIER_CONTROLS.map(control => {
              const value = modifierSettings[control.id];
              return (
                <article key={control.id} className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-white">{control.name}</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{control.description}</p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-violet-300/20 bg-violet-400/10 px-2.5 py-1.5 text-xs font-black tabular-nums text-violet-100">{multiplierLabel(value)}</span>
                  </div>
                  <input
                    type="range"
                    min={control.id === 'instability' || control.id === 'fortuneSuppression' ? 0 : 1}
                    max="100"
                    step="1"
                    value={control.id === 'instability' || control.id === 'fortuneSuppression'
                      ? riftModifierSliderPosition(value)
                      : Math.min(100, Math.max(1, value))}
                    onChange={event => {
                      const sliderValue = Number(event.currentTarget.value);
                      const nextValue = control.id === 'instability' || control.id === 'fortuneSuppression'
                        ? riftModifierFromSliderPosition(sliderValue)
                        : sliderValue;
                      updateModifier(control.id, nextValue);
                    }}
                    disabled={busyAction !== null}
                    className="mt-4 w-full accent-violet-400"
                    aria-label={control.name}
                  />
                  <div className="mt-1 flex justify-between text-[9px] font-bold uppercase tracking-wider text-slate-600">
                    <span>Neutral · ×1</span><span>Maximum · ×100</span>
                  </div>
                  <p className="mt-2 text-[10px] font-bold text-violet-200">{control.effect}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">
              <ShieldAlert className="h-3.5 w-3.5" /> Challenge rules
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CHALLENGE_TOGGLES.map(toggle => (
                <label key={toggle.id} className={'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ' + (challengeToggles[toggle.id] ? 'border-cyan-300/35 bg-cyan-300/[.07]' : 'border-slate-800 bg-slate-950/50')}>
                  <input
                    type="checkbox"
                    checked={challengeToggles[toggle.id]}
                    onChange={event => updateToggle(toggle.id, event.currentTarget.checked)}
                    disabled={busyAction !== null}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-300"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-white">{toggle.name}</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">{toggle.description}</span>
                  </span>
                  {challengeToggles[toggle.id] && <span className="ml-auto shrink-0 text-[9px] font-black text-cyan-200">ON</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Reward preview on clear</div>
              <div className="mt-1 text-2xl font-black tabular-nums text-cyan-200">+{formatNumber(relicCompletionReward)} RP</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Best rate after clear</div>
              <div className="mt-1 text-2xl font-black tabular-nums text-violet-200">{configuredBestRate.toFixed(2)} RP/h</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Completion target</div>
              <div className="mt-1 text-2xl font-black tabular-nums text-white">1 / {formatRarity(Math.ceil(RIFT_ASCENT.targetRarity * modifierSettings.instability))}</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,.9fr)_minmax(0,2fr)]">
            <button
              type="button"
              onClick={saveModifiers}
              disabled={!configDirty || busyAction !== null}
              className="min-h-[68px] rounded-2xl border border-violet-300/30 bg-violet-400/10 px-4 py-3 text-xs font-black text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {busyAction === 'save-modifiers' ? 'Saving setup…' : configDirty ? 'Save configuration' : 'Configuration saved'}
            </button>
            <button
              id="start-rift-button"
              type="button"
              onClick={startRift}
              disabled={mainLevel < RIFT_ASCENT.requiredMainLevel || busyAction !== null}
              className="group flex min-h-[68px] items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-300 px-5 py-4 text-left text-slate-950 shadow-lg shadow-violet-950/35 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-black tracking-[.12em]">{busyAction === 'start-rift-ascent' ? 'OPENING RIFT…' : 'START RIFT'}</span>
                <span className="mt-1 text-[10px] font-bold text-slate-950/70">{configDirty ? 'Your setup will save automatically before launch.' : 'Launch Rift Ascent with the selected modifiers.'}</span>
              </span>
              <ArrowUpRight className="h-5 w-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </div>
          {mainLevel < RIFT_ASCENT.requiredMainLevel && (
            <p className="mt-3 text-[10px] text-amber-300">Reach Level {RIFT_ASCENT.requiredMainLevel} in the main game to enter the Rift.</p>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
            Modifier values range from ×1 (neutral) to ×100. The Goal and Luck controls are logarithmic. The reward and generation figures are previews only; they are earned only after completing a run with these settings. Changing the draft never increases your existing Rift Point rate.
          </p>
        </section>
      )}

          </div>
        )}

        {activePanel === 'upgrades' && (() => {
          const allPerks = Object.values(RIFT_PERKS);
          const realityPerks = allPerks.filter(perk => perk.category === 'main-game');
          const riftPerks = allPerks.filter(perk => perk.category === 'rift');
          const totalRanks = allPerks.reduce((sum, perk) => sum + (archive.riftPerkLevels[perk.id] ?? 0), 0);
          const maxRanks = allPerks.reduce((sum, perk) => sum + perk.maxLevel, 0);
          const installedNodes = allPerks.filter(perk => (archive.riftPerkLevels[perk.id] ?? 0) > 0).length;
          const ascentCleared = archive.completedChallengeIds.includes(RIFT_ASCENT.id);
          const renderPerkNode = (perk: (typeof RIFT_PERKS)[RiftPerkId], index: number, branch: 'reality' | 'rift') => {
            const level = archive.riftPerkLevels[perk.id] ?? 0;
            const maxed = level >= perk.maxLevel;
            const cost = riftPerkCost(perk.id, level);
            const canBuy = !maxed && riftProjection.points >= cost && busyAction === null;
            const reality = branch === 'reality';
            return (
              <article key={perk.id} className={'group relative isolate overflow-hidden rounded-[1.5rem] border p-4 transition duration-200 hover:-translate-y-1 sm:p-5 ' + (reality
                ? 'border-cyan-300/20 bg-gradient-to-br from-[#102b37] via-[#101b2a] to-[#0b101e] hover:border-cyan-200/40'
                : 'border-violet-300/20 bg-gradient-to-br from-[#27163d] via-[#191329] to-[#0e0a1b] hover:border-violet-200/40')}>
                <div className={'pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full blur-3xl opacity-20 ' + (reality ? 'bg-cyan-300' : 'bg-fuchsia-400')} />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={'grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-xs font-black tabular-nums ' + (reality
                        ? 'border-cyan-200/25 bg-cyan-200/10 text-cyan-100'
                        : 'border-violet-200/25 bg-violet-200/10 text-violet-100')}>
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div>
                        <div className={'text-[9px] font-black uppercase tracking-[.2em] ' + (reality ? 'text-cyan-300/80' : 'text-violet-300/80')}>
                          {reality ? 'Reality anchor' : 'Rift protocol'}
                        </div>
                        <div className="mt-1 text-xs font-black uppercase tracking-widest text-slate-500">
                          {level >= perk.maxLevel ? 'Fully synchronized' : level > 0 ? 'Synchronization active' : 'Awaiting installation'}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 text-right">
                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Rank</div>
                      <div className="mt-0.5 text-sm font-black tabular-nums text-white">{level}<span className="text-slate-500">/{perk.maxLevel}</span></div>
                    </div>
                  </div>

                  <h4 className="mt-5 text-lg font-black tracking-tight text-white">{perk.name}</h4>
                  <p className="mt-2 min-h-[2.8rem] text-[11px] leading-relaxed text-slate-400">{perk.description}</p>

                  <div className={'mt-4 rounded-xl border px-3 py-3 ' + (reality ? 'border-cyan-200/15 bg-cyan-200/[.045]' : 'border-violet-200/15 bg-violet-200/[.045]')}>
                    <div className={'text-[8px] font-black uppercase tracking-[.2em] ' + (reality ? 'text-cyan-300/75' : 'text-violet-300/75')}>Research output</div>
                    <div className="mt-1.5 text-xs font-extrabold leading-relaxed text-white">{perk.effect}</div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <span>Synchronization</span>
                      <span>{Math.floor(level / perk.maxLevel * 100)}%</span>
                    </div>
                    <div className="flex gap-1" role="progressbar" aria-label={perk.name + ' research level'} aria-valuemin={0} aria-valuemax={perk.maxLevel} aria-valuenow={level}>
                      {Array.from({ length: perk.maxLevel }, (_, segment) => (
                        <span key={segment} className={'h-1.5 min-w-0 flex-1 rounded-full ' + (segment < level
                          ? (reality ? 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,.35)]' : 'bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,.35)]')
                          : 'bg-slate-800')} />
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-600">Next investment</div>
                      <div className="mt-1 text-sm font-black tabular-nums text-white">{maxed ? 'Complete' : formatNumber(cost) + ' RP'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => buyPerk(perk.id)}
                      disabled={!canBuy}
                      aria-label={maxed ? perk.name + ' is maxed' : 'Invest Rift Points in ' + perk.name}
                      className={'min-h-10 min-w-[8.5rem] rounded-xl border px-3 py-2 text-[9px] font-black tracking-[.12em] transition disabled:cursor-not-allowed disabled:opacity-35 ' + (reality
                        ? 'border-cyan-200/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20'
                        : 'border-violet-200/25 bg-violet-300/10 text-violet-100 hover:bg-violet-300/20')}>
                      {busyAction === perk.id ? 'INSTALLING…' : maxed ? 'MAX RANK' : 'INSTALL RANK'}
                    </button>
                  </div>
                </div>
              </article>
            );
          };

          const corePerk = RIFT_PERKS.probabilityDebt;
          const coreLevel = archive.riftPerkLevels[corePerk.id] ?? 0;
          const coreMaxed = coreLevel >= corePerk.maxLevel;
          const coreCost = riftPerkCost(corePerk.id, coreLevel);
          const coreCanBuy = !coreMaxed && riftProjection.points >= coreCost && busyAction === null;
          const timelineFork = RIFT_UNLOCKS.timelineFork;
          const timelineUnlocked = archive.riftUnlocks.timelineFork === true;
          const timelineCanBuy = !timelineUnlocked && !isActive && ascentCleared && riftProjection.points >= timelineFork.cost && busyAction === null;

          return (
            <div className="io-rift-research space-y-7">
              <section className="relative isolate overflow-hidden rounded-[2rem] border border-violet-200/20 bg-[#0b0816] shadow-[0_24px_80px_rgba(0,0,0,.32)]">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-90" style={{ background: 'radial-gradient(ellipse at 12% 0%, rgba(85,228,255,.16), transparent 42%), radial-gradient(ellipse at 88% 18%, rgba(177,105,255,.24), transparent 46%), linear-gradient(135deg, transparent 38%, rgba(114,73,185,.08) 100%)' }} />
                <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full border border-violet-200/10 shadow-[0_0_0_26px_rgba(177,130,255,.025),0_0_0_58px_rgba(177,130,255,.02),0_0_90px_rgba(150,96,255,.12)]" />
                <div className="relative p-5 sm:p-7">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-2xl">
                      <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/20 bg-violet-200/[.07] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.22em] text-violet-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.9)]" />
                        Rift technology division · permanent archive
                      </div>
                      <h2 className="mt-4 text-3xl font-black tracking-[-.05em] text-white sm:text-4xl">Research the impossible.</h2>
                      <p className="mt-3 max-w-xl text-xs leading-relaxed text-slate-400 sm:text-sm">
                        Rewire the rules of ordinary reality and the Rift itself. Installed ranks survive every run. Each investment permanently changes the system.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:min-w-[23rem]">
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                        <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Research nodes</div>
                        <div className="mt-1.5 text-2xl font-black tabular-nums text-white">{allPerks.length}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                        <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Installed</div>
                        <div className="mt-1.5 text-2xl font-black tabular-nums text-cyan-200">{installedNodes}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                        <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Total ranks</div>
                        <div className="mt-1.5 text-2xl font-black tabular-nums text-violet-200">{totalRanks}<span className="text-sm text-slate-500">/{maxRanks}</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,.72fr)]">
                    <div className="rounded-2xl border border-violet-200/15 bg-black/30 p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[9px] font-black uppercase tracking-[.2em] text-violet-200">Unspent research energy</div>
                        <div className="rounded-lg border border-violet-200/15 bg-violet-200/[.06] px-2 py-1 text-[8px] font-black uppercase tracking-widest text-violet-200">Available now</div>
                      </div>
                      <div className="mt-2 text-3xl font-black tabular-nums tracking-tight text-white sm:text-4xl">{formatNumber(riftProjection.points)} <span className="text-xs font-bold tracking-normal text-violet-200">RIFT POINTS</span></div>
                      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Your balance updates as the Rift Bar generates points. Spending never resets your completed records.</p>
                    </div>
                    <div className="flex flex-col justify-center rounded-2xl border border-cyan-200/15 bg-cyan-200/[.045] p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-[.18em] text-cyan-200">
                        <span>Archive synchronization</span><span>{Math.floor(totalRanks / Math.max(1, maxRanks) * 100)}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/50">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 shadow-[0_0_16px_rgba(185,150,255,.4)]" style={{ width: (totalRanks / Math.max(1, maxRanks) * 100) + '%' }} />
                      </div>
                      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">Every rank is permanent. The full archive contains {maxRanks} research levels.</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cyan-200/15 pb-3">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">Branch 01 · outside the anomaly</div>
                    <h3 className="mt-1 text-2xl font-black tracking-tight text-white">Reality anchors</h3>
                    <p className="mt-1 text-[11px] text-slate-500">These upgrades affect your ordinary game save.</p>
                  </div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-cyan-200">{realityPerks.length} nodes · persistent</div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {realityPerks.map((perk, index) => renderPerkNode(perk, index, 'reality'))}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-violet-200/15 pb-3">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[.24em] text-violet-300">Branch 02 · inside the anomaly</div>
                    <h3 className="mt-1 text-2xl font-black tracking-tight text-white">Rift engineering</h3>
                    <p className="mt-1 text-[11px] text-slate-500">These systems shape challenge runs and passive Rift generation.</p>
                  </div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-violet-200">{riftPerks.length} nodes · persistent</div>
                </div>

                <article className="relative isolate overflow-hidden rounded-[1.7rem] border border-fuchsia-200/25 bg-[#160d25] shadow-[0_18px_60px_rgba(0,0,0,.24)]">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-90" style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(209,89,255,.18), transparent 54%), radial-gradient(ellipse at 100% 0%, rgba(109,76,255,.15), transparent 48%)' }} />
                  <div className="relative grid grid-cols-1 gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200/20 bg-fuchsia-200/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.22em] text-fuchsia-200">Core protocol · first-order anomaly</div>
                      <h4 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">{corePerk.name}</h4>
                      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">{corePerk.description}</p>
                      <div className="mt-4 rounded-xl border border-fuchsia-200/15 bg-black/25 px-4 py-3">
                        <div className="text-[8px] font-black uppercase tracking-[.2em] text-fuchsia-200/70">Protocol output</div>
                        <div className="mt-1.5 text-sm font-extrabold leading-relaxed text-white">{corePerk.effect}</div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-fuchsia-200/15 bg-black/30 p-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Protocol rank</div>
                          <div className="mt-1 text-3xl font-black tabular-nums text-white">{coreLevel}<span className="text-lg text-slate-500">/{corePerk.maxLevel}</span></div>
                        </div>
                        <div className="text-right text-[9px] font-black uppercase tracking-widest text-fuchsia-200">{Math.floor(coreLevel / corePerk.maxLevel * 100)}% online</div>
                      </div>
                      <div className="mt-3 flex gap-1" role="progressbar" aria-label="Probability Debt research level" aria-valuemin={0} aria-valuemax={corePerk.maxLevel} aria-valuenow={coreLevel}>
                        {Array.from({ length: corePerk.maxLevel }, (_, segment) => <span key={segment} className={'h-2 min-w-0 flex-1 rounded-full ' + (segment < coreLevel ? 'bg-fuchsia-300 shadow-[0_0_9px_rgba(240,171,252,.45)]' : 'bg-slate-800')} />)}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[8px] font-black uppercase tracking-widest text-slate-600">Next rank</div>
                          <div className="mt-1 text-sm font-black tabular-nums text-white">{coreMaxed ? 'Complete' : formatNumber(coreCost) + ' RP'}</div>
                        </div>
                        <button type="button" onClick={() => buyPerk(corePerk.id)} disabled={!coreCanBuy} className="min-h-10 rounded-xl border border-fuchsia-200/25 bg-fuchsia-300/10 px-3 py-2 text-[9px] font-black tracking-[.1em] text-fuchsia-100 transition hover:bg-fuchsia-300/20 disabled:cursor-not-allowed disabled:opacity-35">
                          {busyAction === corePerk.id ? 'INSTALLING…' : coreMaxed ? 'MAX RANK' : 'INSTALL'}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {riftPerks.filter(perk => perk.id !== 'probabilityDebt').map((perk, index) => renderPerkNode(perk, index + 1, 'rift'))}
                </div>
              </section>

              <section className="relative isolate overflow-hidden rounded-[1.7rem] border border-amber-200/20 bg-gradient-to-r from-[#241a12] via-[#171320] to-[#11101d] p-5 sm:p-6">
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-amber-200/10 shadow-[0_0_0_24px_rgba(251,191,36,.025),0_0_0_52px_rgba(251,191,36,.02)]" />
                <div className="relative grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,.7fr)] lg:items-center">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[.24em] text-amber-300">Restricted protocol · one-time unlock</div>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-white">One-time unlocks</h3>
                    <h4 className="mt-3 text-lg font-black text-amber-100">{timelineFork.name}</h4>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">{timelineFork.description}</p>
                    <p className="mt-2 text-xs font-bold text-amber-200">{timelineFork.effect}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-200/15 bg-black/25 p-4">
                    <div className="flex items-center justify-center gap-2" aria-label={timelineUnlocked ? 'Three relic slots unlocked' : 'Two relic slots available, third slot locked'}>
                      <span className="h-9 w-9 rounded-xl border border-amber-200/40 bg-amber-200/15 shadow-[0_0_16px_rgba(251,191,36,.14)]" />
                      <span className="h-px w-5 bg-amber-200/30" />
                      <span className="h-9 w-9 rounded-xl border border-amber-200/40 bg-amber-200/15 shadow-[0_0_16px_rgba(251,191,36,.14)]" />
                      <span className="h-px w-5 bg-amber-200/30" />
                      <span className={'grid h-9 w-9 place-items-center rounded-xl border text-[9px] font-black ' + (timelineUnlocked ? 'border-amber-200/50 bg-amber-200/20 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,.2)]' : 'border-dashed border-slate-600 bg-slate-900/80 text-slate-500')}>
                        {timelineUnlocked ? 'III' : 'LOCK'}
                      </span>
                    </div>
                    <div className="mt-3 text-center text-[8px] font-black uppercase tracking-[.2em] text-slate-500">{timelineUnlocked ? 'Three relic slots online' : 'Third relic slot sealed'}</div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                      <div>
                        <div className="text-[8px] font-black uppercase tracking-widest text-slate-600">Unlock cost</div>
                        <div className="mt-1 text-sm font-black tabular-nums text-white">{timelineUnlocked ? 'Unlocked permanently' : formatNumber(timelineFork.cost) + ' RP'}</div>
                      </div>
                      <button type="button" onClick={() => buyUnlock(timelineFork.id)} disabled={!timelineCanBuy} className="min-h-10 rounded-xl border border-amber-200/25 bg-amber-200/10 px-4 py-2 text-[9px] font-black tracking-[.12em] text-amber-100 transition hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:opacity-35">
                        {busyAction === 'unlock-' + timelineFork.id ? 'UNLOCKING…' : timelineUnlocked ? 'INSTALLED' : 'UNLOCK'}
                      </button>
                    </div>
                    {!ascentCleared && <p className="mt-3 text-[9px] leading-relaxed text-amber-200/80">Complete Rift Ascent once to access restricted research.</p>}
                    {ascentCleared && isActive && !timelineUnlocked && <p className="mt-3 text-[9px] leading-relaxed text-amber-200/80">Finish or abandon the active run before changing your relic loadout capacity.</p>}
                  </div>
                </div>
              </section>
            </div>
          );
        })()}

        {activePanel === 'relics' && (
          <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-[#211b13] via-[#15131a] to-[#101629] p-5 shadow-xl shadow-slate-950/30 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Scrap + Rift Points</div>
            <h2 className="mt-1 text-2xl font-black text-white">The Relic Forge</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Forge permanent artifacts from salvaged gear and Rift energy. Each relic has three ranks and a unique mechanic. Equip up to {relicSlotLimit}; Timeline Fork permanently unlocks the third slot. Your loadout is locked for the duration of a run.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-xl border border-amber-300/20 bg-black/25 px-3 py-2 text-right">
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-200">Scrap</div>
              <div className="text-lg font-black tabular-nums text-white">{formatNumber(snapshot.scrapBalance)}</div>
            </div>
            <div className="rounded-xl border border-violet-300/20 bg-black/25 px-3 py-2 text-right">
              <div className="text-[9px] font-black uppercase tracking-widest text-violet-200">Rift Points</div>
              <div className="text-lg font-black tabular-nums text-white">{formatNumber(riftProjection.points)}</div>
            </div>
          </div>
        </div>

        {!archive.completedChallengeIds.includes(RIFT_ASCENT.id) ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4">
            <div className="text-sm font-black text-amber-100">Forge sealed</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Complete Rift Ascent at least once to unlock relic crafting and loadout slots. Both Scrap and Rift Points will be required for every rank.</p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Equipped for next run</div>
                <div className="mt-1 text-xs font-bold text-white">
                  {archive.equippedRiftRelics.length
                    ? archive.equippedRiftRelics.map(id => RIFT_RELICS[id].name).join(' · ')
                    : 'No relics equipped'}
                </div>
              </div>
              <div className="text-[10px] font-black tabular-nums text-amber-200">{archive.equippedRiftRelics.length}/{relicSlotLimit} SLOTS</div>
            </div>
            {isActive && (
              <p className="mt-3 rounded-lg border border-indigo-300/20 bg-indigo-400/[.06] px-3 py-2 text-[10px] text-indigo-200">
                Your current run is using its saved relic loadout. Forge and equipment changes become available after the run ends.
              </p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {Object.values(RIFT_RELICS).map(relic => {
                const level = archive.riftRelicLevels[relic.id] ?? 0;
                const maxed = level >= relic.maxLevel;
                const equipped = archive.equippedRiftRelics.includes(relic.id);
                const cost = riftRelicCost(relic.id, level);
                const canForge = !isActive && !maxed && riftProjection.points >= cost.riftPoints && snapshot.scrapBalance >= cost.scrap && busyAction === null;
                const canEquip = !isActive && level > 0 && (equipped || archive.equippedRiftRelics.length < relicSlotLimit) && busyAction === null;
                return (
                  <article key={relic.id} className={'rounded-2xl border p-4 ' + (equipped ? 'border-amber-300/35 bg-amber-200/[.06]' : 'border-slate-700/80 bg-slate-950/55')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-black text-white">{relic.name}</h3>
                          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200">Rank {level}/{relic.maxLevel}</span>
                          {equipped && <span className="rounded-md bg-amber-300/15 px-2 py-0.5 text-[9px] font-black text-amber-100">EQUIPPED</span>}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{relic.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{level > 0 ? 'Current effect' : 'Next rank'}</div>
                      <div className="mt-1 text-xs font-bold text-amber-100">{level > 0 ? relic.rankEffects[level - 1] : relic.rankEffects[0]}</div>
                      {level > 0 && !maxed && <div className="mt-1 text-[10px] text-slate-500">Next: {relic.rankEffects[level]}</div>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] leading-relaxed text-slate-400">
                        {maxed ? 'Fully reinforced' : <>Next rank: <span className="font-bold text-amber-100">{formatNumber(cost.scrap)} Scrap</span> + <span className="font-bold text-violet-200">{formatNumber(cost.riftPoints)} RP</span></>}
                      </div>
                      <div className="flex gap-2">
                        {level > 0 && (
                          <button type="button" onClick={() => equipRelic(relic.id, !equipped)} disabled={!canEquip}
                            className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[10px] font-black text-amber-100 hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-35">
                            {busyAction === 'equip-' + relic.id ? 'Saving…' : equipped ? 'Unequip' : archive.equippedRiftRelics.length >= relicSlotLimit ? 'Slots full' : 'Equip'}
                          </button>
                        )}
                        <button type="button" onClick={() => forgeRelic(relic.id)} disabled={!canForge}
                          className="rounded-lg border border-violet-300/25 bg-violet-400/10 px-3 py-2 text-[10px] font-black text-violet-100 hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-35">
                          {busyAction === 'forge-' + relic.id ? 'Forging…' : maxed ? 'MAX RANK' : level === 0 ? 'Forge' : 'Reinforce'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-violet-400" style={{ width: (level / relic.maxLevel * 100) + '%' }} />
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
          </div>
        )}
      </div>
    </section>
  );
};
