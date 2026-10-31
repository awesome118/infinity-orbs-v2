import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, Sparkles, HelpCircle, Coins, Gem, Zap, Wrench, Star, Users, MessageSquarePlus, Bell, BellOff, ScrollText, Swords } from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
import { LEVEL_MILESTONES, getLevelBenefits, getLevelProgress, onlinePlayerLuckMultiplier, formatShardAmount, formatNumber } from '../../shared/game.js';
import { sound } from '../sound.js';
import { APP_VERSION } from '../../shared/version.js';

interface HeaderProps {
  state: PlayerState;
  combatMode?: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenOdds: () => void;
  onOpenFeedback: () => void;
  onOpenChangelog: () => void;
  changelogUnread?: boolean;
  onClaimOffline: () => void;
  onOpenDevDebug?: () => void;
  onOpenProfile?: () => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  combatMode = false,
  soundEnabled,
  onToggleSound,
  onOpenOdds,
  onOpenFeedback,
  onOpenChangelog,
  changelogUnread = false,
  onClaimOffline,
  onOpenDevDebug,
  onOpenProfile,
  notificationsEnabled,
  onToggleNotifications,
}) => {
  const fmt = (n: number) => Number.isFinite(n) ? Math.max(0, n).toLocaleString() : '0';
  const onlineCountRaw = Number(state.onlinePlayers ?? 1);
  const onlineCount = Number.isFinite(onlineCountRaw) ? Math.max(1, Math.floor(onlineCountRaw)) : 1;
  const [combatMarks,setCombatMarks]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    const refreshCombatMarks=async()=>{
      try{
        const response=await fetch('/api/combat/marks',{cache:'no-store'});
        if(!response.ok)return;
        const payload=await response.json() as {combatMarks?:unknown};
        const value=Number(payload.combatMarks);
        if(!cancelled&&Number.isSafeInteger(value)&&value>=0)setCombatMarks(value);
      }catch{
        // Combat currency is supplemental HUD information; offline combat must not break the header.
      }
    };
    const onCombatMarksUpdated=(event:Event)=>{
      const value=Number((event as CustomEvent<{combatMarks?:unknown}>).detail?.combatMarks);
      if(Number.isSafeInteger(value)&&value>=0)setCombatMarks(value);
    };
    void refreshCombatMarks();
    window.addEventListener('io-combat-marks-updated',onCombatMarksUpdated);
    return()=>{cancelled=true;window.removeEventListener('io-combat-marks-updated',onCombatMarksUpdated);};
  },[]);
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
              <span
                aria-label={`App version ${APP_VERSION}`}
                className="rounded border border-slate-700/70 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-slate-500"
              >
                v{APP_VERSION}
              </span>
              {/* Level Badge with click to view perks */}
              <button
                type="button"
                aria-label={`View Level ${levelInfo.level} perks`}
                onClick={() => onOpenProfile?.()}
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
                role="button"
                tabIndex={0}
                aria-label={`Open profile. Experience progress: ${levelInfo.progressPercent}% to level ${levelInfo.level + 1}`}
                className="w-28 sm:w-40 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5 relative cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
                onClick={() => onOpenProfile?.()}
                onKeyDown={event => { if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenProfile?.(); } }}
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
        <div className="header-actions flex flex-wrap items-center justify-end gap-2 sm:gap-4 ml-auto">
          {/* Live player count / social luck */}
          <div
            className="community-presence-chip hidden sm:flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-2.5 py-1.5 text-[10px] font-black text-indigo-200"
            aria-label={`Online players: ${fmt(onlineCount)}; community Luck multiplier ${onlinePlayerLuckMultiplier(onlineCount).toFixed(2)} times.`}
            title="Players currently active in this game installation. More players increase everyone’s Luck bonus."
          >
            <Users className="w-3.5 h-3.5 text-indigo-300" />
            <span>{fmt(onlineCount)} Online</span>
            <span className="text-indigo-300/70">×{onlinePlayerLuckMultiplier(onlineCount).toFixed(2)} Luck</span>
          </div>

          {/* Currencies */}
          <div role="group" aria-label={combatMode ? "Combat resources" : "Player resources"} className="header-resource-row resource-chip flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold">
            {/* Core-game Coins stay hidden while in Combat. */}
            {!combatMode && <>
              <div className="header-resource-entry text-amber-300" aria-label={`${formatNumber(state.coins)} Coins`} title="Coins: spend them on upgrades to improve your rolls.">
                <Coins className="w-3.5 h-3.5" />
                <span className="header-resource-value">{formatNumber(state.coins)}</span>
                <span className="header-resource-label">Coins</span>
              </div>
              <div className="header-resource-divider w-[1px] h-3.5 bg-slate-800" />
            </>}

            {/* Combat Marks are shown only while in the Combat section. */}
            {combatMode && <>
              <div className="header-resource-entry text-cyan-200" title="Combat Marks are earned in battles and spent on combat upgrades and Skill Gacha.">
                <Swords className="w-3.5 h-3.5" />
                <span className="header-resource-value">{fmt(combatMarks)}</span>
                <span className="header-resource-label">Marks</span>
              </div>
              <div className="header-resource-divider w-[1px] h-3.5 bg-slate-800" />
            </>}

            {/* Shards */}
            <div className="header-resource-entry text-cyan-300" aria-label={`${formatShardAmount(state.shards ?? 0)} Shards`} title="Shards: used for special tools and boosters.">
              <Gem className="w-3.5 h-3.5" />
              <span className="header-resource-value">{formatShardAmount(state.shards ?? 0)}</span>
              <span className="header-resource-label">Shards</span>
            </div>

            {/* Cosmic Dust */}
            {(state.cosmicDust > 0 || state.prestigeCount > 0) && (
              <>
                <div className="header-resource-divider w-[1px] h-3.5 bg-slate-800" />
                <div className="header-resource-entry text-sky-200" aria-label={`${fmt(state.cosmicDust)} Cosmic Dust`} title="Cosmic Dust: used for permanent Prestige upgrades.">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="header-resource-value">{fmt(state.cosmicDust)}</span>
                  <span className="header-resource-label">Dust</span>
                </div>
              </>
            )}
          </div>

          {/* Offline Rolls Waiting Notification */}
          {state.offlineRolls > 0 && (
            <button
              type="button"
              aria-label={`Claim ${fmt(state.offlineRolls)} offline rolls`}
              onClick={onClaimOffline}
              className="offline-button flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-md transition-all"
              title="Claim the rolls accumulated while you were away. They are added to your Free Rolls."
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Claim +{fmt(state.offlineRolls)} Rolls</span>
            </button>
          )}

          {/* Fair RNG Odds Button */}
          <button
            type="button"
            aria-label="View probability and drop odds"
            onClick={onOpenOdds}
            className="header-icon-button p-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="View Probability & Drop Odds"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Changelog */}
          <div className={changelogUnread ? 'relative rounded-lg ring-2 ring-emerald-400/80 shadow-[0_0_16px_rgba(74,222,128,0.75)] animate-pulse' : 'relative rounded-lg'}>
            {changelogUnread && <span className="absolute -top-1 -right-1 z-10 rounded-full bg-emerald-400 px-1.5 py-0.5 text-[8px] font-black text-slate-950 shadow-md">NEW</span>}
            <button type="button" aria-label="View Changelog" onClick={() => { sound.playClick(); onOpenChangelog(); }}
              className="header-icon-button p-2 text-slate-400 hover:text-purple-300 hover:bg-slate-800/80 rounded-lg transition-colors"
              title={changelogUnread ? 'New changelog since your last visit' : 'View Changelog'}>
              <ScrollText className="w-4 h-4" />
            </button>
          </div>

          {/* Bug report / suggestions */}
          <button
            type="button"
            aria-label="Report a bug or suggest an improvement"
            onClick={() => {
              sound.playClick();
              onOpenFeedback();
            }}
            className="header-icon-button p-2 text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="Report a bug or suggest an improvement"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>

          {/* Admin Console */}
          {onOpenDevDebug && (
            <button
              type="button"
              aria-label="Open admin console"
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
            type="button"
            aria-label={notificationsEnabled ? 'Disable Reddit notifications' : 'Enable Reddit notifications'}
            aria-pressed={notificationsEnabled}
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
            type="button"
            aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}
            aria-pressed={soundEnabled}
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
