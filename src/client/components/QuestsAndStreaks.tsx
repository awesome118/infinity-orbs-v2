import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Gift,
  Coins,
  Award,
} from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
import { formatNumber, todayKey } from '../../shared/game.js';
import { sound } from '../sound.js';

interface QuestsAndStreaksProps {
  state: PlayerState;
  onClaimDailyStreak: () => Promise<void>;
  onClaimQuest: (type: 'daily' | 'weekly', id: string) => Promise<void>;
  busy: boolean;
}

export const QuestsAndStreaks: React.FC<QuestsAndStreaksProps> = ({
  state,
  onClaimDailyStreak,
  onClaimQuest,
  busy,
}) => {
  const fmt = (n: number) => formatNumber(n);
  const today = todayKey();
  const questProgressPct = (progress: number, target: number, unlocked: boolean) =>
    unlocked ? Math.max(0, Math.min(100, Math.round((Math.max(0, progress) / Math.max(1, target)) * 100))) : 0;
  const alreadyClaimedStreak = state.streak.lastClaimDate === today;
  const currentStreakDay = ((state.streak.count - 1) % 7) + 1;

  const streakRewards = [
    { day: 1, coins: 50, shards: 0 },
    { day: 2, coins: 100, shards: 0 },
    { day: 3, coins: 150, shards: 1 },
    { day: 4, coins: 200, shards: 0 },
    { day: 5, coins: 250, shards: 0 },
    { day: 6, coins: 300, shards: 0 },
    { day: 7, coins: 350, shards: 5 },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Daily Streak */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/15 to-slate-900 border border-emerald-500/20 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white">Daily Streak</h2>
                <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-black text-xs px-2 py-0.5 rounded-full">
                  {alreadyClaimedStreak ? 'Claimed' : 'Ready'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Current streak: <span className="font-black text-white">{Math.max(1, state.streak.count || 1)}</span> days · Longest: {state.streak.longestStreak} days.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              sound.playClick();
              void onClaimDailyStreak();
            }}
            disabled={alreadyClaimedStreak || busy}
            className={alreadyClaimedStreak ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed px-5 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-900/30 active:scale-95 px-5 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all'}
          >
            <Gift className="w-4 h-4" />
            <span>{alreadyClaimedStreak ? 'Claimed Today' : 'Claim Daily Reward'}</span>
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          {(() => {
            const nextStreak = alreadyClaimedStreak
              ? Math.max(1, state.streak.count || 1)
              : state.streak.lastClaimDate
                ? Math.max(1, state.streak.count || 1) + 1
                : 1;
            const day = ((nextStreak - 1) % 7) + 1;
            return [
              <div key="coins" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <span className="block text-[10px] uppercase font-black text-amber-300/70">Coins</span>
                <span className="text-lg font-black text-white">+{fmt(day * 100)}</span>
              </div>,
              <div key="shards" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                <span className="block text-[10px] uppercase font-black text-cyan-300/70">Shards</span>
                <span className="text-lg font-black text-white">+{day === 7 ? 5 : day === 3 ? 1 : 0}</span>
                <span className="block text-[9px] text-cyan-400/70">Daily reward, outside roll cap</span>
              </div>,
              <div key="rolls" className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
                <span className="block text-[10px] uppercase font-black text-purple-300/70">Free Rolls</span>
                <span className="text-lg font-black text-white">+{day * 5}</span>
                <span className="block text-[9px] text-slate-500">Manual rolls bypass cooldown</span>
              </div>,
              <div key="community" className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
                <span className="block text-[10px] uppercase font-black text-fuchsia-300/70">Community Tier</span>
                <span className="text-lg font-black text-white">Tier {state.dailyStreakCommunity?.tier ?? 1}</span>
                <span className="block text-[9px] text-slate-500">Streak count adds to progress</span>
              </div>,
            ];
          })()}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-emerald-300">Daily Streak Community Goal</div>
              <div className="text-[11px] text-slate-500 mt-1">Each claim contributes your full streak number.</div>
            </div>
            <div className="text-right text-[10px] font-black text-slate-400">
              {fmt(Math.max(0, state.dailyStreakCommunity?.currentProgress ?? 0))} / {fmt(Math.max(1, state.dailyStreakCommunity?.goal ?? 250))}
            </div>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: Math.min(100, Math.max(0, state.dailyStreakCommunity?.currentProgress ?? 0) / Math.max(1, state.dailyStreakCommunity?.goal ?? 250) * 100) + "%" }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold">
            <span className="text-emerald-300">+{Math.max(0, Math.round(((state.dailyStreakCommunity?.luckMultiplier ?? 1) - 1) * 100))}% Luck</span>
            <span className="text-cyan-300">+{Math.max(0, Math.round((1 - (state.dailyStreakCommunity?.speedMultiplier ?? 1)) * 100))}% Speed</span>
            <span className="text-slate-500">Next tier after the goal is completed.</span>
          </div>
        </div>
      </div>
      {/* Daily Quests (GDD Section 11) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            <h3 className="text-base font-black text-white">Daily Quests</h3>
          </div>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Resets daily at midnight</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.dailyQuests.map(q => {
            const isUnlocked = q.unlocked !== false;
            const isComplete = isUnlocked && q.progress >= q.target;
            const pct = questProgressPct(q.progress, q.target, isUnlocked);

            return (
              <div
                key={q.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{q.title}</h4>
                        {!isUnlocked && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700">
                            🔒 Locked
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{q.desc}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 shrink-0">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>+{q.rewardCoins}</span>
                      {q.rewardShards && (
                        <span className="text-cyan-400">+{q.rewardShards} 💎</span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                      <span>Progress</span>
                      <span>
                        {fmt(q.progress)} / {fmt(q.target)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Claim Button */}
                <div>
                  {q.claimed ? (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Claimed</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        sound.playClick();
                        void onClaimQuest('daily', q.id);
                      }}
                      disabled={!isComplete || busy}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        isComplete
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95'
                          : 'bg-slate-950 text-slate-500 border border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      <span>{!isUnlocked ? 'Locked' : isComplete ? 'Claim Reward' : 'In Progress'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly Quests (GDD Section 11) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-cyan-400" />
            <h3 className="text-base font-black text-white">Weekly Quests</h3>
          </div>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Resets weekly</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.weeklyQuests.map(q => {
            const isUnlocked = q.unlocked !== false;
            const isComplete = isUnlocked && q.progress >= q.target;
            const pct = isUnlocked ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;

            return (
              <div
                key={q.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-white">{q.title}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{q.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold shrink-0">
                      <span className="text-amber-400">+{fmt(q.rewardCoins)} 🪙</span>
                      {q.rewardShards && (
                        <span className="text-cyan-400">+{q.rewardShards} 💎</span>
                      )}
                      {q.rewardTokens && (
                        <span className="text-purple-400">+{q.rewardTokens} 🛡️</span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                      <span>Progress</span>
                      <span>
                        {fmt(q.progress)} / {fmt(q.target)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Claim Button */}
                <div>
                  {q.claimed ? (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Claimed</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        sound.playClick();
                        void onClaimQuest('weekly', q.id);
                      }}
                      disabled={!isComplete || busy}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        isComplete
                          ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md active:scale-95'
                          : 'bg-slate-950 text-slate-500 border border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      <span>{isComplete ? 'Claim Reward' : 'In Progress'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
