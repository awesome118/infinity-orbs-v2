import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Gift,
  Coins,
  Gem,
  Award,
  Shield,
} from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
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
  const fmt = (n: number) => n.toLocaleString();
  const today = new Date().toISOString().slice(0, 10);
  const alreadyClaimedStreak = state.streak.lastClaimDate === today;
  const currentStreakDay = ((state.streak.count - 1) % 7) + 1;

  const streakRewards = [
    { day: 1, coins: 50, shards: 0 },
    { day: 2, coins: 100, shards: 0 },
    { day: 3, coins: 150, shards: 2 },
    { day: 4, coins: 200, shards: 0 },
    { day: 5, coins: 250, shards: 0 },
    { day: 6, coins: 300, shards: 0 },
    { day: 7, coins: 350, shards: 15 },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Daily Login Streak Card (GDD Section 12) */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">Daily Streak Routine</h2>
                <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-xs px-2 py-0.5 rounded-full">
                  Day {state.streak.count} Streak
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Log in every day for escalating Coin and Shard rewards. Longest: {state.streak.longestStreak} days.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              void onClaimDailyStreak();
            }}
            disabled={alreadyClaimedStreak || busy}
            className={`px-5 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              !alreadyClaimedStreak
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-lg shadow-amber-900/30 active:scale-95'
                : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>{alreadyClaimedStreak ? 'Claimed for Today' : 'Claim Daily Reward'}</span>
          </button>
        </div>

        {/* 7-Day Cycle Ribbon */}
        <div className="grid grid-cols-7 gap-2 mt-5">
          {streakRewards.map(item => {
            const isCurrent = item.day === currentStreakDay;
            const isCompleted = alreadyClaimedStreak ? item.day <= currentStreakDay : item.day < currentStreakDay;

            return (
              <div
                key={item.day}
                className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition-all ${
                  isCurrent
                    ? 'bg-amber-500/20 border-amber-500/60 ring-2 ring-amber-400/30'
                    : isCompleted
                    ? 'bg-slate-950/60 border-slate-800 text-slate-500'
                    : 'bg-slate-950/40 border-slate-900 text-slate-600'
                }`}
              >
                <span className="text-[10px] font-bold uppercase block mb-1">
                  Day {item.day}
                </span>
                <span className="text-xs font-black text-amber-300">
                  +{item.coins}
                </span>
                {item.shards > 0 && (
                  <span className="text-[10px] font-bold text-cyan-400 mt-0.5">
                    +{item.shards} 💎
                  </span>
                )}
                {isCompleted && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-1" />
                )}
              </div>
            );
          })}
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
            const isComplete = q.progress >= q.target;
            const pct = Math.min(100, Math.round((q.progress / q.target) * 100));

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
                      <span>{isComplete ? 'Claim Reward' : 'In Progress'}</span>
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
            const isComplete = q.progress >= q.target;
            const pct = Math.min(100, Math.round((q.progress / q.target) * 100));

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
