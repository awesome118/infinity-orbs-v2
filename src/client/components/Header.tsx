import React from 'react';
import { Volume2, VolumeX, Sparkles, HelpCircle, Coins, Gem, Zap, Wrench, Star } from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
import { calculateLevelFromXp, LEVEL_MILESTONES } from '../../shared/game.js';
import { sound } from '../sound.js';

interface HeaderProps {
  state: PlayerState;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenOdds: () => void;
  onClaimOffline: () => void;
  onOpenDevDebug?: () => void;
  onOpenProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  soundEnabled,
  onToggleSound,
  onOpenOdds,
  onClaimOffline,
  onOpenDevDebug,
  onOpenProfile,
}) => {
  const fmt = (n: number) => n.toLocaleString();
  const levelInfo = calculateLevelFromXp(state.xp || 0);
  const nextMilestone = LEVEL_MILESTONES.find(m => m.level > levelInfo.level);

  return (
    <header className="bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-30 px-4 py-3">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Player Identity & EXP Bar */}
        <div className="flex items-center space-x-3">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            {/* Rotating Star Ring Animation */}
            <div className="absolute inset-0 rounded-xl border border-cyan-400/30 animate-spin" style={{ animationDuration: '24s' }} />
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-cyan-200">
              ∞
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
                ORBS <span className="text-xs font-normal text-slate-400 hidden sm:inline">• The Infinite Roll</span>
              </h1>
              {/* Level Badge with click to view perks */}
              <button
                onClick={onOpenProfile}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/30 to-indigo-500/30 text-purple-200 border border-purple-400/40 hover:border-purple-300 flex items-center gap-1 shadow-sm cursor-pointer transition-all"
                title={`Level ${levelInfo.level} Perks: +${((levelInfo.level - 1) * 1.5).toFixed(1)}% Luck, +${((levelInfo.level - 1) * 3)}% Coins`}
              >
                <Star className="w-2.5 h-2.5 text-amber-300 fill-current animate-spin" style={{ animationDuration: '10s' }} />
                <span>Lv {levelInfo.level}</span>
              </button>
            </div>

            {/* Glowing EXP Bar */}
            <div className="flex items-center gap-2 mt-1">
              <div
                className="w-28 sm:w-40 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5 relative cursor-pointer"
                onClick={onOpenProfile}
                title={`EXP: ${fmt(levelInfo.currentLevelXp)} / ${fmt(levelInfo.nextLevelXp)} (${levelInfo.progressPercent}%)`}
              >
                <div
                  className="h-full bg-gradient-to-r from-purple-500 via-indigo-400 to-cyan-400 rounded-full transition-all duration-300 relative shadow-[0_0_8px_rgba(168,85,247,0.7)]"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
              <span className="text-[10px] font-mono text-slate-400 font-medium">
                {levelInfo.progressPercent}%
              </span>
              {nextMilestone && (
                <span className="text-[9px] text-purple-300/80 hidden md:inline truncate max-w-[140px]">
                  Next: Lv {nextMilestone.level} ({nextMilestone.name})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Currencies & Global Actions */}
        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
          {/* Currencies */}
          <div className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold">
            {/* Coins */}
            <div className="flex items-center gap-1 text-amber-400" title="Coins (Coins = Orb Rarity)">
              <Coins className="w-3.5 h-3.5" />
              <span>{fmt(state.coins)}</span>
            </div>

            <div className="w-[1px] h-3.5 bg-slate-800" />

            {/* Shards */}
            <div className="flex items-center gap-1 text-cyan-400" title="Shards">
              <Gem className="w-3.5 h-3.5" />
              <span>{fmt(state.shards ?? 0)}</span>
            </div>

            {/* Cosmic Dust */}
            {(state.cosmicDust > 0 || state.prestigeCount > 0) && (
              <>
                <div className="w-[1px] h-3.5 bg-slate-800" />
                <div className="flex items-center gap-1 text-fuchsia-400" title="Cosmic Dust">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{fmt(state.cosmicDust)}</span>
                </div>
              </>
            )}
          </div>

          {/* Offline Rolls Waiting Notification */}
          {state.offlineRolls > 0 && (
            <button
              onClick={onClaimOffline}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-lg shadow-emerald-900/30 animate-pulse transition-all"
              title="Claim rolls accumulated while away"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>+{fmt(state.offlineRolls)} Offline</span>
            </button>
          )}

          {/* Fair RNG Odds Button */}
          <button
            onClick={onOpenOdds}
            className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="View Probability & Drop Odds"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Dev Debug Menu */}
          {onOpenDevDebug && (
            <button
              onClick={() => {
                sound.playClick();
                onOpenDevDebug();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold transition-all"
              title="Developer Debug Menu"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Debug</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={() => {
              sound.playClick();
              onToggleSound();
            }}
            className="p-2 text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 rounded-lg transition-colors"
            title={soundEnabled ? 'Mute Sound' : 'Enable Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>
    </header>
  );
};
