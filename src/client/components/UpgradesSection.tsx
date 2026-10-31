import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Zap,
  Dice5,
  Bot,
  Clover,
  Flame,
  Check,
  Lock,
  Coins,
  Gem,
  ArrowRight,
  TrendingUp,
  Percent,
  Sparkles,
  Clock,
  Layers,
  ShieldAlert,
  Star,
  CircleDot,
} from 'lucide-react';
import type { PlayerState, UpgradeId } from '../../shared/game.js';
import {
  upgradeCost,
  cooldownMs,
  rollsPerActivation,
  luckMultiplier,
  effectiveOfflineTickMs,
  critMultiplier,
  formatNumber,
  formatRarity,
} from '../../shared/game.js';
import { sound } from '../sound.js';

interface UpgradesSectionProps {
  state: PlayerState;
  onBuyUpgrade: (id: UpgradeId) => Promise<void>;
  onBuyAllUpgrades: () => Promise<void>;
  onActivateTurbo: () => Promise<void>;
  busy: boolean;
  compact?: boolean;
}

export const UpgradesSection: React.FC<UpgradesSectionProps> = ({
  state,
  onBuyUpgrade,
  onBuyAllUpgrades,
  onActivateTurbo,
  busy,
  compact = false,
}) => {
  const [recentUpgradeId, setRecentUpgradeId] = useState<UpgradeId | null>(null);
  const [upgradingAll, setUpgradingAll] = useState(false);
  const [upgradingId, setUpgradingId] = useState<UpgradeId | null>(null);
  const [activatingTurbo, setActivatingTurbo] = useState(false);
  const [autoBuyEnabled, setAutoBuyEnabled] = useState(() => {
    try { return window.localStorage.getItem('io-auto-buy-upgrades') === 'true'; }
    catch { return false; }
  });
  const autoBuyInFlightRef = useRef(false);
  const activatingTurboRef = useRef(false);
  const upgradeActionLockRef = useRef(false);
  const recentUpgradeTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (recentUpgradeTimerRef.current !== null) window.clearTimeout(recentUpgradeTimerRef.current);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('io-auto-buy-upgrades', String(autoBuyEnabled)); }
    catch { /* Storage is optional inside embedded webviews. */ }
  }, [autoBuyEnabled]);
  const allowMotionEffects = () =>
    typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reducedMotion = !allowMotionEffects();
  const fmt = (n: number) => formatNumber(n);
  const standardUpgradeMaxLevels: Partial<Record<UpgradeId, number>> = { speed: 20, offlineRate: 8 };

  const handleUpgradeClick = async (u: (typeof upgradesData)[0]) => {
    if (busy || upgradeActionLockRef.current || autoBuyInFlightRef.current) return;
    upgradeActionLockRef.current = true;
    setUpgradingId(u.id);
    sound.playLevelUpFanfare();
    if (recentUpgradeTimerRef.current !== null) window.clearTimeout(recentUpgradeTimerRef.current);
    setRecentUpgradeId(u.id);
    recentUpgradeTimerRef.current = window.setTimeout(() => {
      setRecentUpgradeId(null);
      recentUpgradeTimerRef.current = null;
    }, 900);

    const nextLvl = u.level + 1;
    if (!reducedMotion && (nextLvl % 5 === 0 || (u.id === 'auto' && nextLvl === 1))) {
      if (allowMotionEffects()) confetti({
        particleCount: 45,
        spread: 55,
        origin: { y: 0.65 },
        colors: ['#fbbf24', '#f59e0b', '#38bdf8', '#34d399', '#c084fc'],
      });
    }

    try {
      await onBuyUpgrade(u.id);
    } finally {
      upgradeActionLockRef.current = false;
      setUpgradingId(null);
    }
  };

  const handleUpgradeAllClick = async () => {
    if (busy || upgradeActionLockRef.current || autoBuyInFlightRef.current) return;
    upgradeActionLockRef.current = true;
    setUpgradingAll(true);
    sound.playLevelUpFanfare();
    if (allowMotionEffects()) confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#fbbf24', '#38bdf8', '#a855f7'],
    });
    try {
      await onBuyAllUpgrades();
    } finally {
      upgradeActionLockRef.current = false;
      setUpgradingAll(false);
    }
  };

  const currentCd = cooldownMs(state);
  const nextCd = cooldownMs({ ...state, upgrades: { ...state.upgrades, speed: (state.upgrades.speed ?? 0) + 1 } });
  const currentMulti = rollsPerActivation(state);
  const nextMulti = currentMulti + 1;
  const currentLuckMultiplier = luckMultiplier(state);
  const nextLuckMultiplier = luckMultiplier({
    ...state,
    upgrades: { ...state.upgrades, luck: (state.upgrades.luck ?? 0) + 1 },
  });

  const manualRolls = Math.min(3, state.manualRolls ?? 0);
  const isAutoUnlocked = manualRolls >= 3;

  const currentCoinBonusPct = (state.upgrades.coinBonus ?? 0) * 15;
  const currentShardChancePct = ((state.upgrades.shardChance ?? 0) * 0.075).toFixed(3);
  const currentXpBonusPct = (state.upgrades.xpBonus ?? 0) * 20;
  const currentCritChancePct = (state.upgrades.critChance ?? 0) * 3;

  const currentCritPower = critMultiplier(state).toFixed(2);
  const nextCritPower = (critMultiplier({
    ...state,
    upgrades: { ...state.upgrades, critPower: (state.upgrades.critPower ?? 0) + 1 },
  })).toFixed(2);

  const currentOfflineSec = Math.round(effectiveOfflineTickMs(state) / 1000);
  const nextOfflineSec = Math.round(
    effectiveOfflineTickMs({
      ...state,
      upgrades: { ...state.upgrades, offlineRate: (state.upgrades.offlineRate ?? 0) + 1 },
    }) / 1000
  );

  const currentValueBonusPct = (state.upgrades.valueBonus ?? 0) * 10;

  const upgradesData: {
    id: UpgradeId;
    title: string;
    icon: React.ReactNode;
    level: number;
    currentVal: string;
    nextVal: string;
    desc: string;
    cost: number;
    locked?: boolean;
    lockMsg?: string;
  }[] = [
    {
      id: 'speed',
      title: 'Roll Speed',
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      level: state.upgrades.speed ?? 0,
      currentVal: `${(currentCd / 1000).toFixed(1)}s`,
      nextVal: `${(nextCd / 1000).toFixed(1)}s`,
      desc: '20 levels total. Each level reduces cooldown by 0.15 seconds, up to 3.0 seconds from this upgrade. Other speed bonuses may reduce it further.',
      cost: upgradeCost('speed', state.upgrades.speed ?? 0),
    },
    {
      id: 'multi',
      title: 'Multi Roll',
      icon: <Dice5 className="w-5 h-5 text-purple-400" />,
      level: state.upgrades.multi ?? 0,
      currentVal: `${currentMulti} Balls`,
      nextVal: `${nextMulti} Balls`,
      desc: 'Linear progression: +1 extra ball rolled per level.',
      cost: upgradeCost('multi', state.upgrades.multi ?? 0),
    },
    {
      id: 'clusterRoll',
      title: 'Orb Array Matrix',
      icon: <CircleDot className="w-5 h-5 text-cyan-400" />,
      level: state.upgrades.clusterRoll ?? 0,
      currentVal: `+${state.upgrades.clusterRoll ?? 0} Balls`,
      nextVal: `+${(state.upgrades.clusterRoll ?? 0) + 1} Balls`,
      desc: 'Secondary multi-roll engine: adds +1 additional ball per level.',
      cost: upgradeCost('clusterRoll', state.upgrades.clusterRoll ?? 0),
    },
    {
      id: 'luck',
      title: 'Luck Multiplier',
      icon: <Clover className="w-5 h-5 text-emerald-400" />,
      level: state.upgrades.luck ?? 0,
      currentVal: `${currentLuckMultiplier.toFixed(2)}×`,
      nextVal: `${nextLuckMultiplier.toFixed(2)}×`,
      desc: '+5% Luck per level. Luck sources combine into one total before RNG diminishing returns.',
      cost: upgradeCost('luck', state.upgrades.luck ?? 0),
    },
    {
      id: 'auto',
      title: 'Auto Roll',
      icon: <Bot className="w-5 h-5 text-cyan-400" />,
      level: state.upgrades.auto ?? 0,
      currentVal: isAutoUnlocked ? 'Unlocked' : 'Locked',
      nextVal: isAutoUnlocked ? 'Active' : '3 Manual Rolls',
      desc: 'Rolls automatically when cooldown finishes. Unlocks automatically after 3 manual rolls.',
      cost: isAutoUnlocked ? Infinity : 0,
      locked: !isAutoUnlocked,
      lockMsg: isAutoUnlocked ? undefined : `Unlocks after 3 manual rolls (${manualRolls}/3)`,
    },
    {
      id: 'coinBonus',
      title: 'Coin Bonus',
      icon: <TrendingUp className="w-5 h-5 text-yellow-400" />,
      level: state.upgrades.coinBonus ?? 0,
      currentVal: `+${currentCoinBonusPct}%`,
      nextVal: `+${currentCoinBonusPct + 15}%`,
      desc: '+15% coins earned per level.',
      cost: upgradeCost('coinBonus', state.upgrades.coinBonus ?? 0),
    },
    {
      id: 'shardChance',
      title: 'Shard Drop Chance',
      icon: <Gem className="w-5 h-5 text-cyan-400" />,
      level: state.upgrades.shardChance ?? 0,
      currentVal: `${currentShardChancePct}%`,
      nextVal: `${(((state.upgrades.shardChance ?? 0) + 1) * 0.075).toFixed(3)}%`,
      desc: '+0.075 percentage points of Shard proc chance per level, before other reduced bonuses.',
      cost: upgradeCost('shardChance', state.upgrades.shardChance ?? 0),
    },
    {
      id: 'xpBonus',
      title: 'XP Bonus',
      icon: <Sparkles className="w-5 h-5 text-indigo-400" />,
      level: state.upgrades.xpBonus ?? 0,
      currentVal: `+${currentXpBonusPct}%`,
      nextVal: `+${currentXpBonusPct + 20}%`,
      desc: '+20% player XP per roll per level.',
      cost: upgradeCost('xpBonus', state.upgrades.xpBonus ?? 0),
    },
    {
      id: 'critChance',
      title: 'Critical Chance',
      icon: <Percent className="w-5 h-5 text-rose-400" />,
      level: state.upgrades.critChance ?? 0,
      currentVal: `${currentCritChancePct}%`,
      nextVal: `${currentCritChancePct + 3}%`,
      desc: '+3% chance for a critical roll per level.',
      cost: upgradeCost('critChance', state.upgrades.critChance ?? 0),
    },
    {
      id: 'critPower',
      title: 'Critical Rarity Multiplier',
      icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
      level: state.upgrades.critPower ?? 0,
      currentVal: `${currentCritPower}×`,
      nextVal: `${nextCritPower}×`,
      desc: '+0.25× rarity multiplier on critical rolls per level; this increases critical strength, not critical chance.',
      cost: upgradeCost('critPower', state.upgrades.critPower ?? 0),
    },
    {
      id: 'offlineRate',
      title: 'Offline Generation Speed',
      icon: <Clock className="w-5 h-5 text-teal-400" />,
      level: state.upgrades.offlineRate ?? 0,
      currentVal: `1 roll / ${currentOfflineSec}s`,
      nextVal: `1 roll / ${nextOfflineSec}s`,
      desc: 'Each level makes offline rolls 8% faster, up to a 60% interval reduction at Level 8. This upgrade is capped at Level 8.',
      cost: upgradeCost('offlineRate', state.upgrades.offlineRate ?? 0),
    },
    {
      id: 'valueBonus',
      title: 'Value Multiplier',
      icon: <Layers className="w-5 h-5 text-fuchsia-400" />,
      level: state.upgrades.valueBonus ?? 0,
      currentVal: `+${currentValueBonusPct}%`,
      nextVal: `+${currentValueBonusPct + 10}%`,
      desc: '+10% collection value from all rolls per level.',
      cost: upgradeCost('valueBonus', state.upgrades.valueBonus ?? 0),
    },
  ];

  const affordableCount = upgradesData.filter(u => !u.locked && Number.isFinite(u.cost) && state.coins >= u.cost).length;
  useEffect(() => {
    if (!autoBuyEnabled || busy || upgradingAll || upgradingId !== null || autoBuyInFlightRef.current) return;
    const candidate = upgradesData
      .filter(u => {
        const maxLevel = standardUpgradeMaxLevels[u.id];
        return !u.locked && Number.isFinite(u.cost) && state.coins >= u.cost &&
          (maxLevel === undefined || u.level < maxLevel);
      })
      .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0];
    if (!candidate) return;
    autoBuyInFlightRef.current = true;
    void onBuyUpgrade(candidate.id)
      .catch(() => { /* A failed purchase leaves Auto-buy enabled but retries only after the next state change. */ })
      .finally(() => { autoBuyInFlightRef.current = false; });
  }, [autoBuyEnabled, busy, upgradingAll, upgradingId, state.coins, state.upgrades, onBuyUpgrade]);
  const turboNow = Date.now();
  const turboRemainingMs = Math.max(0, (state.turboRollUntil ?? 0) - turboNow);
  const isTurboActive = turboRemainingMs > 0;
  const turboRemainingLabel = Math.floor(turboRemainingMs / 60_000) + 'm ' + String(Math.floor((turboRemainingMs % 60_000) / 1000)).padStart(2, '0') + 's';
  const upgradeGroups: { title: string; subtitle: string; ids: UpgradeId[] }[] = [
    { title: 'Roll controls', subtitle: 'Change roll cadence and the number of Orbs each activation produces.', ids: ['speed', 'multi', 'clusterRoll', 'auto'] },
    { title: 'Rarity and criticals', subtitle: 'Improve rarity odds and make critical rolls stronger.', ids: ['luck', 'critChance', 'critPower'] },
    { title: 'Rewards and value', subtitle: 'Earn more Coins, Shards, XP and collection value.', ids: ['coinBonus', 'shardChance', 'xpBonus', 'valueBonus'] },
    { title: 'Offline progress', subtitle: 'Improve the rate at which rolls accumulate while you are away.', ids: ['offlineRate'] },
  ];

  if (compact) {
    const featuredIds: UpgradeId[] = ['luck', 'multi', 'speed', 'coinBonus'];
    const featuredUpgrades = featuredIds
      .map(id => upgradesData.find(upgrade => upgrade.id === id))
      .filter(Boolean) as typeof upgradesData;

    return (
      <section className="io-inline-upgrade-shop" aria-label="Quick upgrade shop">
        <header className="io-inline-upgrade-head">
          <div>
            <div className="io-inline-upgrade-kicker"><Zap className="w-3.5 h-3.5" /> UPGRADE SHOP</div>
            <div className="io-inline-upgrade-balance"><Coins className="w-4 h-4" /> {fmt(state.coins)} <span>COINS</span></div>
          </div>
          <div className="io-inline-upgrade-count">{affordableCount} READY</div>
        </header>

        <div className="io-inline-upgrade-list">
          {featuredUpgrades.map(u => {
            const maxLevel = standardUpgradeMaxLevels[u.id];
            const isMaxed = maxLevel !== undefined ? u.level >= maxLevel : !Number.isFinite(u.cost);
            const canAfford = !isMaxed && !u.locked && Number.isFinite(u.cost) && state.coins >= u.cost;
            const isUpgraded = recentUpgradeId === u.id;

            return (
              <article
                key={u.id}
                className={"io-inline-upgrade-row" + (canAfford ? " is-affordable" : "") + (isUpgraded ? " is-upgraded" : "")}
                title={u.desc}
              >
                <div className="io-inline-upgrade-identity">
                  <span className="io-inline-upgrade-icon">{u.icon}</span>
                  <span className="io-inline-upgrade-name">
                    <strong>{u.title}</strong>
                    <small>LV {u.level} · {u.currentVal} <ArrowRight className="inline w-3 h-3" /> <b>{u.nextVal}</b></small>
                  </span>
                </div>
                <button
                  type="button"
                  className="io-inline-upgrade-buy"
                  onClick={() => { void handleUpgradeClick(u); }}
                  disabled={!canAfford || busy || upgradingAll || upgradingId !== null}
                  aria-label={isMaxed ? u.title + " fully upgraded" : "Buy " + u.title + " for " + fmt(u.cost) + " Coins"}
                >
                  {isMaxed ? 'MAX' : upgradingId === u.id ? '…' : fmt(u.cost)}
                </button>
              </article>
            );
          })}
        </div>

        <footer className="io-inline-upgrade-footer">
          <label title="Automatically buy the cheapest affordable standard upgrade after each purchase.">
            <input
              type="checkbox"
              checked={autoBuyEnabled}
              disabled={busy || upgradingAll}
              onChange={event => setAutoBuyEnabled(event.target.checked)}
            />
            <span>Auto-buy</span>
          </label>
          <button
            type="button"
            onClick={handleUpgradeAllClick}
            disabled={affordableCount === 0 || busy || upgradingAll || upgradingId !== null}
          >
            {upgradingAll ? 'Buying…' : 'Buy all affordable'}
          </button>
        </footer>
      </section>
    );
  }

  return (
    <div className="io-page-shell io-page-upgrades max-w-4xl mx-auto space-y-6">
      {/* Header Info & Stats Bar */}
      <div className="io-page-hero bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">Upgrades</h2>
              <Star className="w-4 h-4 text-amber-400 fill-current animate-spin" style={{ animationDuration: '16s' }} />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Spend Coins on upgrades. Each card shows its current value, next value, and cost. Buy All Affordable buys as many upgrade levels as your Coins allow.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label title="When enabled, the game automatically buys affordable standard upgrades as you roll." className="flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-xs font-bold text-slate-200">
              <input
                type="checkbox"
                checked={autoBuyEnabled}
                disabled={busy || upgradingAll}
                onChange={event => setAutoBuyEnabled(event.target.checked)}
                aria-label="Automatically buy affordable upgrades"
                className="accent-cyan-400"
              />
              <span>Auto-buy {autoBuyEnabled ? 'On' : 'Off'}</span>
            </label>
            {/* Upgrade All Button */}
            <button
              type="button"
              onClick={handleUpgradeAllClick}
              disabled={affordableCount === 0 || busy || upgradingAll || upgradingId !== null}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md ${
                affordableCount > 0
                  ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 text-slate-950 hover:brightness-110 active:scale-95 cursor-pointer shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{upgradingAll ? 'Buying…' : `Buy All Affordable${affordableCount > 0 ? ` · ${affordableCount} types` : ''}`}</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{fmt(state.coins)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1.5 rounded-xl">
              <Gem className="w-4 h-4 text-cyan-400" />
              <span>{fmt(state.shards ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Live Active Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
              Roll Cooldown
            </span>
            <span className="text-sm font-black text-amber-300 font-mono">
              {(currentCd / 1000).toFixed(1)}s
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
              Orbs per roll
            </span>
            <span className="text-sm font-black text-purple-300 font-mono">
              {currentMulti} Orbs / roll
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
              Total Luck
            </span>
            <span className="text-sm font-black text-emerald-300 font-mono">
              {currentLuckMultiplier.toFixed(2)}×
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
              Crit Stats
            </span>
            <span className="text-sm font-black text-rose-300 font-mono">
              {currentCritChancePct}% ({currentCritPower}×)
            </span>
          </div>
        </div>
      </div>

      {/* Related upgrades are grouped for easier comparison. */}
      <div className="space-y-5">
        {upgradeGroups.map(group => {
          const groupUpgrades = upgradesData.filter(u => group.ids.includes(u.id));
          return (
            <section key={group.title} className="rounded-2xl border border-slate-800 bg-slate-950/30 p-3 sm:p-4 space-y-3" aria-label={group.title}>
              <header>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-200">{group.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{group.subtitle}</p>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groupUpgrades.map(u => {
          const maxLevel = standardUpgradeMaxLevels[u.id];
          const isAutoOwned = u.id === 'auto' && isAutoUnlocked;
          const isMaxed = u.id === 'auto' ? false : maxLevel !== undefined ? u.level >= maxLevel : !Number.isFinite(u.cost);
          const canAfford = !isMaxed && Number.isFinite(u.cost) && state.coins >= u.cost;
          const isUpgraded = recentUpgradeId === u.id;

          return (
            <div
              key={u.id}
              className={`bg-slate-900/90 border rounded-2xl p-4 flex flex-col justify-between transition-all duration-300 shadow-md space-y-3 relative overflow-hidden ${
                isUpgraded
                  ? 'border-amber-400 ring-2 ring-amber-400/60 shadow-[0_0_30px_rgba(251,191,36,0.35)] scale-[1.02] animate-upgrade-burst'
                  : isMaxed
                    ? 'border-slate-700/80 opacity-90 grayscale-[0.15]'
                    : 'border-slate-800 hover:border-slate-700/80'
              }`}
            >
              {/* Floating Level Up Celebration Tag */}
              {isUpgraded && (
                <div className="absolute top-2 right-3 z-20 animate-float-up pointer-events-none">
                  <span className="bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 font-black text-[11px] px-2.5 py-0.5 rounded-full shadow-lg border border-amber-100 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 fill-current text-slate-950" />
                    <span>LEVEL UP!</span>
                  </span>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                      {u.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">{u.title}</h3>
                      <span className="text-[11px] font-bold text-slate-400">
                        Level {u.level}
                      </span>
                    </div>
                  </div>

                  {/* Value Delta */}
                  <div className="text-right text-xs">
                    <div className="flex items-center gap-1 font-mono font-bold text-slate-300">
                      <span>{u.currentVal}</span>
                      {!isMaxed && !isAutoOwned && (
                        <>
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          <span className="text-cyan-400">{u.nextVal}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                  {u.desc}
                </p>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                {u.locked ? (
                  <button
                    type="button"
                    disabled
                    className="w-full bg-slate-950 border border-slate-800 text-slate-500 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{u.lockMsg}</span>
                  </button>
                ) : isAutoOwned ? (
                  <button type="button" disabled className="w-full bg-emerald-950/30 border border-emerald-500/20 text-emerald-300 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-default">
                    <Check className="w-3.5 h-3.5" />
                    <span>Auto Roll Unlocked Automatically</span>
                  </button>
                ) : isMaxed ? (
                  <button
                    type="button"
                    disabled
                    title="This upgrade has reached its maximum level."
                  className="w-full bg-slate-900 border border-slate-800 text-slate-500 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                  >
                    <Check className="w-3.5 h-3.5 text-slate-500" />
                    <span>Fully Upgraded</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-busy={upgradingId === u.id}
                    onClick={() => {
                      void handleUpgradeClick(u);
                    }}
                    disabled={!canAfford || busy || upgradingAll || upgradingId !== null}
                    className={`w-full font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all ${
                      canAfford
                        ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 shadow-lg shadow-amber-900/20 active:scale-95 cursor-pointer'
                        : 'bg-slate-800/80 text-slate-500 cursor-not-allowed border border-slate-700/40'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>{canAfford ? `Upgrade (${fmt(u.cost)} Coins)` : `Need ${fmt(Math.max(0, u.cost - state.coins))} more Coins`}</span>
                  </button>
                )}
              </div>
            </div>
          );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Turbo Booster */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-indigo-500/20 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Flame className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Turbo Booster</h3>
              <p className="text-xs text-slate-400">
                Reduces roll cooldown by 25% for 30 minutes, or 35% for 60 minutes with Chrono Overdrive.
              </p>
              {isTurboActive && <p className="text-xs font-bold text-amber-300" role="status" aria-live="polite">Active · {turboRemainingLabel} remaining</p>}
            </div>
          </div>

          <button
            type="button"
            title="Spend 5 Shards to reduce roll cooldown; the duration and strength depend on your upgrades."
            aria-busy={activatingTurbo}
            onClick={async () => {
              if (activatingTurboRef.current || busy || upgradingAll || upgradeActionLockRef.current) return;
              activatingTurboRef.current = true;
              setActivatingTurbo(true);
              sound.playClick();
              try {
                await onActivateTurbo();
              } finally {
                activatingTurboRef.current = false;
                setActivatingTurbo(false);
              }
            }}
            disabled={(state.shards ?? 0) < 5 || isTurboActive || activatingTurbo || busy || upgradingAll || upgradingId !== null}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              isTurboActive
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-default'
                : (state.shards ?? 0) >= 5
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-lg active:scale-95 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Gem className="w-3.5 h-3.5 text-cyan-300" />
            <span>{isTurboActive ? 'Booster Active' : 'Activate (5 Shards)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
