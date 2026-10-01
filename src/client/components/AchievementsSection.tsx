import React, { useState } from 'react';
import { Trophy, CheckCircle2, Lock, Coins, Gem, Sparkles } from 'lucide-react';
import type { Achievement } from '../../shared/social.js';
import type { PlayerState } from '../../shared/game.js';
import { sound } from '../sound.js';

interface AchievementsSectionProps {
  achievements: Achievement[];
  state: PlayerState;
  onClaimAchievement: (id: string) => Promise<void>;
  busy: boolean;
}

export const AchievementsSection: React.FC<AchievementsSectionProps> = ({
  achievements,
  state,
  onClaimAchievement,
  busy,
}) => {
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'claimed'>('all');
  const fmt = (n: number) => n.toLocaleString();

  const total = achievements.length;
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const claimedCount = achievements.filter(a => a.claimed).length;
  const progressPct = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  const filtered = achievements.filter(a => {
    if (filter === 'unlocked') return a.unlocked && !a.claimed;
    if (filter === 'claimed') return a.claimed;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Overview Card */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">Achievements & Trophies</h2>
                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  {unlockedCount} / {total} Unlocked
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Hit milestones to earn Coins, Shards, and prestigious badges.
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              Claimed Rewards
            </span>
            <span className="text-base font-black text-white">
              {claimedCount} / {unlockedCount} Claimed
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filter === 'all'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          All ({total})
        </button>
        <button
          onClick={() => setFilter('unlocked')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filter === 'unlocked'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          Ready to Claim ({unlockedCount - claimedCount})
        </button>
        <button
          onClick={() => setFilter('claimed')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filter === 'claimed'
              ? 'bg-slate-700 text-white shadow-md'
              : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          Claimed ({claimedCount})
        </button>
      </div>

      {/* Achievements List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filtered.map(ach => (
          <div
            key={ach.id}
            className={`rounded-2xl p-4 border transition-all flex flex-col justify-between space-y-3 ${
              ach.claimed
                ? 'bg-slate-950/60 border-slate-800/80 opacity-70'
                : ach.unlocked
                ? 'bg-gradient-to-br from-slate-900 to-amber-950/20 border-amber-500/40 shadow-lg'
                : 'bg-slate-950/50 border-slate-900 text-slate-500'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-xl text-sm ${
                    ach.claimed
                      ? 'bg-slate-900 text-emerald-400 border border-slate-800'
                      : ach.unlocked
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-950 text-slate-600 border border-slate-900'
                  }`}
                >
                  {ach.claimed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : ach.unlocked ? (
                    <Trophy className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Lock className="w-5 h-5 text-slate-600" />
                  )}
                </div>
                <div>
                  <h4
                    className={`text-sm font-bold ${
                      ach.unlocked ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    {ach.name}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">{ach.description}</p>
                </div>
              </div>

              {/* Rewards Indicator */}
              <div className="text-right shrink-0 text-xs font-bold space-y-0.5">
                <div className="text-amber-400">+{fmt(ach.rewardCoins)} 🪙</div>
                {ach.rewardShards && (
                  <div className="text-cyan-400">+{ach.rewardShards} 💎</div>
                )}
              </div>
            </div>

            {/* Action Area */}
            <div className="pt-2 border-t border-slate-800/50 flex justify-end">
              {ach.claimed ? (
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Reward Collected</span>
                </span>
              ) : ach.unlocked ? (
                <button
                  onClick={() => {
                    sound.playClick();
                    void onClaimAchievement(ach.id);
                  }}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs shadow-md active:scale-95 transition-all"
                >
                  Claim Reward
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Locked</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
