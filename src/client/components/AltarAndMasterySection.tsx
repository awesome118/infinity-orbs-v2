import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Flame,
  Sparkles,
  Coins,
  Gem,
  Clover,
  Clock,
  Zap,
  TrendingUp,
  Award,
  Shield,
  HelpCircle,
  ChevronRight,
  Star,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import type { PlayerState, MasterySkillId } from '../../shared/game.js';
import {
  formatNumber,
  MASTERY_SKILLS,
  masterySkillCost,
  luckMultiplier,
} from '../../shared/game.js';
import { sound } from '../sound.js';

interface AltarAndMasterySectionProps {
  state: PlayerState;
  onSacrifice: (coins: number, shards: number) => Promise<void>;
  onUpgradeMastery: (skillId: MasterySkillId) => Promise<void>;
  busy: boolean;
  now: number;
}

export const AltarAndMasterySection: React.FC<AltarAndMasterySectionProps> = ({
  state,
  onSacrifice,
  onUpgradeMastery,
  busy,
  now,
}) => {
  const fmt = (n: number) => formatNumber(Number.isFinite(n) ? n : 0);
  const actionLockRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const [localActionError, setLocalActionError] = useState('');

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const allowMotionEffects = () =>
    typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Sacrifice Altar stats
  const coinsSacrificed = state.sacrifices?.coinsSacrificed ?? 0;
  const shardsSacrificed = state.sacrifices?.shardsSacrificed ?? 0;
  const altarLevel = state.sacrifices?.altarLevel ?? 0;
  const luckSurgeUntil = state.sacrifices?.luckSurgeUntil ?? 0;
  const isSurgeActive = luckSurgeUntil > now;
  const surgeRemainSec = Math.max(0, Math.ceil((luckSurgeUntil - now) / 1000));
  const surgeMins = Math.floor(surgeRemainSec / 60);
  const surgeSecs = surgeRemainSec % 60;

  // Next Altar Devotion level threshold: (altarLevel + 1)^2 * 250
  const nextLevelThreshold = Math.pow(altarLevel + 1, 2) * 250;
  const currentLevelBase = Math.pow(altarLevel, 2) * 250;
  const progressInLevel = Math.max(0, coinsSacrificed - currentLevelBase);
  const requiredForNext = nextLevelThreshold - currentLevelBase;
  const devotionProgressPct = Math.min(100, Math.round((progressInLevel / requiredForNext) * 100));

  // Sacrifice inputs
  const [selectedCoinOffer, setSelectedCoinOffer] = useState<number>(1000);
  const [selectedShardOffer, setSelectedShardOffer] = useState<number>(0);
  const [sacrificing, setSacrificing] = useState(false);
  const [activeBranch, setActiveBranch] = useState<'all' | 'fortune' | 'temporal' | 'alchemy' | 'cosmos'>('all');
  const [lastUpgradedSkill, setLastUpgradedSkill] = useState<string | null>(null);

  const handleSacrificeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || actionLockRef.current || (selectedCoinOffer <= 0 && selectedShardOffer <= 0) ||
        selectedCoinOffer > state.coins || selectedShardOffer > (state.shards ?? 0)) return;
    actionLockRef.current = true;
    setSacrificing(true);
    setLocalActionError('');
    try {
      sound.playSacrificeSound();
      await onSacrifice(selectedCoinOffer, selectedShardOffer);
      if (allowMotionEffects()) {
        confetti({
          particleCount: 40,
          spread: 45,
          origin: { y: 0.7 },
          colors: ['#f59e0b', '#ef4444', '#a855f7'],
        });
      }
      setSelectedCoinOffer(Math.min(1000, Math.max(0, state.coins - selectedCoinOffer)));
      setSelectedShardOffer(0);
    } catch (error) {
      setLocalActionError(error instanceof Error ? error.message : 'The offering was not confirmed. Check your balance before retrying.');
    } finally {
      actionLockRef.current = false;
      setSacrificing(false);
    }
  };

  const handleMasteryClick = async (skillId: MasterySkillId) => {
    if (busy || actionLockRef.current || sacrificing) return;
    actionLockRef.current = true;
    setLocalActionError('');
    sound.playLevelUpFanfare();
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    setLastUpgradedSkill(skillId);
    highlightTimerRef.current = window.setTimeout(() => {
      setLastUpgradedSkill(null);
      highlightTimerRef.current = null;
    }, 800);
    if (allowMotionEffects()) {
      confetti({
        particleCount: 25,
        spread: 40,
        origin: { y: 0.8 },
        colors: ['#fbbf24', '#38bdf8', '#c084fc'],
      });
    }
    try {
      await onUpgradeMastery(skillId);
    } catch (error) {
      setLocalActionError(error instanceof Error ? error.message : 'Could not upgrade Mastery. Please retry.');
    } finally {
      actionLockRef.current = false;
    }
  };

  const masterySkillsList = Object.entries(MASTERY_SKILLS) as [MasterySkillId, typeof MASTERY_SKILLS[MasterySkillId]][];

  const filteredSkills = masterySkillsList.filter(([id, skill]) => {
    if (activeBranch === 'all') return true;
    if (activeBranch === 'fortune' && (id === 'continuumLuck' || id === 'pityAccelerant' || id === 'apexFortune')) return true;
    if (activeBranch === 'temporal' && (id === 'chronoFlow')) return true;
    if (activeBranch === 'alchemy' && (id === 'prosperity' || id === 'shardAttunement' || id === 'infiniteVault')) return true;
    if (activeBranch === 'cosmos' && (id === 'critMastery' || id === 'celestialSurge' || id === 'cosmicAttunement')) return true;
    return false;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      {localActionError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{localActionError}</div>}
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-800/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>INFINITE LUCK BONUSES</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Cosmic Altar & Astral Mastery
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
              Sacrifice wealth to appease the celestial realm and unlock deep permanent branches in the Astral Mastery Skill Tree.
            </p>
          </div>

          {/* Mastery Points Jewel Badge */}
          <div className="bg-slate-950/80 border border-amber-500/40 rounded-2xl p-4 flex items-center gap-3.5 shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/30">
              <Star className="w-6 h-6 fill-current " style={{ animationDuration: '18s' }} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Mastery Points
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {fmt(state.masteryPoints ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400">
                Level ups, Altar & Prestige
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: THE SACRIFICIAL ALTAR */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-500 animate-flame" />
              <h2 className="text-lg font-black text-white">Altar of Perpetual Devotion</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Sacrifice Coins to permanently raise your Altar Devotion Luck (+1% per Level). Sacrifice Shards for permanent Infusion (+2%/shard) & Luck Surges!
            </p>
          </div>

          {/* Luck Surge Active Banner */}
          {isSurgeActive ? (
            <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 border border-amber-500/50 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-lg shadow-amber-950/40">
              <Flame className="w-5 h-5 text-amber-400 animate-flame" />
              <div>
                <div className="text-xs font-black text-amber-300">
                  🔥 +25% LUCK SURGE ACTIVE!
                </div>
                <div className="text-[10px] text-amber-200/80 font-mono">
                  {surgeMins}m {surgeSecs}s remaining
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl px-4 py-2 text-xs text-slate-400 flex items-center gap-2">
              <Flame className="w-4 h-4 text-slate-600" />
              <span>Surge Inactive (Offer Shards to Ignite)</span>
            </div>
          )}
        </div>

        {/* Altar Devotion Status Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-2">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Altar Devotion Level</span>
              <span className="font-mono text-amber-400 font-bold">Lvl {altarLevel}</span>
            </div>
            <div className="text-2xl font-black text-white font-mono">
              +{altarLevel}% <span className="text-xs font-normal text-emerald-400">Perm Luck</span>
            </div>
            {/* Progress to next Altar level */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>Progress</span>
                <span>{fmt(progressInLevel)} / {fmt(requiredForNext)} Coins</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${devotionProgressPct}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 text-right">
                Next level grants +1 Mastery Point & +1% Luck
              </div>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-1.5">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Gem className="w-3.5 h-3.5 text-cyan-400" />
              <span>Shard Infusion Luck</span>
            </div>
            <div className="text-2xl font-black text-white font-mono">
              +{(shardsSacrificed * 2)}% <span className="text-xs font-normal text-cyan-400">Perm Luck</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {shardsSacrificed} Shards permanently infused (+2% Luck each).
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-1.5">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Total Coins Sacrificed</span>
            </div>
            <div className="text-2xl font-black text-white font-mono text-amber-300">
              {fmt(coinsSacrificed)}
            </div>
            <p className="text-[11px] text-slate-400">
              Cumulative devotion across all rolls and sessions.
            </p>
          </div>
        </div>

        {/* Offering Ritual Form */}
        <form onSubmit={handleSacrificeSubmit} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-400" />
            <span>Present an Offering to the Crucible</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Coins Offering */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-400" /> Coin Offering:
                </span>
                <span className="font-mono text-amber-300 font-bold">{fmt(selectedCoinOffer)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[100, 1000, 10000, 50000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSelectedCoinOffer(amt)}
                    disabled={busy || sacrificing || state.coins < amt}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      selectedCoinOffer === amt
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    +{fmt(amt)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedCoinOffer(Math.max(0, state.coins))}
                  disabled={busy || sacrificing}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 border border-slate-800 text-amber-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Max ({fmt(state.coins)})
                </button>
              </div>
            </div>

            {/* Shard Offering */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Gem className="w-3.5 h-3.5 text-cyan-400" /> Shard Offering (Surge):
                </span>
                <span className="font-mono text-cyan-300 font-bold">{selectedShardOffer} Shards</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 2, 5, 10].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSelectedShardOffer(amt)}
                    disabled={busy || sacrificing || amt > (state.shards ?? 0)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      selectedShardOffer === amt
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {amt === 0 ? 'None' : `${amt} Shard${amt > 1 ? 's' : ''}`}
                  </button>
                ))}
                {(state.shards ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedShardOffer(state.shards)}
                    disabled={busy || sacrificing}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 border border-slate-800 text-cyan-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    All ({state.shards})
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            aria-busy={sacrificing || busy}
            disabled={sacrificing || busy || (selectedCoinOffer <= 0 && selectedShardOffer <= 0) || state.coins < selectedCoinOffer || (state.shards ?? 0) < selectedShardOffer>
            className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 via-amber-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-950/40 transition-all active:scale-98 cursor-pointer disabled:cursor-not-allowed"
          >
            <Flame className="w-4 h-4 text-amber-200 animate-flame" />
            <span>
              {sacrificing ? 'Channeling Sacrifice...' : `Ignite Offering (${fmt(selectedCoinOffer)} Coins + ${selectedShardOffer} Shards)`}
            </span>
          </button>
        </form>
      </div>

      {/* SECTION 2: ASTRAL MASTERY SKILL TREE */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-black text-white">Astral Mastery Skill Tree</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Infinite, permanent celestial talents. Upgrade using Mastery Points gained from Leveling Up, Altar Devotion, and Prestiging.
            </p>
          </div>

          {/* Filter Branches */}
          <div className="flex flex-wrap gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            {[
              { id: 'all', label: 'All Branches' },
              { id: 'fortune', label: '🍀 Fortune' },
              { id: 'temporal', label: '⏱️ Temporal' },
              { id: 'alchemy', label: '💎 Alchemy' },
              { id: 'cosmos', label: '🌌 Cosmos' },
            ].map(b => (
              <button
                key={b.id}
                onClick={() => setActiveBranch(b.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeBranch === b.id
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Skill Nodes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSkills.map(([skillId, skill]) => {
            const currentLevel = state.masterySkills?.[skillId] ?? 0;
            const isMax = currentLevel >= skill.maxLevel;
            const cost = masterySkillCost(skillId, currentLevel);
            const canAfford = (state.masteryPoints ?? 0) >= cost && !isMax;
            const isHighlighted = lastUpgradedSkill === skillId;

            return (
              <div
                key={skillId}
                className={`bg-slate-950/70 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all duration-300 ${
                  isHighlighted
                    ? 'border-amber-400 ring-2 ring-amber-400/50 scale-[1.02] shadow-[0_0_25px_rgba(251,191,36,0.3)]'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-400" />
                      {skill.name}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                        isMax
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}
                    >
                      {currentLevel} / {skill.maxLevel}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {skill.desc}
                  </p>

                  {/* Level Pips */}
                  <div className="flex gap-1 pt-1 overflow-hidden">
                    {Array.from({ length: Math.min(skill.maxLevel, 15) }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          idx < currentLevel
                            ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                            : 'bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                  <div className="text-xs font-mono text-slate-400">
                    {!isMax ? (
                      <span className="text-amber-300 font-bold">Cost: {cost} MP</span>
                    ) : (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Maxed Out
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleMasteryClick(skillId)}
                    disabled={!canAfford || busy || isMax || sacrificing}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isMax
                        ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-default'
                        : canAfford
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-950/40 active:scale-95 cursor-pointer font-black'
                        : 'bg-slate-900 text-slate-500 border border-slate-800/80 cursor-not-allowed'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isMax ? 'Mastered' : `Upgrade (+1 Lvl)`}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
