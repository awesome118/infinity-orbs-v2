import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Sparkles,
  Zap,
  BookOpen,
  Calendar,
  Users,
  Award,
  Trophy,
  Dices,
  RefreshCw,
  Flame,
} from 'lucide-react';
import type {
  PlayerState,
  UpgradeId,
  PrestigeUpgradeId,
  MasterySkillId,
  AutomationId,
  GlobalBoosterId,
  GlobalBoosterSnapshot,
  PremiumBoosterId,
  Orb,
  RollResponse,
} from '../shared/game.js';
import type {
  Guild,
  LeaderboardEntry,
  Achievement,
  WorldEvent,
  GuildPerkId,
} from '../shared/social.js';
import {
  cooldownMs,
  calculateCosmicDust,
} from '../shared/game.js';
import { sound } from './sound.js';
import { Header } from './components/Header.js';
import { RollSection } from './components/RollSection.js';
import { UpgradesSection } from './components/UpgradesSection.js';
import { AltarSection } from './components/AltarSection.js';
import { MasterySection } from './components/MasterySection.js';
import { CollectionSection } from './components/CollectionSection.js';
import { QuestsAndStreaks } from './components/QuestsAndStreaks.js';
import { GuildsAndSocial } from './components/GuildsAndSocial.js';
import { ProfileAndPrestige } from './components/ProfileAndPrestige.js';
import { AchievementsSection } from './components/AchievementsSection.js';
import { RedditShareModal } from './components/RedditShareModal.js';
import { RarityTableModal } from './components/RarityTableModal.js';
import { NewBestModal } from './components/NewBestModal.js';
import { BoostersAndAutomation } from './components/BoostersAndAutomation.js';
import { ShopSection } from './components/ShopSection.js';
import { DevDebugModal } from './components/DevDebugModal.js';
import './styles.css';

type ActiveTab =
  | 'roll'
  | 'upgrades'
  | 'boosters'
  | 'shop'
  | 'altar'
  | 'mastery'
  | 'collection'
  | 'quests'
  | 'social'
  | 'profile'
  | 'achievements';

async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export function App() {
  const [state, setState] = useState<PlayerState | null>(null);
  const [lastOrb, setLastOrb] = useState<Orb | null>(null);
  const [lastBatch, setLastBatch] = useState<Orb[]>([]);
  const [batchSummary, setBatchSummary] = useState<{
    totalVal: number;
    coins: number;
    shards: number;
    xp: number;
  } | null>(null);

  const [readyAt, setReadyAt] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());
  const [tab, setTab] = useState<ActiveTab>('roll');
  const [autoRoll, setAutoRoll] = useState<boolean>(false);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type?: 'info' | 'success' | 'warn' } | null>(null);

  // Social & Community state
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [guildData, setGuildData] = useState<{ guilds: Guild[]; mine: Guild | null }>({
    guilds: [],
    mine: null,
  });
  const [achievementsData, setAchievementsData] = useState<Achievement[]>([]);
  const [worldEvent, setWorldEvent] = useState<WorldEvent | null>(null);

  // Modals
  const [shareRarity, setShareRarity] = useState<number | null>(null);
  const [showOddsModal, setShowOddsModal] = useState<boolean>(false);
  const [showDevModal, setShowDevModal] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(sound.enabled);
  const [newBestModalData, setNewBestModalData] = useState<{ orb: Orb; prevBest: number } | null>(null);

  const showToast = (msg: string, type: 'info' | 'success' | 'warn' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(prev => (prev?.msg === msg ? null : prev));
    }, 4000);
  };

  const refreshAll = useCallback(async () => {
    try {
      const [me, lb, gd, ach, we] = await Promise.all([
        getJson<PlayerState>('/api/me'),
        getJson<LeaderboardEntry[]>('/api/leaderboard'),
        getJson<{ guilds: Guild[]; mine: Guild | null }>('/api/guilds'),
        getJson<Achievement[]>('/api/achievements'),
        getJson<WorldEvent>('/api/world-event').catch(() => null),
      ]);
      setState(me);
      setLeaderboardData(lb);
      setGuildData(gd);
      setAchievementsData(ach);
      if (we) setWorldEvent(we);
    } catch (e: any) {
      console.error('Refresh error:', e);
    }
  }, []);

  // Initial load & tick loop (paced smoothly at 250ms to prevent high-frequency re-render jitter)
  useEffect(() => {
    void refreshAll();
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Periodic background refresh for social & community event rolling counter
  useEffect(() => {
    const pollInterval = tab === 'social' ? 3000 : 8000;
    const interval = setInterval(() => {
      void getJson<WorldEvent>('/api/world-event').then(we => {
        if (we) setWorldEvent(we);
      }).catch(() => null);

      if (tab === 'social') {
        void getJson<{ guilds: Guild[]; mine: Guild | null }>('/api/guilds').then(gd => {
          if (gd) setGuildData(gd);
        }).catch(() => null);
      }
    }, pollInterval);
    return () => clearInterval(interval);
  }, [tab]);

  // Keep presence fresh and process server-side automation while the game is open.
  useEffect(() => {
    const presenceInterval = setInterval(() => {
      void getJson<PlayerState>('/api/me')
        .then(setState)
        .catch(() => null);
    }, 10_000);
    return () => clearInterval(presenceInterval);
  }, []);

  // Roll action
  const handleRoll = useCallback(async () => {
    if (isRolling) return;
    setIsRolling(true);
    try {
      sound.playRollNormal();
      const res = await getJson<RollResponse>('/api/roll', { method: 'POST' });
      setState(res.state);
      setLastOrb(res.orb);
      setLastBatch(res.batch ?? [res.orb]);
      setBatchSummary({
        totalVal: res.totalRollValue,
        coins: res.coinsGained,
        shards: res.shardsGained,
        xp: res.xpGained,
      });
      setReadyAt(Date.now() + res.rollsRemainingUntilNext);

      // Immediately bump local rolling counter progress on every roll
      setWorldEvent(prev => (prev ? { ...prev, currentProgress: prev.currentProgress + (res.batch?.length || 1) } : null));

      // Trigger New Best Ball Celebration Modal!
      const previousBest = state?.highestRarity ?? 0;
      if (previousBest > 0 && res.orb.rarity > previousBest) {
        setNewBestModalData({ orb: res.orb, prevBest: previousBest });
        setAutoRoll(false); // Pause auto roll for celebratory moment
      } else if (res.orb.rarity >= 100000) {
        showToast(`⭐ MYTHIC DROP! 1 / ${res.orb.rarity.toLocaleString()} Orb!`, 'success');
      } else if (res.orb.rarity >= 1000) {
        showToast(`★ Rare Find! 1 in ${res.orb.rarity.toLocaleString()}`, 'success');
      }
    } catch (e: any) {
      showToast(e.message || 'Roll failed', 'warn');
    } finally {
      setIsRolling(false);
    }
  }, [isRolling, state]);

  // Auto roll watcher (paced steadily)
  useEffect(() => {
    if (!autoRoll || !state || state.upgrades.auto === 0) return;
    const interval = setInterval(() => {
      if (Date.now() >= readyAt && !isRolling) {
        void handleRoll();
      }
    }, 300);
    return () => clearInterval(interval);
  }, [autoRoll, state, readyAt, isRolling, handleRoll]);

  // Buy Standard Upgrade
  const handleBuyUpgrade = async (id: UpgradeId) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState }>('/api/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setState(res.state);
      sound.playChime(659.25, 'sine', 0.2);
      showToast(`Upgraded ${id.toUpperCase()} successfully!`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Upgrade failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Upgrade All Standard Upgrades
  const handleBuyAllUpgrades = async () => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState; totalSpent: number; upgradedCount: number }>('/api/upgrade/all', {
        method: 'POST',
      });
      setState(res.state);
      sound.playChime(523.25, 'triangle', 0.3);
      showToast(
        res.upgradedCount > 0
          ? `Bought ${res.upgradedCount} upgrade level${res.upgradedCount === 1 ? '' : 's'} for ${res.totalSpent.toLocaleString()} Coins.`
          : 'No upgrades are currently affordable.',
        res.upgradedCount > 0 ? 'success' : 'info'
      );
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Upgrade All failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Turbo Roll Booster
  const handleActivateTurbo = async () => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState }>('/api/turbo/activate', { method: 'POST' });
      setState(res.state);
      sound.playChime(880, 'sawtooth', 0.3);
      showToast('Turbo Roll Activated! Cooldowns reduced by 20% for 30m.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Could not activate turbo roll', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Daily Orb Frenzy
  const handleStartOrbFrenzy = async () => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState; postId: string; url: string; rarity: number }>('/api/frenzy/start', { method: 'POST' });
      setState(res.state);
      sound.playEpicFanfare();
      showToast(`Orb Frenzy posted: 1/${res.rarity.toLocaleString()}.`, 'success');
      try {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } catch {}
    } catch (e: any) {
      showToast(e.message || 'Could not start Orb Frenzy', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Premium Booster
  const handleActivatePremiumBooster = async (id: PremiumBoosterId) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState }>('/api/boosters/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setState(res.state);
      sound.playChime(1046, 'sawtooth', 0.3);
      showToast('Premium booster activated.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Could not activate booster', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // World Booster
  const handleActivateGlobalBooster = async (id: GlobalBoosterId, useCredit: boolean) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState; snapshot: GlobalBoosterSnapshot; usedCredit: boolean }>('/api/global-boosters/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, useCredit }),
      });
      setState(res.state);
      sound.playChime(960, 'sawtooth', 0.3);
      showToast(
        res.usedCredit ? 'World Booster activated for everyone with a free credit.' : 'World Booster activated for everyone.',
        'success',
      );
    } catch (e: any) {
      showToast(e.message || 'Could not activate World Booster', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Permanent automation
  const handleBuyAutomation = async (id: AutomationId) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState }>('/api/automation/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setState(res.state);
      sound.playLevelUpFanfare();
      showToast('Automation unlocked.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Could not unlock automation', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Community cache
  const handleClaimCommunityReward = async () => {
    setBusy(true);
    try {
      const res = await getJson<{
        state: PlayerState;
        rewardCoins: number;
        rewardXp: number;
        nextClaimAt: number;
        tier: number;
      }>('/api/community/reward/claim', { method: 'POST' });
      setState(res.state);
      if (res.rewardCoins > 0) {
        sound.playChime(880, 'triangle', 0.3);
        showToast(
          `Community cache claimed! +${res.rewardCoins.toLocaleString()} Coins, +${res.rewardXp.toLocaleString()} XP.`,
          'success',
        );
      }
    } catch (e: any) {
      showToast(e.message || 'Could not claim community reward', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Claim Offline Rolls
  const handleClaimOffline = async () => {
    setBusy(true);
    try {
      const res = await getJson<RollResponse>('/api/offline/claim', { method: 'POST' });
      setState(res.state);
      setLastOrb(res.orb);
      setLastBatch(res.batch ?? [res.orb]);
      setBatchSummary({
        totalVal: res.totalRollValue,
        coins: res.coinsGained,
        shards: res.shardsGained,
        xp: res.xpGained,
      });
      setReadyAt(Date.now() + res.rollsRemainingUntilNext);
      sound.playEpicFanfare();
      showToast(
        `Claimed ${res.batch?.length ?? 0} offline rolls! Highest: 1/${res.orb.rarity.toLocaleString()}`,
        'success'
      );
    } catch (e: any) {
      showToast(e.message || 'Could not claim offline rolls', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Altar Sacrifice
  const handleSacrifice = async (coins: number, shards: number) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState; altarLeveledUp: boolean; luckSurgeExtended: boolean }>('/api/altar/sacrifice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins, shards }),
      });
      setState(res.state);
      if (res.altarLeveledUp) {
        sound.playLevelUpFanfare();
        showToast(`Altar Devotion reached Lvl ${res.state.sacrifices?.altarLevel}! (+1 Mastery Point)`, 'success');
      } else if (res.luckSurgeExtended) {
        showToast('Sacrifice accepted! 1.50× Luck Surge ignited!', 'success');
      } else {
        showToast('Offerings consumed by the Altar.', 'info');
      }
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Sacrifice failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Upgrade Mastery Skill
  const handleUpgradeMastery = async (skillId: MasterySkillId) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState }>('/api/mastery/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });
      setState(res.state);
      showToast('Mastery Skill enhanced!', 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Mastery upgrade failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Daily Streak
  const handleClaimDailyStreak = async () => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState; rewardCoins: number; rewardShards: number }>(
        '/api/streak/claim',
        { method: 'POST' }
      );
      setState(res.state);
      sound.playChime(784, 'triangle', 0.3);
      showToast(
        `Streak claimed! +${res.rewardCoins} Coins ${res.rewardShards > 0 ? `+${res.rewardShards} Shards` : ''}`,
        'success'
      );
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not claim streak', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Claim Quest
  const handleClaimQuest = async (type: 'daily' | 'weekly', id: string) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState; rewardCoins: number; rewardShards?: number }>(
        '/api/quests/claim',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, id }),
        }
      );
      setState(res.state);
      sound.playChime(700, 'sine', 0.25);
      showToast(`Quest completed! +${res.rewardCoins.toLocaleString()} Coins`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not claim quest', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Claim Achievement
  const handleClaimAchievement = async (id: string) => {
    setBusy(true);
    try {
      const res = await getJson<{
        state: PlayerState;
        rewardCoins: number;
        rewardShards: number;
      }>('/api/achievements/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setState(res.state);
      sound.playChime(880, 'triangle', 0.3);
      showToast(`Achievement reward claimed! +${res.rewardCoins} Coins`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not claim achievement', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Prestige Reset
  const handlePrestige = async () => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState; dustGained?: number; cosmicDustEarned?: number }>('/api/prestige', {
        method: 'POST',
      });
      setState(res.state);
      sound.playMythicFanfare();
      const dust = res.dustGained ?? res.cosmicDustEarned ?? 0;
      showToast(`Prestige Complete! You earned +${dust} Cosmic Dust.`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Prestige failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Buy Permanent Prestige Upgrade
  const handleBuyPrestigeUpgrade = async (id: PrestigeUpgradeId) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState }>('/api/prestige/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setState(res.state);
      sound.playChime(659.25, 'sine', 0.25);
      showToast('Permanent cosmic upgrade obtained!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Prestige upgrade failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Astral Forge Dust Synthesis
  const handleSynthesizeDust = async () => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState; dustEarned: number }>('/api/prestige/synthesize', {
        method: 'POST',
      });
      setState(res.state);
      sound.playChime(1046.5, 'triangle', 0.4);
      showToast(`+${res.dustEarned} Cosmic Dust forged in the Astral Forge!`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Synthesis failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Buy Guild Perk
  const handleBuyGuildPerk = async (perk: GuildPerkId) => {
    setBusy(true);
    try {
      await getJson('/api/guilds/perk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perk }),
      });
      sound.playChime(784, 'triangle', 0.3);
      showToast('Guild Perk leveled up for all members!', 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not upgrade perk', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Cosmetics
  const handleBuyCosmetic = async (id: string) => {
    setBusy(true);
    try {
      const res = await getJson<{ state: PlayerState }>('/api/cosmetics/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setState(res.state);
      sound.playChime(523.25, 'sine', 0.2);
      showToast('Cosmetic equipped!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Cosmetic purchase failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Guilds
  const handleCreateGuild = async (name: string, tag: string) => {
    setBusy(true);
    try {
      await getJson('/api/guilds/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tag }),
      });
      showToast(`Guild [${tag}] ${name} founded!`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not create guild', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinGuild = async (id: string) => {
    setBusy(true);
    try {
      await getJson('/api/guilds/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      showToast('Joined guild successfully!', 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not join guild', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveGuild = async () => {
    setBusy(true);
    try {
      await getJson('/api/guilds/leave', { method: 'POST' });
      showToast('You left the guild.', 'info');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not leave guild', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleDonateGuild = async (coins: number, shards: number) => {
    setBusy(true);
    try {
      const res = await getJson<{ guild: Guild; tokensEarned: number; xpEarned: number; state: PlayerState }>('/api/guilds/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins, shards }),
      });
      setState(res.state);
      setGuildData(prev => ({
        ...prev,
        mine: res.guild,
        guilds: prev.guilds.map(g => (g.id === res.guild.id ? res.guild : g)),
      }));
      sound.playChime(784, 'triangle', 0.25);
      showToast(`Donated to Guild Treasury! (+${res.tokensEarned} Tokens, +${res.xpEarned} XP)`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Donation failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleSendGuildChat = async (text: string) => {
    try {
      await getJson('/api/guilds/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not send message', 'warn');
    }
  };

  // Share to Reddit
  const handleShareToReddit = async (rarity: number) => {
    const res = await getJson<{ success: boolean; id?: string }>('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rarity }),
    });
    void refreshAll();
    return res;
  };

  if (!state) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
        <p className="text-sm font-semibold">Connecting to Infinity Orbs...</p>
      </main>
    );
  }

  // Calculate notification counters
  const today = new Date().toISOString().slice(0, 10);
  const streakReady = state.streak.lastClaimDate !== today;
  const questsReady =
    state.dailyQuests.some(q => !q.claimed && q.progress >= q.target) ||
    state.weeklyQuests.some(q => !q.claimed && q.progress >= q.target);
  const achievementsReady = achievementsData.some(a => a.unlocked && !a.claimed);
  const prestigeReady = calculateCosmicDust(state) > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Sticky Top Header */}
      <Header
        state={state}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(sound.toggle())}
        onOpenOdds={() => setShowOddsModal(true)}
        onClaimOffline={handleClaimOffline}
        onOpenDevDebug={import.meta.env.DEV ? () => setShowDevModal(true) : undefined}
        onOpenProfile={() => setTab('profile')}
      />

      {/* Ephemeral Toast Banner */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div
            className={`px-4 py-3 rounded-2xl text-xs font-bold shadow-2xl border flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-slate-900 border-emerald-500/50 text-emerald-300 shadow-emerald-950/50'
                : toast.type === 'warn'
                ? 'bg-slate-900 border-rose-500/50 text-rose-300 shadow-rose-950/50'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Main Navigation Bar */}
      <div className="bg-slate-900/40 border-b border-slate-800/80 px-4 py-2 sticky top-[57px] z-20 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => {
              sound.playClick();
              setTab('roll');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === 'roll'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Dices className="w-3.5 h-3.5" />
            <span>Roll</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('upgrades');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === 'upgrades'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Upgrades</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('boosters');
            }}
            className={tab === 'boosters'
              ? 'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md'
              : 'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60'}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>Boosters</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('shop');
            }}
            className={tab === 'shop'
              ? 'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap bg-gradient-to-r from-amber-600 to-yellow-500 text-white shadow-md'
              : 'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60'}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Shop</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('altar');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'altar'
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400 animate-flame" />
            <span>Altar</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('mastery');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'mastery'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Mastery</span>
            {(state.masteryPoints ?? 0) > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('collection');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === 'collection'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Codex</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('quests');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'quests'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>Quests</span>
            {(streakReady || questsReady) && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('social');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === 'social'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Guilds & Social</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('achievements');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'achievements'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>Trophies</span>
            {achievementsReady && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setTab('profile');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'profile'
                ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Prestige</span>
            {prestigeReady && (
              <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
            )}
          </button>
        </div>
      </div>

      {/* Main Container Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {tab === 'roll' && (
          <RollSection
            state={state}
            lastOrb={lastOrb}
            lastBatch={lastBatch}
            batchSummary={batchSummary}
            readyAt={readyAt}
            now={now}
            busy={isRolling}
            autoRoll={autoRoll}
            worldEvent={worldEvent}
            onToggleAutoRoll={() => setAutoRoll(!autoRoll)}
            onRoll={handleRoll}
            onOrbFrenzy={handleStartOrbFrenzy}
            onOpenShareModal={r => setShareRarity(r)}
            onNewBest={(orb, prevBest) => setNewBestModalData({ orb, prevBest })}
          />
        )}

        {tab === 'upgrades' && (
          <UpgradesSection
            state={state}
            onBuyUpgrade={handleBuyUpgrade}
            onBuyAllUpgrades={handleBuyAllUpgrades}
            onActivateTurbo={handleActivateTurbo}
            busy={busy}
          />
        )}

        {tab === 'boosters' && (
          <BoostersAndAutomation
            state={state}
            busy={busy}
            globalBoosters={state.globalBoosters ?? {
              luck: { tier: 0, remainingMs: 0, updatedAt: Date.now() },
              speed: { tier: 0, remainingMs: 0, updatedAt: Date.now() },
              crit: { tier: 0, remainingMs: 0, updatedAt: Date.now() },
            }}
            worldEvent={worldEvent}
            onActivateBooster={handleActivatePremiumBooster}
            onActivateGlobalBooster={handleActivateGlobalBooster}
            onBuyAutomation={handleBuyAutomation}
            onClaimCommunityReward={handleClaimCommunityReward}
          />
        )}

        {tab === 'shop' && (
          <ShopSection
            state={state}
            busy={busy}
            onPurchased={async () => {
              await refreshAll();
            }}
          />
        )}

        {tab === 'altar' && (
          <AltarSection
            state={state}
            onSacrifice={handleSacrifice}
            busy={busy}
            now={now}
          />
        )}

        {tab === 'mastery' && (
          <MasterySection
            state={state}
            onUpgradeMastery={handleUpgradeMastery}
            busy={busy}
          />
        )}

        {tab === 'collection' && (
          <CollectionSection
            state={state}
            onOpenShareModal={r => setShareRarity(r)}
          />
        )}

        {tab === 'quests' && (
          <QuestsAndStreaks
            state={state}
            onClaimDailyStreak={handleClaimDailyStreak}
            onClaimQuest={handleClaimQuest}
            busy={busy}
          />
        )}

        {tab === 'social' && (
          <GuildsAndSocial
            guilds={guildData.guilds}
            myGuild={guildData.mine}
            leaderboard={leaderboardData}
            worldEvent={worldEvent}
            onCreateGuild={handleCreateGuild}
            onJoinGuild={handleJoinGuild}
            onLeaveGuild={handleLeaveGuild}
            onSendMessage={handleSendGuildChat}
            onBuyGuildPerk={handleBuyGuildPerk}
            onDonateGuild={handleDonateGuild}
            playerCoins={state.coins}
            playerShards={state.shards}
            busy={busy}
          />
        )}

        {tab === 'achievements' && (
          <AchievementsSection
            achievements={achievementsData}
            state={state}
            onClaimAchievement={handleClaimAchievement}
            busy={busy}
          />
        )}

        {tab === 'profile' && (
          <ProfileAndPrestige
            state={state}
            onPrestige={handlePrestige}
            onBuyPrestigeUpgrade={handleBuyPrestigeUpgrade}
            onSynthesizeDust={handleSynthesizeDust}
            onBuyCosmetic={handleBuyCosmetic}
            busy={busy}
          />
        )}
      </main>

      {/* New Best Ball Celebration Modal */}
      {newBestModalData && (
        <NewBestModal
          orb={newBestModalData.orb}
          prevBest={newBestModalData.prevBest}
          onClose={() => setNewBestModalData(null)}
          onOpenShareModal={r => setShareRarity(r)}
        />
      )}

      {/* Reddit Share Modal (GDD Section 17 & 18) */}
      {shareRarity !== null && (
        <RedditShareModal
          rarity={shareRarity}
          state={state}
          onClose={() => setShareRarity(null)}
          onShare={handleShareToReddit}
        />
      )}

      {/* Fair RNG Odds Table Modal (Design Pillar 2.5) */}
      {showOddsModal && (
        <RarityTableModal onClose={() => setShowOddsModal(false)} />
      )}

      {/* Developer Debug Modal */}
      {showDevModal && (
        <DevDebugModal
          onClose={() => setShowDevModal(false)}
          onRefresh={refreshAll}
          onForceRollResult={res => {
            setTab('roll');
            setState(res.state);
            setLastOrb(res.orb);
            setLastBatch(res.batch ?? [res.orb]);
            setBatchSummary({
              totalVal: res.totalRollValue,
              coins: res.coinsGained,
              shards: res.shardsGained,
              xp: res.xpGained,
            });
            setReadyAt(Date.now() + res.rollsRemainingUntilNext);
          }}
        />
      )}
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
