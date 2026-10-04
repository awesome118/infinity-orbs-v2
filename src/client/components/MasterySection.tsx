import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Star,
  Check,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  Clover,
  Clock,
  Gem,
  Award,
} from 'lucide-react';
import type { PlayerState, MasterySkillId } from '../../shared/game.js';
import { MASTERY_SKILLS, masterySkillCost, highestCodexChain, codexDevotionLuckPercent } from '../../shared/game.js';
import { sound } from '../sound.js';

interface MasterySectionProps {
  state: PlayerState;
  onUpgradeMastery: (skillId: MasterySkillId) => Promise<void>;
  busy: boolean;
}

function getPipTierColors(tier: number) {
  switch (tier % 6) {
    case 0:
      return {
        fill: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]',
        bg: 'bg-amber-950/40',
        text: 'text-amber-300',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        name: 'Tier 1 (Amber)',
      };
    case 1:
      return {
        fill: 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]',
        bg: 'bg-cyan-950/40',
        text: 'text-cyan-300',
        badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        name: 'Tier 2 (Cyan)',
      };
    case 2:
      return {
        fill: 'bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.8)]',
        bg: 'bg-purple-950/40',
        text: 'text-purple-300',
        badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        name: 'Tier 3 (Violet)',
      };
    case 3:
      return {
        fill: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]',
        bg: 'bg-emerald-950/40',
        text: 'text-emerald-300',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        name: 'Tier 4 (Emerald)',
      };
    case 4:
      return {
        fill: 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]',
        bg: 'bg-rose-950/40',
        text: 'text-rose-300',
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        name: 'Tier 5 (Ruby)',
      };
    case 5:
    default:
      return {
        fill: 'bg-gradient-to-r from-yellow-300 to-amber-200 shadow-[0_0_6px_rgba(253,224,71,0.9)]',
        bg: 'bg-yellow-950/40',
        text: 'text-yellow-200',
        badge: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30',
        name: 'Tier 6+ (Astral)',
      };
  }
}

export const MasterySection: React.FC<MasterySectionProps> = ({
  state,
  onUpgradeMastery,
  busy,
}) => {
  const [activeBranch, setActiveBranch] = useState<'all' | 'fortune' | 'temporal' | 'alchemy' | 'cosmos'>('all');
  const [lastUpgradedSkill, setLastUpgradedSkill] = useState<MasterySkillId | null>(null);

  const fmt = (n: number) => n.toLocaleString();

  const handleMasteryClick = async (skillId: MasterySkillId) => {
    sound.playLevelUpFanfare();
    setLastUpgradedSkill(skillId);
    setTimeout(() => setLastUpgradedSkill(null), 800);
    confetti({
      particleCount: 30,
      spread: 45,
      origin: { y: 0.75 },
      colors: ['#fbbf24', '#38bdf8', '#c084fc'],
    });
    await onUpgradeMastery(skillId);
  };

  const masterySkillsList = Object.entries(MASTERY_SKILLS) as [MasterySkillId, typeof MASTERY_SKILLS[MasterySkillId]][];

  const filteredSkills = masterySkillsList.filter(([id]) => {
    if (activeBranch === 'all') return true;
    if (activeBranch === 'fortune' && (id === 'continuumLuck' || id === 'pityAccelerant' || id === 'apexFortune')) return true;
    if (activeBranch === 'temporal' && (id === 'chronoFlow')) return true;
    if (activeBranch === 'alchemy' && (id === 'prosperity' || id === 'shardAttunement' || id === 'infiniteVault')) return true;
    if (activeBranch === 'cosmos' && (id === 'critMastery' || id === 'celestialSurge' || id === 'cosmicAttunement' || id === 'celestialVolley')) return true;
    return false;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-purple-950/70 via-slate-900 to-indigo-950/70 border border-purple-800/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>MASTERY</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Skill Tree
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
              Spend Mastery Points on permanent passive skills.
            </p>
          </div>

          {/* Mastery Points Jewel Badge */}
          <div className="bg-slate-950/80 border border-amber-500/40 rounded-2xl p-4 flex items-center gap-3.5 shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/30">
              <Star className="w-6 h-6 fill-current " style={{ animationDuration: '18s' }} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Mastery Points Available
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {fmt(state.masteryPoints ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400">
                Earned via Leveling & Altar Ranks
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Branch Navigation Filter */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-400" />
              <span>Skill Specialization Branches</span>
            </h2>
          </div>

          <div className="flex gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-slate-800 flex-wrap">
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
            const isCodexDevotion = skillId === 'celestialSurge';
            const codexChain = isCodexDevotion ? Math.max(0, Math.floor(Number(state.codexChain ?? 0) || 0)) : 0;
            const codexLuckPercent = isCodexDevotion
              ? Math.max(0, Number(state.codexDevotionLuckPercent ?? 0) || 0)
              : 0;
            const isMax = currentLevel >= skill.maxLevel;
            const cost = masterySkillCost(skillId, currentLevel);
            const canAfford = (state.masteryPoints ?? 0) >= cost && !isMax;
            const isHighlighted = lastUpgradedSkill === skillId;

            // 10-pip wrap-around calculation:
            // When wrapping around (e.g. level 10 -> Tier 1 Cyan, level 20 -> Tier 2 Violet)
            const wrapCount = Math.floor(currentLevel / 10);
            const currentPipIndex = currentLevel % 10;
            const currentTierColor = getPipTierColors(wrapCount);
            const prevTierColor = wrapCount > 0 ? getPipTierColors(wrapCount - 1) : null;

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
                    <div className="flex items-center gap-1.5">
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
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {skill.desc}
                  </p>

                  {isCodexDevotion && (
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] uppercase tracking-wide font-black text-cyan-300">
                          Longest Codex Chain
                        </span>
                        <span className="text-sm font-black font-mono text-white">
                          {codexChain}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-[10px] text-slate-500">
                          {codexChain > 0
                            ? `+${(codexChain * 0.3).toFixed(1)}% per level`
                            : 'Collect consecutive rarities to build a chain'}
                        </span>
                        <span className="text-base font-black text-emerald-300">
                          +{codexLuckPercent}% Luck
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 10-Pip Progress Bar that changes color on wrap-around */}
                  <div className="space-y-1 pt-1">
                    <div className="flex gap-1 overflow-hidden">
                      {Array.from({ length: 10 }).map((_, idx) => {
                        let pipClass = 'bg-slate-800';
                        if (isMax) {
                          pipClass = 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]';
                        } else if (idx < currentPipIndex) {
                          pipClass = currentTierColor.fill;
                        } else if (prevTierColor) {
                          pipClass = prevTierColor.fill;
                        }
                        return (
                          <div
                            key={idx}
                            className={`h-2 flex-1 rounded-full transition-colors ${pipClass}`}
                            title={`Pip ${idx + 1}/10 (Level ${wrapCount * 10 + idx + 1})`}
                          />
                        );
                      })}
                    </div>
                    {wrapCount > 0 && !isMax && (
                      <div className="text-[10px] text-slate-500 text-right">
                        Completed: {wrapCount * 10} levels • Current: {currentTierColor.name}
                      </div>
                    )}
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

                  {/* Upgrade button showing cost inside */}
                  <button
                    onClick={() => handleMasteryClick(skillId)}
                    disabled={!canAfford || busy || isMax}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isMax
                        ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-default'
                        : canAfford
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md shadow-amber-900/30 active:scale-95 cursor-pointer'
                        : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isMax ? 'Maxed' : `Upgrade (${cost} MP)`}</span>
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
