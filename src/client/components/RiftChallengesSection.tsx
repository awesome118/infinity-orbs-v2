import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_RIFT_CHALLENGES,
  DEFAULT_RIFT_MODIFIERS,
  RIFT_ASCENT,
  RIFT_CHALLENGE_UPGRADES,
  RIFT_PERKS,
  RIFT_UNLOCKS,
  normalizeRiftChallengeToggles,
  normalizeRiftModifierSettings,
  riftModifierFromSliderPosition,
  riftModifierSliderPosition,
  getRiftChallengeDefinition,
  riftChallengeUpgradeCost,
  riftModifierRewardPreview,
  riftRatePerHour,
  riftPerkCost,
  type RiftChallengeSnapshot,
  type RiftChallengeUpgradeId,
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
  { id: 'upgradeInflation', name: 'Upgrade Inflation', description: 'Raises the Coin price of temporary Rift upgrades.', effect: 'Upgrade costs × multiplier' },
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
  onEnterGame?: () => void;
  onExit?: () => void;
  onRefreshPlayer?: () => void;
}> = ({ onEnterGame, onExit, onRefreshPlayer }) => {
  const [snapshot, setSnapshot] = useState<RiftChallengeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [activePanel, setActivePanel] = useState<'run' | 'upgrades' | 'relics'>('run');
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
  const buyUpgrade = (id: RiftChallengeUpgradeId) => void performAction(
    id, '/api/rift-challenges/upgrade', { upgradeId: id, runId: run?.runId },
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

      <nav className="grid grid-cols-3 gap-2 rounded-2xl border border-violet-300/15 bg-slate-950/60 p-1.5" aria-label="Rift menu">
        <button
          type="button"
          onClick={() => setActivePanel('run')}
          aria-pressed={activePanel === 'run'}
          className={'rounded-xl border px-3 py-3 text-left transition ' + (activePanel === 'run' ? 'border-violet-300/35 bg-violet-400/15 text-white shadow-inner shadow-violet-400/10' : 'border-transparent text-slate-400 hover:bg-white/[.04] hover:text-slate-200')}
        >
          <span className="block text-xs font-black uppercase tracking-[.14em]">Run</span>
          <span className="mt-1 block text-[9px] font-medium text-current/70">{isActive ? 'Continue active run' : 'Configure and launch'}</span>
        </button>
        <button
          type="button"
          onClick={() => setActivePanel('upgrades')}
          aria-pressed={activePanel === 'upgrades'}
          className={'rounded-xl border px-3 py-3 text-left transition ' + (activePanel === 'upgrades' ? 'border-cyan-300/35 bg-cyan-300/10 text-white shadow-inner shadow-cyan-300/10' : 'border-transparent text-slate-400 hover:bg-white/[.04] hover:text-slate-200')}
        >
          <span className="block text-xs font-black uppercase tracking-[.14em]">Upgrades</span>
          <span className="mt-1 block text-[9px] font-medium text-current/70">Permanent perks and research</span>
        </button>
        <button
          type="button"
          onClick={() => setActivePanel('relics')}
          aria-pressed={activePanel === 'relics'}
          className={'rounded-xl border px-3 py-3 text-left transition ' + (activePanel === 'relics' ? 'border-amber-300/35 bg-amber-300/10 text-white shadow-inner shadow-amber-300/10' : 'border-transparent text-slate-400 hover:bg-white/[.04] hover:text-slate-200')}
        >
          <span className="block text-xs font-black uppercase tracking-[.14em]">Relics</span>
          <span className="mt-1 block text-[9px] font-medium text-current/70">{archive.equippedRiftRelics.length}/{relicSlotLimit} equipped · Forge</span>
        </button>
      </nav>

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
              <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-cyan-200">Every run starts with +1 free Multiball.</p>
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
      {run && (
        <section className="rounded-3xl border border-indigo-400/25 bg-slate-900/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-indigo-300">
                {isCompleted ? 'Rift run completed' : runIsLegacyChallenge ? 'Legacy trial in progress' : 'Active Rift save'}
              </div>
              <h2 className="mt-1 text-2xl font-black text-white">{runIsLegacyChallenge ? ((challenge?.name ?? 'Legacy trial') + ' · legacy save') : RIFT_ASCENT.name}</h2>
              <p className="mt-1 text-xs text-slate-500">Started {new Date(run.startedAt).toLocaleString()} · Isolated Rift player save</p>
            </div>
            {isActive && (
              <button
                type="button"
                onClick={() => setConfirmAbandon(true)}
                disabled={busyAction !== null}
                className="rounded-lg border border-rose-500/25 px-3 py-2 text-[11px] font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
              >
                Abandon run
              </button>
            )}
          </div>

          {confirmAbandon && (
            <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/5 p-4" role="alertdialog" aria-label="Confirm abandoning this Rift run">
              <div className="text-sm font-black text-white">Abandon this Rift run?</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">The isolated Rift player save will be discarded. Your main save, Rift Points, permanent perks, and completed records will remain unchanged.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void performAction('abandon', '/api/rift-challenges/abandon', { runId: run.runId })} disabled={busyAction !== null} className="rounded-lg bg-rose-500 px-3 py-2 text-[10px] font-black text-white hover:bg-rose-400 disabled:opacity-40">
                  {busyAction === 'abandon' ? 'Abandoning…' : 'Confirm abandon'}
                </button>
                <button type="button" onClick={() => setConfirmAbandon(false)} disabled={busyAction !== null} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40">Keep playing</button>
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Rift Coins</div>
              <div className="mt-1 text-xl font-black tabular-nums text-amber-200">{formatNumber(run.coins)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Rolls</div>
              <div className="mt-1 text-xl font-black tabular-nums text-white">{formatNumber(run.totalRolls)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Selected best</div>
              <div className="mt-1 text-xl font-black tabular-nums text-cyan-200">{formatRarity(run.bestRarity)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Objective</div>
              <div className="mt-1 text-xl font-black tabular-nums text-white">1/{formatRarity(runTarget)}</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span>Rift objective progress</span><span>{Math.floor(progressPercent)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-950">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all" style={{ width: progressPercent + '%' }} />
            </div>
          </div>

          {run.lastRoll && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-cyan-300">Latest result</div>
                <div className="mt-1 text-lg font-black text-white">1 / {formatRarity(run.lastRoll.rarity)} {run.lastRoll.isCritical ? '· CRITICAL' : ''}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-amber-200">+{formatNumber(run.lastRoll.coinsGained)} Coins</div>
                <div className="text-[10px] text-slate-500">Rift wallet only</div>
              </div>
            </div>
          )}

          {isActive && (
            <>
              <div className="mt-5 rounded-xl border border-violet-400/20 bg-violet-400/5 p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-violet-300">Rift game active</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  Normal game menus now read and write this isolated Rift save. Your main save remains untouched. Complete the selected rarity objective to earn the previewed Rift Point reward.
                </p>
                <button
                  type="button"
                  onClick={() => onEnterGame?.()}
                  disabled={busyAction !== null || !onEnterGame}
                  className="mt-3 min-h-12 w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-violet-950/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ENTER RIFT GAME
                </button>
              </div>

              <div className="mt-6">
                <div className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">Temporary Rift upgrades</div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(['fortune', 'speed', 'prosperity', 'critical'] as RiftChallengeUpgradeId[]).map(id => {
                    const definition = RIFT_CHALLENGE_UPGRADES[id];
                    const unlocked = snapshot.mechanicUnlocks[id] === true;
                    const level = run.upgradeLevels[id] ?? 0;
                    const maxed = level >= definition.maxLevel;
                    const inflation = run.modifierSettings?.upgradeInflation ?? 1;
                    const cost = Math.ceil(riftChallengeUpgradeCost(id, level, run.totalRolls) * inflation);
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
                          <button type="button" onClick={() => buyUpgrade(id)} disabled={!unlocked || maxed || run.coins < cost || busyAction !== null} className="rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-[10px] font-black text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-30">
                            {busyAction === id ? 'Buying…' : maxed ? 'MAXED' : 'UPGRADE'}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-600">Modifier-based Upgrade Inflation is included in the displayed price. The price also retains the existing per-10-roll Dimensional Tax.</p>
              </div>
            </>
          )}

          {isCompleted && (
            <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Objective achieved</div>
              <h3 className="mt-1 text-xl font-black text-white">{runIsLegacyChallenge ? (challenge?.name ?? 'Legacy trial') + ' cleared.' : 'Rift Ascent cleared.'}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                The completion reward was credited using the difficulty settings captured when this run began. Adjust the configuration above and start another ascent.
              </p>
            </div>
          )}
        </section>
      )}
          </div>
        )}

        {activePanel === 'upgrades' && (
          <div className="space-y-5">
      <section className="rounded-3xl border border-violet-400/20 bg-slate-900/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.2em] text-violet-300">Permanent upgrades</div>
            <h2 className="mt-1 text-xl font-black text-white">Rift Point shop</h2>
            <p className="mt-1 text-xs text-slate-400">These perks persist across runs and sessions. Main-game perks affect ordinary rolls outside the Rift.</p>
          </div>
          <div className="rounded-xl border border-violet-300/20 bg-violet-400/5 px-3 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-widest text-violet-200">Available</div>
            <div className="text-xl font-black tabular-nums text-white">{formatNumber(riftProjection.points)} RP</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {(['main-game', 'rift'] as const).map(category => (
            <div key={category}>
              <div className="mb-3 flex items-center gap-2 border-b border-slate-700/70 pb-2">
                {category === 'main-game' ? <ArrowUpRight className="h-4 w-4 text-cyan-300" /> : <Zap className="h-4 w-4 text-violet-300" />}
                <h3 className="text-xs font-black uppercase tracking-[.16em] text-slate-200">
                  {category === 'main-game' ? 'Main-game perks' : 'Rift-only perks'}
                </h3>
              </div>
              <div className="space-y-2">
                {Object.values(RIFT_PERKS).filter(perk => perk.category === category).map(perk => {
                  const level = archive.riftPerkLevels[perk.id] ?? 0;
                  const maxed = level >= perk.maxLevel;
                  const cost = riftPerkCost(perk.id, level);
                  const canBuy = !maxed && riftProjection.points >= cost && busyAction === null;
                  return (
                    <article key={perk.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-black text-white">{perk.name}</h4>
                            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[9px] font-black text-slate-400">Lv {level}/{perk.maxLevel}</span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{perk.description}</p>
                          <p className="mt-1 text-[10px] font-bold text-cyan-200">{perk.effect}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => buyPerk(perk.id)}
                          disabled={!canBuy}
                          className="min-w-24 rounded-lg border border-violet-300/25 bg-violet-500/10 px-3 py-2 text-[10px] font-black text-violet-100 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {busyAction === perk.id ? 'Buying…' : maxed ? 'MAXED' : cost + ' RP'}
                        </button>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: (level / perk.maxLevel * 100) + '%' }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-cyan-300/20 bg-slate-900/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Permanent research</div>
            <h2 className="mt-1 text-xl font-black text-white">One-time unlocks</h2>
            <p className="mt-1 text-xs text-slate-400">These purchases permanently unlock new Rift options. They do not consume a relic rank or equipment slot.</p>
          </div>
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/5 px-3 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Available</div>
            <div className="text-xl font-black tabular-nums text-white">{formatNumber(riftProjection.points)} RP</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Object.values(RIFT_UNLOCKS).map(unlock => {
            const unlocked = archive.riftUnlocks[unlock.id] === true;
            const canBuy = !unlocked && !isActive && archive.completedChallengeIds.includes(RIFT_ASCENT.id) && riftProjection.points >= unlock.cost && busyAction === null;
            return (
              <article key={unlock.id} className={'rounded-2xl border p-4 ' + (unlocked ? 'border-cyan-300/30 bg-cyan-300/[.05]' : 'border-slate-700 bg-slate-950/55')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-white">{unlock.name}</h3>
                  <span className="rounded-md bg-slate-800 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">{unlocked ? 'UNLOCKED' : 'ONE-TIME'}</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{unlock.description}</p>
                <p className="mt-2 text-[10px] font-bold text-cyan-200">{unlock.effect}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500">{unlocked ? 'Permanent unlock' : formatNumber(unlock.cost) + ' Rift Points'}</span>
                  <button type="button" onClick={() => buyUnlock(unlock.id)} disabled={!canBuy}
                    className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-[10px] font-black text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-35">
                    {busyAction === 'unlock-' + unlock.id ? 'Unlocking…' : unlocked ? 'UNLOCKED' : 'UNLOCK'}
                  </button>
                </div>
                {!archive.completedChallengeIds.includes(RIFT_ASCENT.id) && <p className="mt-2 text-[10px] text-amber-300">Complete Rift Ascent to unlock permanent research.</p>}
              </article>
            );
          })}
        </div>
      </section>
          </div>
        )}

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
