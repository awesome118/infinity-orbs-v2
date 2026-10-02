import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getWebViewMode, requestExpandedMode } from '@devvit/web/client';
import {
  Sparkles,
  Zap,
  BookOpen,
  Calendar,
  Users,
  Award,
  Dices,
  RefreshCw,
  Flame,
  Shield,
  Lock,
  Megaphone,
} from 'lucide-react';
import type {
  PlayerState,
  UpgradeId,
  PrestigeUpgradeId,
  MasterySkillId,
  AutomationId,
  GlobalBoosterId,
  GlobalBoosterSnapshot,

  FeatureId,
  PremiumBoosterId,
  Orb,
  RollResponse,
} from '../shared/game.js';
import type {
  Guild,
  LeaderboardEntry,
  WorldEvent,
  GuildPerkId,
} from '../shared/social.js';
import {
  cooldownMs,
  calculateCosmicDust,
  FEATURE_UNLOCK_LEVELS,
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
import { RedditShareModal } from './components/RedditShareModal.js';
import { RarityTableModal } from './components/RarityTableModal.js';
import { NewBestModal } from './components/NewBestModal.js';
import { BoostersAndAutomation } from './components/BoostersAndAutomation.js';
import { DevDebugModal } from './components/DevDebugModal.js';
import { FeedbackModal } from './components/FeedbackModal.js';
import { APP_VERSION } from '../shared/version.js';
import './styles.css';

type ActiveTab =
  | 'roll'
  | 'upgrades'
  | 'boosters'
  | 'altar'
  | 'mastery'
  | 'collection'
  | 'quests'
  | 'social'
  | 'profile';

async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message =
      typeof errorData.error === 'string'
        ? errorData.error
        : typeof errorData.message === 'string'
          ? errorData.message
          : `HTTP ${res.status}: ${res.statusText}`;

    // An admin wipe intentionally invalidates old in-flight requests. Those
    // requests must never resurrect old data, but they also should not strand
    // the player on a stale error screen. Reload once so the fresh generation
    // is loaded from Redis.
    if (String(message).includes('invalidated by an admin wipe')) {
      try {
        const recoveryKey = 'io-wipe-recovery';
        if (window.sessionStorage.getItem(recoveryKey) !== '1') {
          window.sessionStorage.setItem(recoveryKey, '1');
          window.location.reload();
          return await new Promise<T>(() => undefined);
        }
        window.sessionStorage.removeItem(recoveryKey);
      } catch {
        window.location.reload();
        return await new Promise<T>(() => undefined);
      }
    }

    throw new Error(message);
  }
  return res.json();
}

async function getJsonWithTimeout<T>(url: string, timeoutMs = 10_000, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await getJson<T>(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('The Infinity Orbs server did not respond within 10 seconds.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function App() {
  const [state, setState] = useState<PlayerState | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [lastOrb, setLastOrb] = useState<Orb | null>(null);
  const [lastBatch, setLastBatch] = useState<Orb[]>([]);
  const [batchSummary, setBatchSummary] = useState<{
    totalVal: number;
    coins: number;
    shards: number;
    xp: number;
    frenzyCount?: number;
  } | null>(null);

  const [readyAt, setReadyAt] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());
  const [tab, setTab] = useState<ActiveTab>('roll');
  const [autoRoll, setAutoRoll] = useState<boolean>(false);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type?: 'info' | 'success' | 'warn' } | null>(null);

  useEffect(() => {
    const pollAnnouncement = async () => {
      try {
        const announcement = await getJson<{
          id: GlobalBoosterId;
          name: string;
          username: string;
          activatedAt: number;
        } | null>('/api/global-booster-announcement');
        if (!announcement || announcement.activatedAt <= lastBoosterAnnouncementAtRef.current) return;

        lastBoosterAnnouncementAtRef.current = announcement.activatedAt;
        setBoosterAnnouncement(announcement);
        if (boosterAnnouncementTimerRef.current !== null) {
          window.clearTimeout(boosterAnnouncementTimerRef.current);
        }
        boosterAnnouncementTimerRef.current = window.setTimeout(() => {
          setBoosterAnnouncement(null);
          boosterAnnouncementTimerRef.current = null;
        }, 5000);
      } catch {
        // Announcement polling is best-effort and never blocks gameplay.
      }
    };

    void pollAnnouncement();
    const interval = window.setInterval(() => void pollAnnouncement(), 1500);
    return () => {
      window.clearInterval(interval);
      if (boosterAnnouncementTimerRef.current !== null) {
        window.clearTimeout(boosterAnnouncementTimerRef.current);
      }
    };
  }, []);

  // Social & Community state
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [guildData, setGuildData] = useState<{ guilds: Guild[]; mine: Guild | null }>({
    guilds: [],
    mine: null,
  });
  const [worldEvent, setWorldEvent] = useState<WorldEvent | null>(null);
  const [developerAnnouncement, setDeveloperAnnouncement] = useState<{ message: string; updatedAt: number; updatedBy: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Modals
  const [shareRarity, setShareRarity] = useState<number | null>(null);
  const [showOddsModal, setShowOddsModal] = useState<boolean>(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [showDevModal, setShowDevModal] = useState<boolean>(false);
  const [boosterAnnouncement, setBoosterAnnouncement] = useState<{
    id: GlobalBoosterId;
    name: string;
    username: string;
    activatedAt: number;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(sound.enabled);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [newBestModalData, setNewBestModalData] = useState<{ orb: Orb; prevBest: number } | null>(null);
  const [frenzyRunTriggered, setFrenzyRunTriggered] = useState(false);
  const lastBoosterAnnouncementAtRef = useRef(0);
  const boosterAnnouncementTimerRef = useRef<number | null>(null);

  const featureForTab = (nextTab: ActiveTab): FeatureId | null => {
    if (nextTab === 'upgrades') return 'upgrades';
    if (nextTab === 'quests') return 'quests';
    if (nextTab === 'collection') return 'collection';
    if (nextTab === 'boosters') return 'boosters';
    if (nextTab === 'social') return 'social';
    if (nextTab === 'altar') return 'altar';
    if (nextTab === 'mastery') return 'mastery';
    if (nextTab === 'profile') return 'prestige';
    return null;
  };

  const changeTab = (nextTab: ActiveTab) => {
    const feature = featureForTab(nextTab);
    if (feature && (state?.level ?? 1) < FEATURE_UNLOCK_LEVELS[feature]) {
      showToast(
        `Reach Level ${FEATURE_UNLOCK_LEVELS[feature]} to unlock ${nextTab === 'profile' ? 'Prestige' : nextTab.charAt(0).toUpperCase() + nextTab.slice(1)}.`,
        'info',
      );
      return;
    }
    sound.playClick();
    setTab(nextTab);
  };

  const showToast = (msg: string, type: 'info' | 'success' | 'warn' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(prev => (prev?.msg === msg ? null : prev));
    }, 4000);
  };

  const refreshAll = useCallback(async () => {
    try {
      // Load the player's state first. Admin/debug status is auxiliary and must
      // never block the entire game from rendering if that endpoint is slow.
      const me = await getJsonWithTimeout<PlayerState>('/api/me');
      try {
        window.sessionStorage.removeItem('io-wipe-recovery');
      } catch {
        // sessionStorage can be unavailable in some embedded webviews.
      }
      setState(me);
      setAuthRequired(false);
      setStartupError(null);

      // Admin status is intentionally independent from game-state loading.
      const adminStatus = await getJson<{ isAdmin: boolean }>('/api/dev/status').catch(() => ({ isAdmin: false }));
      setIsAdmin(adminStatus.isAdmin === true);

      // A banned non-admin only needs their own state so the ban screen can load.
      // The admin may continue to use the normal game endpoints while testing a ban.
      if (me.gameBan?.active) return;

      const [lb, gd, we, announcement, notificationState] = await Promise.all([
        getJson<LeaderboardEntry[]>('/api/leaderboard').catch(() => []),
        getJson<{ guilds: Guild[]; mine: Guild | null }>('/api/guilds').catch(() => ({ guilds: [], mine: null })),
        getJson<WorldEvent>('/api/world-event').catch(() => null),
        getJson<{ message: string; updatedAt: number; updatedBy: string }>('/api/developer-announcement').catch(() => null),
        getJson<{ enabled: boolean }>('/api/notifications').catch(() => ({ enabled: false })),
      ]);

      setLeaderboardData(lb);
      setGuildData(gd);
      if (we) setWorldEvent(we);
      if (announcement) setDeveloperAnnouncement(announcement);
      setNotificationsEnabled(notificationState.enabled === true);
    } catch (e: any) {
      if (e?.message === 'REDDIT_LOGIN_REQUIRED') {
        setAuthRequired(true);
        setState(null);
        setIsAdmin(false);
        setStartupError(null);
        return;
      }
      const message = e?.message || 'Could not connect to the Infinity Orbs server.';
      setStartupError(message);
      console.error('Refresh error:', e);
    }
  }, []);

  // Initial load & tick loop (paced smoothly at 250ms to prevent high-frequency re-render jitter)
  useEffect(() => {
    void refreshAll();
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Live developer announcement feed. All open clients poll the same Redis-backed
  // announcement so edits appear automatically without requiring a page refresh.
  useEffect(() => {
    let cancelled = false;

    const pollDeveloperAnnouncement = async () => {
      try {
        const announcement = await getJson<{ message: string; updatedAt: number; updatedBy: string }>('/api/developer-announcement');
        if (cancelled) return;

        if (!announcement.message) {
          setDeveloperAnnouncement(null);
          return;
        }

        if (announcement.updatedAt > dismissedDeveloperAnnouncementRef.current) {
          setDeveloperAnnouncement(announcement);
        } else {
          setDeveloperAnnouncement(null);
        }
      } catch {
        // Announcement polling is best-effort and must never block gameplay.
      }
    };

    void pollDeveloperAnnouncement();
    const interval = window.setInterval(() => void pollDeveloperAnnouncement(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Detect when the installed game has a newer client bundle. The endpoint is
  // deliberately uncached so stale Reddit/CDN responses do not hide updates.
  useEffect(() => {
    const checkForUpdate = async () => {
      try {
        const res = await fetch('/api/version?check=' + Date.now(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return;
        const data = await res.json() as { version?: string };
        if (data.version && data.version !== APP_VERSION) {
          setUpdateAvailable(true);
        }
      } catch {
        // Update detection is best-effort and must never block gameplay.
      }
    };

    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), 5_000);
    return () => window.clearInterval(interval);
  }, []);

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


  // Global Boosters are shared state, so refresh them independently of player-state polling.
  useEffect(() => {
    if (tab !== 'boosters') return;

    const refreshGlobalBoosters = () => {
      void getJson<GlobalBoosterSnapshot>('/api/global-boosters')
        .then(snapshot => {
          if (snapshot) {
            setState(prev => prev ? { ...prev, globalBoosters: snapshot } : prev);
          }
        })
        .catch(() => null);
    };

    refreshGlobalBoosters();
    const interval = setInterval(refreshGlobalBoosters, 1500);
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

  useEffect(() => {
    if (!state || frenzyRunTriggered) return;

    let cancelled = false;

    const resolveFrenzy = async () => {
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          const info = await getJson<{
            rarity: number;
            ownerUsername: string;
            createdAt: number;
            claimedToday: boolean;
            isOwner: boolean;
            postId: string;
            inGame?: boolean;
            consumedAt?: number | null;
          }>('/api/frenzy/info');

          if (!info.inGame || !info.isOwner || info.consumedAt) return;

          setFrenzyRunTriggered(true);
          setBusy(true);
          const res = await getJson<RollResponse>('/api/frenzy/claim', { method: 'POST' });

          if (cancelled) return;
          setState(res.state);
          setLastOrb(res.orb);
          setLastBatch(res.batch ?? [res.orb]);
          setBatchSummary({
            totalVal: res.totalRollValue,
            coins: res.coinsGained,
            shards: res.shardsGained,
            xp: res.xpGained,
            frenzyCount: res.frenzyCount ?? 0,
          });
          setReadyAt(Date.now() + res.rollsRemainingUntilNext);
          showToast(
            `⚡ Orb Frenzy unleashed! ${(res.frenzyCount ?? 0).toLocaleString()} Orbs rolled.`,
            'success',
          );
          return;
        } catch {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
    };

    void resolveFrenzy().finally(() => {
      if (!cancelled) setBusy(false);
    });

    return () => {
      cancelled = true;
    };
  }, [state, frenzyRunTriggered]);

  // Social quests count only when the player actually opens the social area.
  // Background leaderboard/guild refreshes must not award the visit quest.
  useEffect(() => {
    if (tab !== 'social') return;
    void getJson<{ ok: boolean; state: PlayerState }>('/api/social/visit', { method: 'POST' })
      .then(result => setState(result.state))
      .catch(() => null);
  }, [tab]);

  // Roll action
  const handleRoll = useCallback(async (isAutoRoll = false) => {
    if (isRolling) return;
    setIsRolling(true);
    try {
      sound.playRollNormal();
      const res = await getJson<RollResponse>('/api/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto: isAutoRoll }),
      });
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
      setWorldEvent(prev => (prev ? { ...prev, currentProgress: prev.currentProgress + (res.rollsProcessed ?? res.batch?.length ?? 1) } : null));
      maybePromptForNotifications(state?.totalRolls ?? 0, res.state.totalRolls);

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
        void handleRoll(true);
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
  const handleStartOrbFrenzy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    setBusy(true);

    // Expansion must be requested synchronously from the trusted click event.
    // Start the server-side Frenzy request without awaiting it first.
    const startRequest = getJson<{ state: PlayerState; postId: string; url: string; rarity: number }>('/api/frenzy/start', {
      method: 'POST',
    });

    try {
      if (getWebViewMode() === 'inline') {
        requestExpandedMode(event.nativeEvent, 'game');
      }
    } catch (e: any) {
      console.error('Could not enter the expanded game window:', e);
    }

    try {
      const res = await startRequest;
      setState(res.state);
      sound.playEpicFanfare();

      // In expanded mode the current game window is already open, so the
      // pending Frenzy effect below will immediately roll the full volley.
      if (getWebViewMode() === 'expanded') {
        showToast(`⚡ Orb Frenzy ready: 1/${res.rarity.toLocaleString()} baseline roll.`, 'success');
      }
    } catch (e: any) {
      showToast(e.message || 'Could not start Orb Frenzy', 'warn');
      setBusy(false);
      return;
    }

    // Do not clear busy here when expansion was requested. The reloaded game
    // view will consume the pending Frenzy and clear its own busy state.
    if (getWebViewMode() === 'expanded') setBusy(false);
  };


  const handleActivateGlobalBooster = async (id: GlobalBoosterId, useCredit: boolean) => {
    setBusy(true);
    try {
      const res = await getJson<{
        state: PlayerState;
        snapshot: GlobalBoosterSnapshot;
        usedCredit: boolean;
        announcement: {
          id: GlobalBoosterId;
          name: string;
          username: string;
          activatedAt: number;
        };
      }>('/api/global-boosters/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, useCredit }),
      });
      setState(res.state);
      lastBoosterAnnouncementAtRef.current = res.announcement.activatedAt;
      setBoosterAnnouncement(res.announcement);
      if (boosterAnnouncementTimerRef.current !== null) window.clearTimeout(boosterAnnouncementTimerRef.current);
      boosterAnnouncementTimerRef.current = window.setTimeout(() => {
        setBoosterAnnouncement(null);
        boosterAnnouncementTimerRef.current = null;
      }, 5000);
      sound.playChime(960, 'sawtooth', 0.3);
      showToast(
        res.usedCredit ? 'Global Booster activated with a free credit.' : 'Global Booster activated.',
        'success',
      );
    } catch (e: any) {
      showToast(e.message || 'Could not activate Global Booster', 'warn');
    } finally {
      setBusy(false);
    }
  };

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
        `Claimed ${(res.rollsProcessed ?? res.batch?.length ?? 0).toLocaleString()} offline rolls! Highest: 1/${res.orb.rarity.toLocaleString()}`,
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
  const handleCreateGuild = async (name: string, tag: string): Promise<boolean> => {
    setBusy(true);
    try {
      await getJson('/api/guilds/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tag }),
      });
      showToast(`Guild [${tag}] ${name} founded!`, 'success');
      void refreshAll();
      return true;
    } catch (e: any) {
      showToast(e.message || 'Could not create guild', 'warn');
      return false;
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

  const handleToggleGuildTrust = async (username: string, trusted: boolean) => {
    setBusy(true);
    try {
      await getJson('/api/guilds/trust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, trusted }),
      });
      showToast(trusted ? `${username} is now trusted.` : `${username} is no longer trusted.`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not change Trust status', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleSetGuildTax = async (rate: number) => {
    setBusy(true);
    try {
      await getJson('/api/guilds/tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate }),
      });
      showToast(`Guild Tax set to ${rate}%.`, 'success');
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not change Guild Tax', 'warn');
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
    if (busy) return;
    setBusy(true);
    try {
      await getJson('/api/guilds/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      void refreshAll();
    } catch (e: any) {
      showToast(e.message || 'Could not send message', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleSendFeedback = async (type: 'bug' | 'suggestion', message: string) => {
    await getJson<{ success: boolean }>('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message }),
    });
    setShowFeedbackModal(false);
    showToast(type === 'bug' ? 'Bug report sent to the moderators.' : 'Suggestion sent to the moderators.', 'success');
  };

  const handleToggleNotifications = async () => {
    try {
      const enabled = !notificationsEnabled;
      const res = await getJson<{ enabled: boolean }>('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setNotificationsEnabled(res.enabled === true);
      showToast(
        res.enabled ? 'Reddit notifications enabled.' : 'Reddit notifications disabled.',
        'success',
      );
    } catch (e: any) {
      showToast(e.message || 'Could not update Reddit notification settings.', 'warn');
    }
  };

  const maybePromptForNotifications = (previousRolls: number, nextRolls: number) => {
    if (notificationsEnabled || notificationPromptShown || previousRolls >= 5 || nextRolls < 5) return;
    setNotificationPromptShown(true);
    setShowNotificationPrompt(true);
    try {
      window.localStorage.setItem('io-notification-prompt-shown', '1');
    } catch {
      // Local storage is optional in embedded webviews.
    }
  };

  const dismissDeveloperAnnouncement = () => {
    const updatedAt = developerAnnouncement?.updatedAt ?? 0;
    dismissedDeveloperAnnouncementRef.current = updatedAt;
    setDeveloperAnnouncement(null);
    try {
      window.localStorage.setItem('io-developer-announcement-dismissed-at', String(updatedAt));
    } catch {
      // Local storage is optional.
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

  if (authRequired) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-8 shadow-2xl text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Shield className="w-8 h-8 text-amber-300" />
            </div>
            <h1 className="mt-5 text-2xl font-black text-white">Reddit Login Required</h1>
            <p className="mt-2 text-sm text-slate-400">
              You must be logged into a Reddit account to play Infinity Orbs.
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Your save is tied to your Reddit account, so anonymous sessions are not given a shared save.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-6">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
          {startupError ? (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                <Shield className="w-7 h-7 text-rose-400" />
              </div>
              <h1 className="mt-5 text-xl font-black text-white">Unable to connect</h1>
              <p className="mt-2 text-sm text-slate-400">{startupError}</p>
              <button
                onClick={() => { setStartupError(null); void refreshAll(); }}
                className="mt-6 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-sm"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <RefreshCw className="mx-auto w-8 h-8 animate-spin text-purple-500" />
              <p className="mt-3 text-sm font-semibold">Connecting to Infinity Orbs...</p>
            </>
          )}
        </div>
      </main>
    );
  }

  if (state.gameBan?.active) {
    const banEnds = state.gameBan.bannedUntil;
    const permanent = banEnds === null;
    const banDate = banEnds ? new Date(banEnds).toLocaleString() : '';

    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-8 shadow-2xl text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
              <Shield className="w-8 h-8 text-rose-400" />
            </div>
            <h1 className="mt-5 text-2xl font-black text-white">Infinity Orbs Account Banned</h1>
            <p className="mt-2 text-sm text-slate-400">
              Access to the game has been disabled for this account.
            </p>

            <div className="mt-6 text-left space-y-3 rounded-2xl bg-slate-950/70 border border-slate-800 p-4">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Reason</div>
                <div className="text-sm text-slate-200">{state.gameBan.reason}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Duration</div>
                <div className="text-sm text-rose-300">
                  {permanent ? 'Permanent' : `Until ${banDate}`}
                </div>
              </div>
            </div>

            {isAdmin ? (
              <div className="mt-6">
                <div className="mb-3 text-xs text-emerald-400 font-semibold">
                  Admin access remains available while this account is game-banned.
                </div>
                <button
                  onClick={() => setShowDevModal(true)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm"
                >
                  Open Admin Console
                </button>
              </div>
            ) : (
              <div className="mt-6 text-xs text-slate-500">
                Contact an Infinity Orbs administrator if you believe this was a mistake.
              </div>
            )}
          </div>
        </div>

        {showDevModal && isAdmin && (
          <DevDebugModal
            onClose={() => setShowDevModal(false)}
            onRefresh={refreshAll}
          />
        )}
      </main>
    );
  }

  // Calculate notification counters
  const today = new Date().toISOString().slice(0, 10);
  const streakReady = state.streak.lastClaimDate !== today;
  const questsReady =
    state.dailyQuests.some(q => !q.claimed && q.progress >= q.target) ||
    state.weeklyQuests.some(q => !q.claimed && q.progress >= q.target);
  const prestigeReady = calculateCosmicDust(state) > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Sticky Top Header */}
      <Header
        state={state}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(sound.toggle())}
        onOpenOdds={() => setShowOddsModal(true)}
        onOpenFeedback={() => setShowFeedbackModal(true)}
        onClaimOffline={handleClaimOffline}
        onOpenDevDebug={isAdmin ? () => setShowDevModal(true) : undefined}
        onOpenProfile={() => changeTab('profile')}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={() => void handleToggleNotifications()}
      />

      {/* Global Booster Activation Announcement */}
      {boosterAnnouncement && (
        <div className="fixed top-[68px] left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 w-full flex justify-center animate-in slide-in-from-top-3 fade-in duration-200">
          <div className="max-w-xl rounded-2xl border border-fuchsia-400/40 bg-slate-950/95 px-4 py-3 shadow-2xl shadow-fuchsia-950/30 backdrop-blur-md text-center">
            <div className="text-sm font-black text-fuchsia-200">
              u/{boosterAnnouncement.username} activated {boosterAnnouncement.name} booster for 30 minutes!
            </div>
          </div>
        </div>
      )}

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

      {updateAvailable && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>New update, please refresh!</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="shrink-0 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-amber-300 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {developerAnnouncement?.message && (
        <div className="border-b border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-start gap-3">
            <Megaphone className="w-4 h-4 mt-0.5 text-cyan-300 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider font-black text-cyan-300">Developer Announcement</div>
              <div className="mt-1 text-sm text-slate-200 whitespace-pre-wrap break-words">{developerAnnouncement.message}</div>
            </div>
            <button
              onClick={dismissDeveloperAnnouncement}
              className="shrink-0 p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
              title="Dismiss this developer announcement"
              aria-label="Dismiss developer announcement"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showNotificationPrompt && !notificationsEnabled && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-fuchsia-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-black text-fuchsia-300">Notification Setup</div>
                <h2 className="mt-1 text-xl font-black text-white">Keep your Orb alerts coming</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Enable Reddit notifications to get alerts when your offline Orb storage fills up.
                </p>
              </div>
              <button
                onClick={() => setShowNotificationPrompt(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                aria-label="Close notification prompt"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => void handleEnableNotificationsFromPrompt()}
                className="flex-1 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2.5 text-xs font-black text-white"
              >
                Enable Notifications
              </button>
              <button
                onClick={() => setShowNotificationPrompt(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Navigation Bar */}
      <div className="bg-slate-900/40 border-b border-slate-800/80 px-4 py-2 sticky top-[57px] z-20 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">

          <button
            onClick={() => {
              sound.playClick();
              changeTab('roll');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === 'roll'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>Roll</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              changeTab('upgrades');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'upgrades'
                ? 'bg-gradient-to-r from-amber-600 to-yellow-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Upgrades</span>
            {featureForTab('upgrades' as ActiveTab) && (state.level ?? 1) < FEATURE_UNLOCK_LEVELS[featureForTab('upgrades' as ActiveTab)!] && <Lock className="w-3 h-3 text-slate-600" />}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              changeTab('altar');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'altar'
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400 animate-flame" />
            <span>Altar</span>
            {featureForTab('altar' as ActiveTab) && (state.level ?? 1) < FEATURE_UNLOCK_LEVELS[featureForTab('altar' as ActiveTab)!] && <Lock className="w-3 h-3 text-slate-600" />}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              changeTab('mastery');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'mastery'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Mastery</span>
            {featureForTab('mastery' as ActiveTab) && (state.level ?? 1) < FEATURE_UNLOCK_LEVELS[featureForTab('mastery' as ActiveTab)!] && <Lock className="w-3 h-3 text-slate-600" />}
            {(state.masteryPoints ?? 0) > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              changeTab('collection');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === 'collection'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Codex</span>
            {featureForTab('collection' as ActiveTab) && (state.level ?? 1) < FEATURE_UNLOCK_LEVELS[featureForTab('collection' as ActiveTab)!] && <Lock className="w-3 h-3 text-slate-600" />}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              changeTab('quests');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'quests'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>Quests</span>
            {featureForTab('quests' as ActiveTab) && (state.level ?? 1) < FEATURE_UNLOCK_LEVELS[featureForTab('quests' as ActiveTab)!] && <Lock className="w-3 h-3 text-slate-600" />}
            {(streakReady || questsReady) && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              changeTab('social');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === 'social'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Guilds & Social</span>
            {featureForTab('social' as ActiveTab) && (state.level ?? 1) < FEATURE_UNLOCK_LEVELS[featureForTab('social' as ActiveTab)!] && <Lock className="w-3 h-3 text-slate-600" />}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              changeTab('profile');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
              tab === 'profile'
                ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Prestige</span>
            {featureForTab('profile' as ActiveTab) && (state.level ?? 1) < FEATURE_UNLOCK_LEVELS[featureForTab('profile' as ActiveTab)!] && <Lock className="w-3 h-3 text-slate-600" />}
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
              luck: { tier: 0, activationProgress: 0, endsAt: 0 },
              speed: { tier: 0, activationProgress: 0, endsAt: 0 },
              crit: { tier: 0, activationProgress: 0, endsAt: 0 },
            }}
            worldEvent={worldEvent}
            onActivateBooster={handleActivatePremiumBooster}
            onActivateGlobalBooster={handleActivateGlobalBooster}
            onBuyAutomation={handleBuyAutomation}
            onClaimCommunityReward={handleClaimCommunityReward}
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
            onToggleGuildTrust={handleToggleGuildTrust}
            onSetGuildTax={handleSetGuildTax}
            playerUsername={state.username ?? ''}
            playerCoins={state.coins}
            playerShards={state.shards}
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

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          onClose={() => setShowFeedbackModal(false)}
          onSubmit={handleSendFeedback}
        />
      )}

      {/* Fair RNG Odds Table Modal (Design Pillar 2.5) */}
      {showOddsModal && (
        <RarityTableModal onClose={() => setShowOddsModal(false)} />
      )}

      {/* Admin Console */}
      {showDevModal && isAdmin && (
        <DevDebugModal
          onClose={() => setShowDevModal(false)}
          onRefresh={refreshAll}
          onForceRollResult={res => {
            changeTab('roll');
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
