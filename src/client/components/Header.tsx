import React from 'react';
import { Volume2, VolumeX, Sparkles, HelpCircle, Coins, Gem, Zap, Wrench, Star, Users, MessageSquarePlus, Bell, BellOff } from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
import { xpRequiredForLevel, LEVEL_MILESTONES, getLevelBenefits, onlinePlayerLuckMultiplier } from '../../shared/game.js';
import { sound } from '../sound.js';

interface HeaderProps {
  state: PlayerState;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenOdds: () => void;
  onOpenFeedback: () => void;
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
  onClaimOffline,
  onOpenDevDebug,
  onOpenProfile,
  notificationsEnabled,
  onToggleNotifications,
}) => {
  const fmt = (n: number) => n.toLocaleString();
  const displayedLevel = Math.max(1, state.level || 1);
  let xpBeforeLevel = 0;
  for (let level = 1; level < displayedLevel; level++) {
    xpBeforeLevel += xpRequiredForLevel(level);
  }
  const levelXpRequired = xpRequiredForLevel(displayedLevel);
  const currentLevelXp = Math.max(0, (state.xp || 0) - xpBeforeLevel);
  const levelProgressPercent = Math.min(100, Math.round((currentLevelXp / levelXpRequired) * 100));
  const levelInfo = {
    level: displayedLevel,
    currentLevelXp,
    nextLevelXp: levelXpRequired,
    progressPercent: levelProgressPercent,
  };
  const nextMilestone = LEVEL_MILESTONES.find(m => m.level > displayedLevel);
  const levelBenefits = getLevelBenefits(displayedLevel);
  const [followPromptOpen, setFollowPromptOpen] = React.useState(false);
  const [followBusy, setFollowBusy] = React.useState(false);
  const [followError, setFollowError] = React.useState<string | null>(null);
  const [followCompleted, setFollowCompleted] = React.useState(false);
  const hasStartedPlaying = (state.totalRolls ?? 0) > 0;
  const followDismissedKey = 'io-follow-prompt-dismissed-v3';

  const openFollowPrompt = () => {
    setFollowError(null);
    setFollowCompleted(false);
    setFollowPromptOpen(true);
  };

  React.useEffect(() => {
    if (!hasStartedPlaying) return;
    try {
      if (localStorage.getItem(followDismissedKey) === 'true') return;
    } catch {}
    const timer = window.setTimeout(openFollowPrompt, 3 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [hasStartedPlaying]);

  React.useEffect(() => {
    const onFollowPromptTest = () => {
      try { localStorage.removeItem(followDismissedKey); } catch {}
      openFollowPrompt();
    };
    window.addEventListener('io-follow-prompt-test', onFollowPromptTest);
    return () => window.removeEventListener('io-follow-prompt-test', onFollowPromptTest);
  }, []);

  const dismissFollowPrompt = () => {
    try { localStorage.setItem(followDismissedKey, 'true'); } catch {}
    setFollowPromptOpen(false);
  };

  const followSubreddit = async () => {
    if (followBusy || followCompleted) return;
    setFollowBusy(true);
    setFollowError(null);
    try {
      const response = await fetch('/api/follow-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not follow the subreddit.');
      setFollowCompleted(true);
      try { localStorage.setItem(followDismissedKey, 'true'); } catch {}
      sound.playChime(660, 'sine', 0.2);
      window.setTimeout(() => setFollowPromptOpen(false), 700);
    } catch (error) {
      console.error('[Follow Prompt] Subscribe failed:', error);
      setFollowError(error instanceof Error ? error.message : 'Could not follow the subreddit.');
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <>
      <header className="bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-30 px-4 py-3">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Player Identity & EXP Bar */}
        <div className="flex items-center space-x-3">
          <div className="relative w-10 h-10 rounded-xl border border-purple-400/35 bg-slate-950 flex items-center justify-center">
            <div className="w-full h-full rounded-[10px] flex items-center justify-center font-semibold text-xl text-purple-200">
              ∞
            </div>
          </div>
          <div>
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
        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
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
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-md transition-all"
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

          {/* Bug report / suggestions */}
          <button
            onClick={() => {
              sound.playClick();
              onOpenFeedback();
            }}
            className="p-2 text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 rounded-lg transition-colors"
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
            className="p-2 text-slate-400 hover:text-fuchsia-300 hover:bg-slate-800/80 rounded-lg transition-colors"
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
      {followPromptOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
            <div>
              <div className="flex items-center gap-2 text-white font-extrabold text-base">
                <Users className="w-5 h-5 text-orange-400" />
                <span>Follow the subreddit</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-400">
                Follow the subreddit to keep up with Infinity Orbs. Pressing the button will subscribe your Reddit account to the subreddit where this game is running.
              </p>
              <p className="mt-2 text-[10px] leading-4 text-slate-500">
                This is a direct Reddit action on your account and only happens when you press Follow.
              </p>
            </div>
            {followError && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                {followError}
              </p>
            )}
            {followCompleted && (
              <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                Follow action completed.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={followBusy || followCompleted}
                onClick={() => { sound.playClick(); void followSubreddit(); }}
                className="w-full py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white text-sm font-bold transition-colors"
              >
                {followBusy ? 'Following…' : followCompleted ? 'Followed' : 'Follow subreddit'}
              </button>
              <button
                type="button"
                onClick={() => { sound.playClick(); dismissFollowPrompt(); }}
                className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
