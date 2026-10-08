import React from 'react';
import { Volume2, VolumeX, Sparkles, HelpCircle, Coins, Gem, Zap, Wrench, Star, Users, MessageSquarePlus, Bell, BellOff, ScrollText } from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
import { LEVEL_MILESTONES, getLevelBenefits, getLevelProgress, onlinePlayerLuckMultiplier } from '../../shared/game.js';
import { sound } from '../sound.js';

interface HeaderProps {
  state: PlayerState;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenOdds: () => void;
  onOpenFeedback: () => void;
  onOpenChangelog: () => void;
  onClaimOffline: () => void;
  onOpenDevDebug?: () => void;
  onOpenProfile?: () => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  soundEnabled,
  onToggleSound,
  onOpenOdds,
  onOpenFeedback,
  onOpenChangelog,
  onClaimOffline,
  onOpenDevDebug,
  onOpenProfile,
  notificationsEnabled,
  onToggleNotifications,
}) => {
  const fmt = (n: number) => n.toLocaleString();
  const levelInfo = getLevelProgress(
    Math.max(1, state.level || 1),
    state.xp || 0,
    state.levelXpFloor,
  );
  const displayedLevel = levelInfo.level;
  const nextMilestone = LEVEL_MILESTONES.find(m => m.level > displayedLevel);
  const levelBenefits = getLevelBenefits(displayedLevel);
  return (
    <>
      <header className="app-header bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-30 px-4 py-3">
      <div className="header-inner max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Player Identity & EXP Bar */}
        <div className="brand-lockup flex items-center space-x-3">
          <div className="brand-mark relative w-10 h-10 rounded-xl border border-purple-400/35 bg-slate-950 flex items-center justify-center">
            <div className="brand-glyph w-full h-full rounded-[10px] flex items-center justify-center font-semibold text-xl text-purple-200">
              ∞
            </div>
          </div>
          <div className="brand-copy">
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
                Infinity Orbs
              </h1>
              {/* Level Badge with click to view perks */}
              <button
                onClick={onOpenProfile}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-200 border border-purple-400/25 hover:border-purple-300/50 flex items-center gap-1 cursor-pointer transition-colors"
                title={`Level ${levelInfo.level} Perks: ${levelBenefits.luckMultiplier.toFixed(2)}× Luck, ${levelBenefits.coinsMultiplier.toFixed(2)}× Coins, +${levelBenefits.bonusBalls} Balls`}
              >
                <Star className="w-2.5 h-2.5 text-amber-300 fill-current" />
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
                  className="h-full bg-purple-400 rounded-full transition-all duration-300 relative"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                >
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
        <div className="header-actions flex items-center gap-2 sm:gap-4 ml-auto">
          {/* Live player count / social luck */}
          <div
            className="hidden sm:flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-2.5 py-1.5 text-[10px] font-black text-indigo-200"
            title="Players currently active in this Reddit game installation. More players give everyone a logarithmic Luck bonus."
          >
            <Users className="w-3.5 h-3.5 text-indigo-300" />
            <span>{(state.onlinePlayers ?? 1).toLocaleString()} Online</span>
            <span className="text-indigo-300/70">×{onlinePlayerLuckMultiplier(state.onlinePlayers ?? 1).toFixed(2)} Luck</span>
          </div>

          {/* Currencies */}
          <div className="header-resource-row resource-chip flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold">
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
              className="offline-button flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-md transition-all"
              title="Claim rolls accumulated while away"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>+{fmt(state.offlineRolls)} Offline</span>
            </button>
          )}

          {/* Fair RNG Odds Button */}
          <button
            onClick={onOpenOdds}
            className="header-icon-button p-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="View Probability & Drop Odds"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Changelog */}
          <button
            onClick={() => {
              sound.playClick();
              onOpenChangelog();
            }}
            className="header-icon-button p-2 text-slate-400 hover:text-purple-300 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="View Changelog"
            aria-label="View Changelog"
          >
            <ScrollText className="w-4 h-4" />
          </button>

          {/* Bug report / suggestions */}
          <button
            onClick={() => {
              sound.playClick();
              onOpenFeedback();
            }}
            className="header-icon-button p-2 text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="Report a bug or send a suggestion"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>

          {/* Admin Console */}
          {onOpenDevDebug && (
            <button
              onClick={() => {
                sound.playClick();
                onOpenDevDebug();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold transition-all"
              title="Admin Console"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

          {/* Reddit Notification Toggle */}
          <button
            onClick={() => {
              sound.playClick();
              onToggleNotifications();
            }}
            className="header-icon-button p-2 text-slate-400 hover:text-fuchsia-300 hover:bg-slate-800/80 rounded-lg transition-colors"
            title={notificationsEnabled ? 'Disable Reddit notifications' : 'Enable Reddit notifications'}
          >
            {notificationsEnabled
              ? <Bell className="w-4 h-4 text-fuchsia-400" />
              : <BellOff className="w-4 h-4 text-slate-500" />}
          </button>

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
    </>
  );
};
