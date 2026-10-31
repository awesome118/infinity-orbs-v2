import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getWebViewMode, requestExpandedMode } from '@devvit/web/client';
import { telemetry } from '@devvit/analytics/client/reddit';
import {
  Sparkles,
  ChevronDown,
  Zap,
  BookOpen,
  Calendar,
  Users,
  Star,
  Dices,
  RefreshCw,
  Flame,
  Bell,
  Shield,
  Swords,
  DoorOpen,
  Package,
  Hammer,
  Megaphone,
  X,
  Gem,
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
  PopupConfig,
  GamePopupId,
  GamePopupEvent,
} from '../shared/game.js';
import type {
  Guild,
  LeaderboardEntry,
  LeaderboardBoards,
  WorldEvent,
  GuildPerkId,
} from '../shared/social.js';
import {
  formatRarity,
  formatNumber,
  cooldownMs,
  calculateCosmicDust,
  MAX_COSMIC_DUST,
  calculateLevelFromXp,
  DEFAULT_POPUP_CONFIG,
  applyLevelProgress,
  createInitialState,
  grantFreeShards,
  spendShards,
  todayKey,
  canShowDailyFrenzyPrompt,
  frenzyCooldownRemaining,
  FRENZY_PROMPT_DELAY_MS,
  FRENZY_OWNER_SHARD_REWARD,
  rollsPerActivation,
  upgradeCost,
  prestigeUpgradeCost,
  masterySkillCost,
  levelAdjustedXpReward,
  PREMIUM_BOOSTERS,
  AUTOMATIONS,
  FEATURE_UNLOCK_LEVELS,

} from '../shared/game.js';
import { sound } from './sound.js';
import { Header } from './components/Header.js';
import { CombatSection } from './components/CombatSection.js';
import type { CombatPage } from '../shared/combat.js';
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
import { GlobalChatWindow } from './components/GlobalChatWindow.js';
import { DevDebugModal } from './components/DevDebugModal.js';
import { FeedbackModal } from './components/FeedbackModal.js';
import { ChangelogModal } from './components/ChangelogModal.js';
import { GettingStartedModal } from './components/GettingStartedModal.js';
import { SplashScreen } from './components/SplashScreen.js';
import { APP_VERSION } from '../shared/version.js';
import './styles.css';
import './ui-polish.css';
import './experience-200.css';
import './mobile-experience.css';

function optimisticShardSpend(
  state: PlayerState,
  amount: number,
): Pick<PlayerState, 'shards' | 'purchasedShards' | 'purchasedShardLots'> | null {
  const next: PlayerState = {
    ...state,
    purchasedShardLots: { ...(state.purchasedShardLots ?? {}) },
  };
  try {
    spendShards(next, amount);
    return {
      shards: next.shards,
      purchasedShards: next.purchasedShards,
      purchasedShardLots: next.purchasedShardLots,
    };
  } catch {
    return null;
  }
}

function swallowJourneyEvent(task: () => Promise<unknown> | unknown): void {
  try { void Promise.resolve(task()).catch(() => undefined); } catch { /* Journeys telemetry must never interrupt gameplay. */ }
}

type ActiveTab =
  | 'roll'
  | 'upgrades'
  | 'boosters'
  | 'altar'
  | 'mastery'
  | 'collection'
  | 'runes'
  | 'quests'
  | 'social'
  | 'profile'
  | 'fight'
  | 'dungeons'
  | 'gear'
  | 'forge'
  | 'skills'
  | 'arena';

const inFlightReadRequests = new Map<string, Promise<unknown>>();

async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const method = String(options?.method ?? 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  if (!isRead || options?.signal) return fetchJson<T>(url, options);

  const requestKey = `${method}:${url}`;
  const existing = inFlightReadRequests.get(requestKey);
  if (existing) return existing as Promise<T>;

  const request = fetchJson<T>(url, options);
  inFlightReadRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (inFlightReadRequests.get(requestKey) === request) inFlightReadRequests.delete(requestKey);
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const method = String(options?.method ?? 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  const maxAttempts = isRead ? 3 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let receivedNonRetryableHttpError = false;
    const requestController = isRead && !options?.signal ? new AbortController() : null;
    const requestTimer = requestController
      ? window.setTimeout(() => requestController.abort(), 15_000)
      : null;
    try {
      const requestOptions = requestController ? { ...options, signal: requestController.signal } : options;
      const res = await fetch(url, requestOptions);
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

        const retryableRead =
          isRead &&
          (res.status === 408 ||
            res.status === 429 ||
            res.status >= 500 ||
            String(message).includes('Player state changed while saving'));

        if (retryableRead && attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 80 * (attempt + 1)));
          continue;
        }

        receivedNonRetryableHttpError = true;
        const httpError = new Error(message) as Error & { status?: number };
        httpError.status = res.status;
        throw httpError;
      }

      return await res.json();
    } catch (error: any) {
      if (requestController?.signal.aborted) {
        throw new Error('The game server took too long to respond. Try again.');
      }
      const retryableNetworkRead =
        isRead &&
        !receivedNonRetryableHttpError &&
        attempt < maxAttempts - 1 &&
        error?.name !== 'AbortError';

      if (retryableNetworkRead) {
        await new Promise(resolve => setTimeout(resolve, 80 * (attempt + 1)));
        continue;
      }
      throw error;
    } finally {
      if (requestTimer !== null) window.clearTimeout(requestTimer);
    }
  }

  throw new Error('Request failed.');
}

async function getJsonWithTimeout<T>(url: string, timeoutMs = 10_000, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await getJson<T>(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`The Infinity Orbs server did not respond within ${Math.max(1, Math.ceil(timeoutMs / 1000))} seconds.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export const FRENZY_CALCULATING_DELAY_MS = 650;
const FRENZY_CALCULATING_MIN_VISIBLE_MS = 420;

function App() {
  const [state, setState] = useState<PlayerState | null>(null);
  const journeyStartPromiseRef = useRef<Promise<void> | null>(null);
  const journeyReadyReportedRef = useRef(false);
  const journeyEndedRef = useRef(false);
  const journeyProgressRef = useRef(0);
  const journeySessionRollsRef = useRef(0);
  const journeyFirstUpgradeTrackedRef = useRef(false);
  const ensureJourneyStarted = useCallback((): Promise<void> => {
    if (!journeyStartPromiseRef.current) {
      journeyStartPromiseRef.current = Promise.resolve()
        .then(() => telemetry.startJourney())
        .then(() => undefined)
        .catch(() => undefined);
    }
    return journeyStartPromiseRef.current;
  }, []);
  const reportJourneyProgress = useCallback((progress: number, action: string) => {
    void ensureJourneyStarted().then(() => {
      if (progress <= journeyProgressRef.current) return;
      journeyProgressRef.current = progress;
      swallowJourneyEvent(() => telemetry.progress({ progress, action }));
    });
  }, [ensureJourneyStarted]);
  const reportJourneyInteraction = useCallback((action: string, actionDetails?: string) => {
    void ensureJourneyStarted().then(() => {
      swallowJourneyEvent(() => telemetry.interaction({ action, ...(actionDetails ? { actionDetails } : {}) }));
    });
  }, [ensureJourneyStarted]);
  useEffect(() => {
    if (!state || journeyReadyReportedRef.current) return;
    journeyReadyReportedRef.current = true;
    swallowJourneyEvent(() => telemetry.appReady());
  }, [state]);
  useEffect(() => {
    const finishJourney = () => {
      if (!journeyStartPromiseRef.current || journeyEndedRef.current) return;
      journeyEndedRef.current = true;
      void journeyStartPromiseRef.current.then(() => {
        swallowJourneyEvent(() => telemetry.endJourney({ complete: journeyProgressRef.current >= 0.35 }));
      });
    };
    window.addEventListener('pagehide', finishJourney);
    return () => window.removeEventListener('pagehide', finishJourney);
  }, []);
  const [authRequired, setAuthRequired] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [splashEntered, setSplashEntered] = useState(false);
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
  const [tab, setTab] = useState<ActiveTab>('roll');
  const [moreNavOpen, setMoreNavOpen] = useState(false);
  useEffect(() => {
    if (!moreNavOpen) return;
    const closeMenu = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setMoreNavOpen(false);
        return;
      }
      if (event instanceof PointerEvent && event.target instanceof Element && !event.target.closest('.io-nav-more-wrap')) {
        setMoreNavOpen(false);
      }
    };
    document.addEventListener('keydown', closeMenu);
    document.addEventListener('pointerdown', closeMenu);
    return () => {
      document.removeEventListener('keydown', closeMenu);
      document.removeEventListener('pointerdown', closeMenu);
    };
  }, [moreNavOpen]);
  const activeTabRef = useRef<ActiveTab>(tab);
  activeTabRef.current = tab;
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  const [tutorialStatusLoaded, setTutorialStatusLoaded] = useState(false);
  useEffect(() => {
    if (!splashEntered || !state) return;
    let active = true;
    let localDone = false;
    try {
      localDone = window.localStorage.getItem('io-first-roll-tutorial-v1') === 'done';
    } catch {
      // The server status still works when embedded-webview storage is unavailable.
    }
    void getJsonWithTimeout<{ seen?: boolean }>('/api/tutorial/first-roll/status', 5_000, { cache: 'no-store' })
      .then(result => {
        if (!active) return;
        const done = result.seen === true || localDone;
        setTutorialDismissed(done);
        if (done) {
          try { window.localStorage.setItem('io-first-roll-tutorial-v1', 'done'); } catch { /* Server persistence is authoritative. */ }
          if (result.seen !== true) {
            void fetch('/api/tutorial/first-roll/complete', { method: 'POST' }).catch(() => undefined);
          }
        }
      })
      .catch(() => {
        if (active) setTutorialDismissed(localDone);
      })
      .finally(() => {
        if (active) setTutorialStatusLoaded(true);
      });
    return () => { active = false; };
  }, [splashEntered, Boolean(state)]);
  useEffect(() => {
    if (tutorialStatusLoaded && !tutorialDismissed && state && state.totalRolls > 0 && state.totalRolls <= 3 && tutorialStep === 0) setTutorialStep(1);
  }, [state?.totalRolls, tutorialDismissed, tutorialStep, tutorialStatusLoaded]);
  const [combatTutorialStep, setCombatTutorialStep] = useState(0);
  const [combatTutorialDismissed, setCombatTutorialDismissed] = useState(() => {
    try { return window.localStorage.getItem('io-combat-tutorial-v1') === 'done'; } catch { return false; }
  });
  const [combatTutorialStatusLoaded, setCombatTutorialStatusLoaded] = useState(false);
  useEffect(() => {
    if (!splashEntered || !state) return;
    let active = true;
    let localDone = false;
    try { localDone = window.localStorage.getItem('io-combat-tutorial-v1') === 'done'; } catch { /* Use server persistence when webview storage is unavailable. */ }
    void getJsonWithTimeout<{ seen?: boolean }>('/api/combat/tutorial/status', 5_000, { cache: 'no-store' })
      .then(result => {
        if (!active) return;
        const done = result.seen === true || localDone;
        setCombatTutorialDismissed(done);
        if (done) {
          try { window.localStorage.setItem('io-combat-tutorial-v1', 'done'); } catch { /* Server is authoritative. */ }
          if (result.seen !== true) {
            void fetch('/api/combat/tutorial/complete', { method: 'POST' }).catch(() => undefined);
          }
        }
      })
      .catch(() => {
        if (active) setCombatTutorialDismissed(localDone);
      })
      .finally(() => {
        if (active) setCombatTutorialStatusLoaded(true);
      });
    return () => { active = false; };
  }, [splashEntered, Boolean(state)]);
  useEffect(() => {
    const coreTutorialDone = tutorialDismissed || Number(state?.totalRolls ?? 0) > 3;
    if (combatTutorialStatusLoaded && coreTutorialDone && !combatTutorialDismissed && state && state.level >= FEATURE_UNLOCK_LEVELS.combat && combatTutorialStep === 0) {
      setCombatTutorialStep(1);
    }
  }, [state?.level, state?.totalRolls, tutorialDismissed, combatTutorialDismissed, combatTutorialStep, combatTutorialStatusLoaded]);
  const combatMode = tab === 'fight' || tab === 'dungeons' || tab === 'gear' || tab === 'forge' || tab === 'skills' || tab === 'arena' || tab === 'runes';
  const combatModeRef = useRef(combatMode);
  combatModeRef.current = combatMode;
  const [autoRoll, setAutoRoll] = useState<boolean>(false);
  const [isBeta, setIsBeta] = useState(false);
  const [changelogUnread, setChangelogUnread] = useState(() => {
    try { return window.localStorage.getItem('io-changelog-viewed-version') !== APP_VERSION; } catch { return true; }
  });

  // Auto Roll is stored in the player save so it survives new sessions,
  // different browsers, and Reddit's embedded webview storage boundaries.
  useEffect(() => {
    setAutoRoll(Boolean(
      !combatMode &&
      state &&
      (state.upgrades.auto ?? 0) > 0 &&
      state.autoRollEnabled === true,
    ));
  }, [combatMode, state?.autoRollEnabled, state?.upgrades.auto]);

  // Persist Auto Roll as OFF while Combat is open, including direct links into a Combat tab.
  useEffect(() => {
    const onCombatBeatState = (event: Event) => {
      combatBeatActiveRef.current = (event as CustomEvent<{active?:boolean}>).detail?.active === true;
    };
    window.addEventListener('io-combat-beat-state', onCombatBeatState);
    return () => window.removeEventListener('io-combat-beat-state', onCombatBeatState);
  }, []);

  useEffect(() => {
    if (!combatMode) {
      autoRollDisableForCombatRef.current = false;
      return;
    }
    setAutoRoll(false);
    if (autoRollDisableForCombatRef.current || stateRef.current?.autoRollEnabled !== true) return;
    autoRollDisableForCombatRef.current = true;
    beginOptimisticState(current => ({ ...current, autoRollEnabled: false }));
    void enqueueMutation(() => getJson<{state:PlayerState}>('/api/auto-roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })).then(res => {
      applyPlayerState(res.state);
      setAutoRoll(false);
    }).catch(() => {
      // Keep Auto Roll disabled locally even if the preference write failed.
      setAutoRoll(false);
      showToast('Auto Roll was stopped for Combat, but the preference could not be saved.', 'warn');
    }).finally(() => {
      autoRollDisableForCombatRef.current = false;
    });
  }, [combatMode, state?.autoRollEnabled]);

  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type?: 'info' | 'success' | 'warn' } | null>(null);

  useEffect(() => {
    if (!splashEntered) return;
    let cancelled = false;
    let inFlight = false;
    const pollAnnouncement = async () => {
      if (cancelled || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const announcement = await getJson<{
          id: GlobalBoosterId;
          name: string;
          username: string;
          activatedAt: number;
        } | null>('/api/global-booster-announcement');
        if (cancelled || !announcement || announcement.activatedAt <= lastBoosterAnnouncementAtRef.current) return;
        lastBoosterAnnouncementAtRef.current = announcement.activatedAt;
        setBoosterAnnouncement(announcement);
        if (boosterAnnouncementTimerRef.current !== null) window.clearTimeout(boosterAnnouncementTimerRef.current);
        boosterAnnouncementTimerRef.current = window.setTimeout(() => {
          setBoosterAnnouncement(null);
          boosterAnnouncementTimerRef.current = null;
        }, 5000);
      } catch {
        // Announcement polling is best-effort and never blocks gameplay.
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void pollAnnouncement(); };
    void pollAnnouncement();
    const interval = window.setInterval(() => void pollAnnouncement(), 5000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (boosterAnnouncementTimerRef.current !== null) {
        window.clearTimeout(boosterAnnouncementTimerRef.current);
        boosterAnnouncementTimerRef.current = null;
      }
    };
  }, [splashEntered]);

  useEffect(() => {
    if (!splashEntered) return;
    let cancelled = false;
    void getJson<{ isBeta: boolean }>('/api/app-info')
      .then(info => { if (!cancelled) setIsBeta(info.isBeta === true); })
      .catch(() => { if (!cancelled) setIsBeta(false); });
    return () => { cancelled = true; };
  }, [splashEntered]);

  useEffect(() => {
    // A post preview is not a player session. Count activity only after Play
    // opens the actual game, otherwise previews inflate online-player counts.
    if (!state || !splashEntered) return;
    const heartbeat = () => {
      if (!splashEntered || document.visibilityState === 'hidden') return;
      void getJson('/api/activity/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: APP_VERSION }),
      }).catch(() => null);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') heartbeat();
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 15_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [Boolean(state), splashEntered]);

  // Social & Community state
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [leaderboards, setLeaderboards] = useState<LeaderboardBoards | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [leaderboardLoadError, setLeaderboardLoadError] = useState<string | null>(null);
  const [guildData, setGuildData] = useState<{ guilds: Guild[]; mine: Guild | null }>({
    guilds: [],
    mine: null,
  });
  const [guildLoading, setGuildLoading] = useState(false);
  const [guildDataLoaded, setGuildDataLoaded] = useState(false);
  const [guildLoadError, setGuildLoadError] = useState<string | null>(null);
  const guildRequestRef = useRef<Promise<{ guilds: Guild[]; mine: Guild | null }> | null>(null);
  const leaderboardRequestRef = useRef<Promise<LeaderboardBoards> | null>(null);
  const guildDataLoadedRef = useRef(false);
  const leaderboardLoadedAtRef = useRef(0);
  const [worldEvent, setWorldEvent] = useState<WorldEvent | null>(null);
  const [developerAnnouncement, setDeveloperAnnouncement] = useState<{ message: string; updatedAt: number; updatedBy: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Modals
  const [shareRarity, setShareRarity] = useState<number | null>(null);
  const [shareIsInfinity, setShareIsInfinity] = useState(false);
  const [showOddsModal, setShowOddsModal] = useState<boolean>(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [showChangelogModal, setShowChangelogModal] = useState<boolean>(false);
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [showDevModal, setShowDevModal] = useState<boolean>(false);
  const [boosterAnnouncement, setBoosterAnnouncement] = useState<{
    id: GlobalBoosterId;
    name: string;
    username: string;
    activatedAt: number;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminStatusUnavailable, setAdminStatusUnavailable] = useState(false);
  const adminStatusInFlightRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(sound.enabled);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationSettingsLoaded, setNotificationSettingsLoaded] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notificationPromptPreview, setNotificationPromptPreview] = useState(false);
  const [notificationPromptShown, setNotificationPromptShown] = useState<boolean>(() => {
    try {
      // v2 deliberately recovers from the original prompt's broken one-time trigger.
      return window.localStorage.getItem('io-notification-prompt-shown-v2') === '1';
    } catch {
      return false;
    }
  });
  const [newBestModalData, setNewBestModalData] = useState<{ orb: Orb; prevBest: number } | null>(null);
  const [frenzyRunTriggered, setFrenzyRunTriggered] = useState(false);
  const [showFrenzyCalculating, setShowFrenzyCalculating] = useState(false);
  const [frenzyProgress, setFrenzyProgress] = useState<{ active: boolean; processed: number; total: number; percent: number }>({
    active: false, processed: 0, total: 0, percent: 0,
  });
  const [frenzyDisplayedProcessed, setFrenzyDisplayedProcessed] = useState(0);
  const frenzyProgressCount = Math.min(
    Math.max(0, frenzyProgress.total),
    Math.max(frenzyProgress.processed, frenzyDisplayedProcessed),
  );
  const frenzyProgressPercent = frenzyProgress.percent >= 100
    ? 100
    : frenzyProgress.total > 0
      ? Math.min(95, (frenzyProgressCount / frenzyProgress.total) * 95)
      : frenzyProgress.percent;
  const [frenzyArmed, setFrenzyArmed] = useState(false);
  const [showFrenzyPrompt, setShowFrenzyPrompt] = useState(false);
  const [frenzyPromptPreview, setFrenzyPromptPreview] = useState(false);
  const [popupConfig, setPopupConfig] = useState<PopupConfig>(() => ({ ...DEFAULT_POPUP_CONFIG }));
  const [popupConfigLoaded, setPopupConfigLoaded] = useState(false);
  const [showJoinSubredditPrompt, setShowJoinSubredditPrompt] = useState(false);
  const [joinSubredditPreview, setJoinSubredditPreview] = useState(false);
  const [joinSubredditName, setJoinSubredditName] = useState('infinityorbs');
  const [followRewardClaimed, setFollowRewardClaimed] = useState(false);
  const [followRewardStatusLoaded, setFollowRewardStatusLoaded] = useState(false);
  const [claimingFollowReward, setClaimingFollowReward] = useState(false);
  const followPromptShownRef = useRef(false);
  const notificationPromptShownRef = useRef(false);
  const [frenzyThanksPrompt, setFrenzyThanksPrompt] = useState<{ rarity: number; isInfinity?: boolean; ownerUsername: string; postId: string; message: string } | null>(null);
  const [postingFrenzyThanks, setPostingFrenzyThanks] = useState(false);
  const frenzyPromptShownRef = useRef(false);
  const frenzyClaimActiveRef = useRef(false);
  const componentMountedRef = useRef(true);
  const stateRevisionRef = useRef(0);
  const refreshSequenceRef = useRef(0);
  const authSessionEpochRef = useRef(0);

  const trackPopupEvent = useCallback((popup: GamePopupId, event: GamePopupEvent) => {
    void getJson<{ recorded?: boolean; excluded?: boolean }>('/api/popups/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ popup, event }),
    }).then(result => {
      if (result.recorded !== true && result.excluded !== true) {
        console.warn('[Popup Analytics] Server did not confirm the event:', popup, event, result);
      }
    }).catch(error => {
      console.error('[Popup Analytics] Failed to record event:', popup, event, error);
    });
  }, []);

  useEffect(() => {
    if (!splashEntered) return;
    let active = true;
    setPopupConfigLoaded(false);
    setFollowRewardStatusLoaded(false);
    void Promise.all([
      getJson<{ config?: Partial<PopupConfig> }>('/api/popups/config', { cache: 'no-store' })
        .catch(() => ({ config: { ...DEFAULT_POPUP_CONFIG } })),
      getJson<{ claimed?: boolean; subredditName?: string }>('/api/follow-reward/status', { cache: 'no-store' })
        .catch(() => ({ claimed: false, subredditName: 'infinityorbs' })),
    ]).then(([configResult, rewardStatus]) => {
      if (!active) return;
      setPopupConfig({ ...DEFAULT_POPUP_CONFIG, ...(configResult.config ?? {}) });
      setPopupConfigLoaded(true);
      setFollowRewardClaimed(rewardStatus.claimed === true);
      setJoinSubredditName(String(rewardStatus.subredditName ?? 'infinityorbs').replace(/^r\//i, '').trim() || 'infinityorbs');
      setFollowRewardStatusLoaded(true);
    }).catch(() => {
      if (!active) return;
      setPopupConfig({ ...DEFAULT_POPUP_CONFIG });
      setPopupConfigLoaded(true);
      setFollowRewardStatusLoaded(true);
    });
    return () => { active = false; };
  }, [splashEntered]);

  useEffect(() => {
    // React Strict Mode replays effects in development. Restore the mounted
    // flag on every setup so the replayed cleanup cannot suppress real claims.
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);
  const appliedServerGenerationRef = useRef(-1);
  const appliedServerRevisionRef = useRef(-1);
  const stateRef = useRef<PlayerState | null>(null);
  const onlinePlayersRef = useRef<number | undefined>(undefined);
  const latestGlobalBoostersRef = useRef<GlobalBoosterSnapshot | null>(null);
  const rollTicketRef = useRef<{
    ticketId: string;

    nextIndex: number;
    rollsRemaining: number;
    expiresAt: number;
  } | null>(null);
  const rollTicketRequestRef = useRef<Promise<{
    ticketId: string;

    nextIndex: number;
    rollsRemaining: number;
    expiresAt: number;
  }> | null>(null);
  const rollActionLockRef = useRef(false);
  const combatBeatActiveRef = useRef(false);
  const autoRollDisableForCombatRef = useRef(false);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingMutationCountRef = useRef(0);
  const mutationResyncNeededRef = useRef(false);
  const upgradeBatchQueueRef = useRef<UpgradeId[]>([]);
  const upgradeBatchTimerRef = useRef<number | null>(null);
  const upgradeBatchInFlightRef = useRef(false);
  const flushUpgradeBatchRef = useRef<(() => Promise<void>) | null>(null);
  const lastBoosterAnnouncementAtRef = useRef(0);
  const boosterAnnouncementTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const applyPlayerState = useCallback((nextState: PlayerState) => {
    const nextServerRevision = Number(nextState.stateRevision);
    const nextServerGeneration = Number(nextState.saveGeneration);
    const currentState = stateRef.current;

    // Revisions restart when a save generation is replaced. Compare generation
    // first, then revision within that generation, so a reset/wipe is accepted
    // while delayed reads from the previous save are still rejected.
    if (
      !Number.isSafeInteger(nextServerGeneration) || nextServerGeneration < 0 ||
      !Number.isSafeInteger(nextServerRevision) || nextServerRevision < 0
    ) {
      return;
    }
    if (nextServerGeneration < appliedServerGenerationRef.current) return;

    const isNewServerGeneration =
      nextServerGeneration > appliedServerGenerationRef.current;
    if (!isNewServerGeneration) {
      if (nextServerRevision < appliedServerRevisionRef.current) return;

      // A same-generation snapshot must not change balances without advancing
      // the durable revision. That was allowing a delayed initial /api/me read
      // to roll the resource bar back to zero after the first saved roll.
      if (
        nextServerRevision === appliedServerRevisionRef.current &&
        currentState &&
        (
          (nextState.coins ?? 0) !== (currentState.coins ?? 0) ||
          (nextState.shards ?? 0) !== (currentState.shards ?? 0) ||
          (nextState.xp ?? 0) !== (currentState.xp ?? 0) ||
          (nextState.level ?? 1) !== (currentState.level ?? 1) ||
          (nextState.totalRolls ?? 0) !== (currentState.totalRolls ?? 0) ||
          (nextState.freeRolls ?? 0) !== (currentState.freeRolls ?? 0) ||
          (nextState.highestRarity ?? 0) !== (currentState.highestRarity ?? 0) ||
          (nextState.collectionValue ?? 0) !== (currentState.collectionValue ?? 0) ||
          (nextState.prestigeCount ?? 0) !== (currentState.prestigeCount ?? 0)
        )
      ) {
        return;
      }
    }

    appliedServerGenerationRef.current = nextServerGeneration;
    appliedServerRevisionRef.current = nextServerRevision;

    if (
      onlinePlayersRef.current == null &&
      Number.isSafeInteger(nextState.onlinePlayers) &&
      Number(nextState.onlinePlayers) >= 0
    ) {
      onlinePlayersRef.current = Number(nextState.onlinePlayers);
    }
    // Global Boosters are shared state with their own polling timeline. Keep the
    // freshest accepted snapshot across delayed /api/me and mutation responses,
    // just as we preserve the live online-player overlay.
    const currentGlobalBoosters =
      latestGlobalBoostersRef.current ?? currentState?.globalBoosters ?? nextState.globalBoosters ?? null;
    if (latestGlobalBoostersRef.current == null && currentGlobalBoosters != null) {
      latestGlobalBoostersRef.current = currentGlobalBoosters;
    }
    const mergedState = {
      ...nextState,
      ...(onlinePlayersRef.current == null ? {} : { onlinePlayers: onlinePlayersRef.current }),
      ...(currentGlobalBoosters == null ? {} : { globalBoosters: currentGlobalBoosters }),
    };
    stateRef.current = mergedState;
    stateRevisionRef.current += 1;
    setState(mergedState);
  }, []);
  // Mutations are optimistic on the client: update the visible state immediately,
  // then let the server verify/save it. Rejections restore the exact prior state.
  // The authoritative server response always replaces the speculative state.
  const beginOptimisticState = useCallback(
    (patch: (current: PlayerState) => PlayerState): (() => void) | null => {
      const previousState = stateRef.current;
      if (!previousState) return null;
      const nextState = patch(previousState);
      const optimisticRevision = stateRevisionRef.current + 1;
      stateRef.current = nextState;
      stateRevisionRef.current = optimisticRevision;
      setState(nextState);
      return () => {
        // Never let a late failure restore an older snapshot over a newer
        // optimistic action or an already-applied server response.
        if (stateRevisionRef.current !== optimisticRevision) return;
        stateRevisionRef.current += 1;
        const restoredState = onlinePlayersRef.current == null
          ? previousState
          : { ...previousState, onlinePlayers: onlinePlayersRef.current };
        stateRef.current = restoredState;
        setState(restoredState);
      };
    },
    [state],
  );

  const enqueueMutation = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = mutationQueueRef.current.then(task, task);
    mutationQueueRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  const ensureRollTicket = useCallback(async () => {
    const requestSessionEpoch = authSessionEpochRef.current;
    const current = rollTicketRef.current;
    if (current && current.nextIndex < 30 && current.expiresAt > Date.now()) {
      return current;
    }

    if (!rollTicketRequestRef.current) {
      const pending = getJson<{
        ticketId: string;
        nextIndex: number;
        rollsRemaining: number;
        expiresAt: number;
      }>('/api/roll-ticket');
      const tracked = pending.finally(() => {
        // An older session's request must not clear a newer session's in-flight ticket.
        if (rollTicketRequestRef.current === tracked) rollTicketRequestRef.current = null;
      });
      rollTicketRequestRef.current = tracked;
    }

    const ticket = await rollTicketRequestRef.current;
    if (requestSessionEpoch !== authSessionEpochRef.current) {
      throw new Error('REDDIT_LOGIN_REQUIRED');
    }
    rollTicketRef.current = ticket;
    return ticket;
  }, []);

  const dismissedDeveloperAnnouncementRef = useRef<number>(
    (() => {
      try {
        return Number(window.localStorage.getItem('io-developer-announcement-dismissed-at') ?? 0) || 0;
      } catch {
        return 0;
      }
    })(),
  );

  const finishTutorial = () => {
    setTutorialDismissed(true);
    setTutorialStep(0);
    try { window.localStorage.setItem('io-first-roll-tutorial-v1', 'done'); } catch { /* Embedded webviews may disable storage. */ }
    void fetch('/api/tutorial/first-roll/complete', { method: 'POST' }).catch(() => undefined);
  };

  const finishCombatTutorial = () => {
    setCombatTutorialDismissed(true);
    setCombatTutorialStep(0);
    try { window.localStorage.setItem('io-combat-tutorial-v1', 'done'); } catch { /* Server-side completion is the fallback. */ }
    void fetch('/api/combat/tutorial/complete', { method: 'POST' }).catch(() => undefined);
  };

  const featureForTab = (nextTab: ActiveTab): FeatureId | null => {
    if (nextTab === 'upgrades') return 'upgrades';
    if (nextTab === 'quests') return 'quests';
    if (nextTab === 'collection') return 'collection';
    if (nextTab === 'boosters') return 'boosters';
    if (nextTab === 'social') return 'social';
    if (nextTab === 'altar') return 'altar';
    if (nextTab === 'mastery') return 'mastery';
    // Profile also explains levels and milestones to new players. Keep it open
    // even before Prestige itself unlocks; its actions already have their own gates.
    if (nextTab === 'profile') return null;
    if (nextTab === 'fight' || nextTab === 'dungeons' || nextTab === 'gear' || nextTab === 'forge' || nextTab === 'skills' || nextTab === 'arena' || nextTab === 'runes') return 'combat';
    return null;
  };

  const tabNames: Partial<Record<ActiveTab, string>> = {
    boosters: 'Boosters',
    altar: 'Altar',
    mastery: 'Mastery',
    collection: 'Collection',
    social: 'Community',
    profile: 'Progress',
    fight: 'Combat',
    dungeons: 'Combat',
    gear: 'Combat',
    forge: 'Combat',
    skills: 'Combat',
    arena: 'Combat',
    runes: 'Runes',
  };

  const changeTab = (nextTab: ActiveTab) => {
    const feature = featureForTab(nextTab);
    if (feature && (state?.level ?? 1) < FEATURE_UNLOCK_LEVELS[feature]) {
      showToast(
        `Reach Level ${FEATURE_UNLOCK_LEVELS[feature]} to open ${tabNames[nextTab] ?? nextTab}.`,
        'info',
      );
      return;
    }
    const targetIsCombatMode = nextTab === 'fight' || nextTab === 'dungeons' || nextTab === 'gear' || nextTab === 'forge' || nextTab === 'skills' || nextTab === 'arena' || nextTab === 'runes';
    if (targetIsCombatMode && rollActionLockRef.current) {
      showToast('Finish the current roll before entering Combat.', 'info');
      return;
    }
    if (combatMode && !targetIsCombatMode && combatBeatActiveRef.current) {
      showToast('Wait for the current combat beat to finish before leaving Combat.', 'info');
      return;
    }
    if (combatMode && !targetIsCombatMode) window.dispatchEvent(new CustomEvent('io-combat-leaving'));
    // Update synchronously so stale interval callbacks cannot roll during a tab transition.
    combatModeRef.current = targetIsCombatMode;
    if (targetIsCombatMode) {
      setAutoRoll(false);
      if (stateRef.current?.autoRollEnabled === true) {
        beginOptimisticState(current => ({ ...current, autoRollEnabled: false }));
        void enqueueMutation(() => getJson<{state:PlayerState}>('/api/auto-roll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        })).then(res => {
          applyPlayerState(res.state);
          setAutoRoll(false);
        }).catch(() => {
          setAutoRoll(false);
          showToast('Auto Roll was stopped for Combat, but the preference could not be saved.', 'warn');
        });
      }
    }
    sound.playClick();
    setTab(nextTab);
    setMoreNavOpen(false);
    reportJourneyInteraction('tab_opened', nextTab);
    if (targetIsCombatMode) reportJourneyProgress(0.65, 'combat_opened');
  };

  const renderNavItem = (
    target: ActiveTab,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    showIndicator = false,
    extraClassName = '',
  ) => {
    const active = tab === target;
    const feature = featureForTab(target);
    const unlockLevel = feature ? FEATURE_UNLOCK_LEVELS[feature] : 1;
    const locked = Boolean(feature && (state?.level ?? 1) < unlockLevel);
    return (
      <button
        key={target}
        type="button"
        onClick={() => changeTab(target)}
        aria-current={active ? 'page' : undefined}
        aria-label={locked ? `${label}, unlocks at level ${unlockLevel}` : label}
        title={locked ? `${label} unlocks at Level ${unlockLevel}.` : undefined}
        className={`nav-tab io-nav-item${active ? ' is-active' : ''}${locked ? ' is-locked' : ''}${extraClassName ? ` ${extraClassName}` : ''}`}
      >
        <Icon className="io-nav-icon" />
        <span className="io-nav-label">{label}</span>
        {locked
          ? <span className="io-nav-unlock">Lv {unlockLevel}</span>
          : showIndicator && <span className="io-nav-indicator" aria-label="Ready to claim" />}
      </button>
    );
  };

  const showToast = (msg: string, type: 'info' | 'success' | 'warn' = 'info') => {
    // Reset the old timer so a repeated message stays visible for a full 4 seconds.
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(prev => (prev?.msg === msg ? null : prev));
      toastTimerRef.current = null;
    }, 4000);
  };

  const handleToggleAutoRoll = useCallback(async () => {
    if (combatModeRef.current) return;
    const next = !autoRoll;
    const rollback = beginOptimisticState(current => ({
      ...current,
      autoRollEnabled: next,
    }));
    setAutoRoll(next);
    try {
      const res = await enqueueMutation(() =>
        getJson<{ state: PlayerState }>('/api/auto-roll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        }),
      );
      applyPlayerState(res.state);
      setAutoRoll(res.state.autoRollEnabled === true);
    } catch {
      rollback?.();
      setAutoRoll(!next);
      showToast('Could not save Auto Roll preference.', 'warn');
    }
  }, [applyPlayerState, autoRoll, beginOptimisticState, enqueueMutation, showToast, combatMode]);

  const refreshLeaderboards = useCallback(async (force = false) => {
    if (!force && leaderboardLoadedAtRef.current > 0 && Date.now() - leaderboardLoadedAtRef.current < 30_000) return;
    if (leaderboardRequestRef.current) {
      await leaderboardRequestRef.current;
      return;
    }

    setLeaderboardLoading(true);
    const requestUrl = force ? '/api/leaderboards?fresh=1' : '/api/leaderboards';
    const request = getJsonWithTimeout<LeaderboardBoards>(requestUrl, 20_000, { cache: 'no-store' });
    leaderboardRequestRef.current = request;
    try {
      const boards = await request;
      if (!componentMountedRef.current) return;
      setLeaderboards(boards);
      const collectionBoard = Array.isArray(boards.collectionValue) ? boards.collectionValue : [];
      setLeaderboardData(collectionBoard);
      setLeaderboardLoadError(null);
      leaderboardLoadedAtRef.current = Date.now();
      setLeaderboardLoaded(true);
    } catch (error) {
      if (componentMountedRef.current) {
        setLeaderboardLoadError(error instanceof Error ? error.message : 'Leaderboards could not be loaded.');
      }
      throw error;
    } finally {
      if (leaderboardRequestRef.current === request) leaderboardRequestRef.current = null;
      if (componentMountedRef.current) setLeaderboardLoading(false);
    }
  }, []);

  const refreshGuildData = useCallback(async () => {
    setGuildLoading(true);
    let request = guildRequestRef.current;
    if (!request) {
      request = getJson<{ guilds: Guild[]; mine: Guild | null }>('/api/guilds', { cache: 'no-store' });
      guildRequestRef.current = request;
    }
    try {
      const data = await request;
      if (!componentMountedRef.current) return;
      setGuildData(data);
      setGuildLoadError(null);
      guildDataLoadedRef.current = true;
      setGuildDataLoaded(true);
    } catch (error) {
      if (componentMountedRef.current) {
        setGuildLoadError(error instanceof Error ? error.message : 'Guild data could not be loaded.');
      }
      throw error;
    } finally {
      if (guildRequestRef.current === request) guildRequestRef.current = null;
      if (componentMountedRef.current) setGuildLoading(false);
    }
  }, []);

  const refreshAdminStatus = useCallback(async (): Promise<'allowed' | 'denied' | 'retry'> => {
    if (adminStatusInFlightRef.current) return 'retry';
    adminStatusInFlightRef.current = true;
    try {
      const status = await getJsonWithTimeout<{ isAdmin: boolean }>('/api/dev/status', 8_000, { cache: 'no-store' });
      if (!componentMountedRef.current) return 'retry';
      const allowed = status.isAdmin === true;
      setIsAdmin(allowed);
      setAdminStatusUnavailable(false);
      return allowed ? 'allowed' : 'denied';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : NaN;
      // The admin router intentionally returns 404 to non-admins. That is a
      // definitive answer; transient failures keep the last confirmed access
      // state and are retried instead of hiding the console permanently.
      if (statusCode === 403 || statusCode === 404 || /\bHTTP (?:403|404)\b/.test(message)) {
        if (componentMountedRef.current) {
          setIsAdmin(false);
          setAdminStatusUnavailable(false);
        }
        return 'denied';
      }
      if (componentMountedRef.current) setAdminStatusUnavailable(true);
      return 'retry';
    } finally {
      adminStatusInFlightRef.current = false;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const refreshSequence = ++refreshSequenceRef.current;
    const revisionAtStart = stateRevisionRef.current;
    try {
      const me = await getJsonWithTimeout<PlayerState>('/api/me');
      if (!componentMountedRef.current) return;
      try { window.sessionStorage.removeItem('io-wipe-recovery'); } catch { /* Embedded storage is optional. */ }
      if (refreshSequence !== refreshSequenceRef.current || revisionAtStart !== stateRevisionRef.current) return;
      applyPlayerState(me);
      setAuthRequired(false);
      setStartupError(null);
      if (!splashEntered) return;

      if (me.gameBan?.active) return;
      const isCurrentRefresh = () =>
        componentMountedRef.current && refreshSequence === refreshSequenceRef.current;
      const communityReads = [
        ...(activeTabRef.current === 'social'
          ? [refreshLeaderboards().catch(() => undefined), refreshGuildData().catch(() => undefined)]
          : []),
        getJson<WorldEvent | null>('/api/world-event')
          .then(value => { if (isCurrentRefresh()) setWorldEvent(value); })
          .catch(() => undefined),
        getJson<{ message: string; updatedAt: number; updatedBy: string } | null>('/api/developer-announcement')
          .then(value => { if (isCurrentRefresh()) setDeveloperAnnouncement(value?.message ? value : null); })
          .catch(() => undefined),
        getJson<{ enabled: boolean }>('/api/notifications')
          .then(value => {
            if (!isCurrentRefresh()) return;
            setNotificationsEnabled(value.enabled === true);
            setNotificationSettingsLoaded(true);
          })
          .catch(() => {
            if (!isCurrentRefresh()) return;
            setNotificationsEnabled(false);
            setNotificationSettingsLoaded(true);
          }),
      ];
      // Each panel paints as soon as its own request completes instead of
      // waiting for the slowest community endpoint to finish.
      await Promise.all(communityReads);
    } catch (e: any) {
      // Do not let a late error from an older request clear a newer session or
      // overwrite a newer successful refresh with a stale network error.
      if (!componentMountedRef.current) return;
      if (refreshSequence !== refreshSequenceRef.current || revisionAtStart !== stateRevisionRef.current) return;
      if (e?.message === 'REDDIT_LOGIN_REQUIRED') {
        setAuthRequired(true);
        stateRef.current = null;
        onlinePlayersRef.current = undefined;
        appliedServerGenerationRef.current = -1;
        appliedServerRevisionRef.current = -1;
        stateRevisionRef.current += 1;
        authSessionEpochRef.current += 1;
        rollTicketRef.current = null;
        rollTicketRequestRef.current = null;
        setState(null);
        setIsAdmin(false);
        setStartupError(null);
        return;
      }
      const message = e?.message || 'Could not connect to the Infinity Orbs server.';
      setStartupError(message);
      console.error('Refresh error:', e);
    }
  }, [applyPlayerState, refreshGuildData, refreshLeaderboards, splashEntered]);

  // Admin discovery must not delay the game or community panels. A brief
  // status outage retries with backoff while preserving any confirmed access.
  useEffect(() => {
    if (!splashEntered || !state) return;
    let cancelled = false;
    let retryTimer: number | null = null;
    let periodicTimer: number | null = null;
    let retryAttempt = 0;
    let lastResult: 'allowed' | 'denied' | 'retry' | null = null;
    const retryDelays = [1_000, 3_000, 8_000, 15_000, 30_000];

    const scheduleRetry = () => {
      if (cancelled || retryTimer !== null) return;
      const delay = retryDelays[Math.min(retryAttempt, retryDelays.length - 1)];
      retryAttempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void checkStatus();
      }, delay);
    };

    const checkStatus = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      const result = await refreshAdminStatus();
      if (cancelled) return;
      lastResult = result;
      if (result === 'retry') {
        scheduleRetry();
        return;
      }
      retryAttempt = 0;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (result === 'allowed' && periodicTimer === null) {
        periodicTimer = window.setInterval(() => void checkStatus(), 60_000);
      } else if (result === 'denied' && periodicTimer !== null) {
        window.clearInterval(periodicTimer);
        periodicTimer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || lastResult === 'denied') return;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      void checkStatus();
    };

    void checkStatus();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (periodicTimer !== null) window.clearInterval(periodicTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshAdminStatus, splashEntered, Boolean(state)]);

  useEffect(() => {
    if (!splashEntered || !stateRef.current) return;
    void ensureRollTicket().catch(() => null);
  }, [state?.stateRevision, ensureRollTicket, splashEntered]);

  // First pass loads the save for the splash; toggling splashEntered reruns
  // refreshAll to fetch the remaining panels once the player presses Play.
  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

    // Live developer announcement feed. All open clients poll the same Redis-backed
  // announcement so edits appear automatically without requiring a page refresh.
  useEffect(() => {
    if (!splashEntered) return;
    let cancelled = false;
    let inFlight = false;
    const pollDeveloperAnnouncement = async () => {
      if (cancelled || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const announcement = await getJson<{ message: string; updatedAt: number; updatedBy: string } | null>('/api/developer-announcement');
        if (cancelled) return;
        if (!announcement?.message) {
          setDeveloperAnnouncement(null);
          return;
        }
        setDeveloperAnnouncement(announcement.updatedAt > dismissedDeveloperAnnouncementRef.current ? announcement : null);
      } catch {
        // Announcement polling is best-effort and never blocks gameplay.
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void pollDeveloperAnnouncement(); };
    void pollDeveloperAnnouncement();
    const interval = window.setInterval(() => void pollDeveloperAnnouncement(), 10000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [splashEntered]);

  // Detect when the installed game has a newer client bundle. The endpoint is
  // deliberately uncached so stale Reddit/CDN responses do not hide updates.
  useEffect(() => {
    if (!splashEntered) return;
    let cancelled = false;
    let inFlight = false;
    const checkForUpdate = async () => {
      if (cancelled || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const res = await fetch('/api/version?check=' + Date.now(), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (cancelled || !res.ok) return;
        const data = await res.json() as { version?: string };
        if (!cancelled && data.version && data.version !== APP_VERSION) setUpdateAvailable(true);
      } catch {
        // Update detection is best-effort and never blocks gameplay.
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void checkForUpdate(); };
    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), 30_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [splashEntered]);

  // Refresh live community state while visible; hidden webviews should not poll.
  useEffect(() => {
    if (!splashEntered) return;
    const pollInterval = tab === 'social' ? 10_000 : 20_000;
    let cancelled = false;
    let worldEventInFlight = false;
    let guildInFlight = false;
    const refreshCommunityState = () => {
      if (!splashEntered || document.visibilityState === 'hidden') return;

      // Keep the two requests on independent polling lanes. A slow or stuck
      // world-event request must never lock out later Guild refreshes.
      if (!worldEventInFlight) {
        worldEventInFlight = true;
        void (async () => {
          try {
            const we = await getJson<WorldEvent | null>('/api/world-event');
            if (!cancelled) setWorldEvent(we);
          } catch {
            if (!cancelled) setWorldEvent(null);
          } finally {
            worldEventInFlight = false;
          }
        })();
      }

      if (tab === 'social' && !guildInFlight) {
        guildInFlight = true;
        if (!guildDataLoadedRef.current) setGuildLoading(true);
        void (async () => {
          try {
            const gd = await getJson<{ guilds: Guild[]; mine: Guild | null }>('/api/guilds', { cache: 'no-store' });
            if (!cancelled) {
              setGuildData(gd);
              setGuildLoadError(null);
              guildDataLoadedRef.current = true;
              setGuildDataLoaded(true);
            }
          } catch (error) {
            // Preserve the last successful Guild snapshot while exposing a retryable error.
            if (!cancelled) {
              setGuildLoadError(error instanceof Error ? error.message : 'Guild data could not be loaded.');
            }
          } finally {
            guildInFlight = false;
            if (!cancelled) setGuildLoading(false);
          }
        })();
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void refreshCommunityState(); };
    void refreshCommunityState();
    const interval = window.setInterval(() => void refreshCommunityState(), pollInterval);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tab, splashEntered]);

  // Global Boosters are shared state, so refresh them independently of player-state polling.
  useEffect(() => {
    if (!splashEntered || tab !== 'boosters') return;
    let cancelled = false;
    let inFlight = false;
    const refreshGlobalBoosters = async () => {
      if (cancelled || !splashEntered || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const snapshot = await getJson<GlobalBoosterSnapshot>('/api/global-boosters');
        if (cancelled || !snapshot) return;
        latestGlobalBoostersRef.current = snapshot;
        if (stateRef.current) stateRef.current = { ...stateRef.current, globalBoosters: snapshot };
        setState(prev => prev ? { ...prev, globalBoosters: snapshot } : prev);
      } catch {
        // A failed shared-state refresh is retried on the next visible poll.
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void refreshGlobalBoosters(); };
    void refreshGlobalBoosters();
    const interval = window.setInterval(() => void refreshGlobalBoosters(), 5000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tab, splashEntered]);

  // Presence is independent from player-state persistence. Do not poll /api/me
  // here because game-state reads must never be responsible for saving the player.
  useEffect(() => {
    if (!splashEntered) return;
    let cancelled = false;
    let inFlight = false;
    const refreshPresence = async () => {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const { onlinePlayers } = await getJson<{ onlinePlayers: number }>('/api/online');
        if (cancelled) return;
        const safeOnlinePlayers = Number.isSafeInteger(onlinePlayers) ? Math.max(0, onlinePlayers) : 0;
        onlinePlayersRef.current = safeOnlinePlayers;
        if (stateRef.current) stateRef.current = { ...stateRef.current, onlinePlayers: safeOnlinePlayers };
        setState(prev => prev ? { ...prev, onlinePlayers: safeOnlinePlayers } : prev);
      } catch {
        // Presence is supplementary; retry on the next visible poll.
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void refreshPresence(); };
    void refreshPresence();
    const presenceInterval = window.setInterval(() => void refreshPresence(), 10_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(presenceInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [splashEntered]);

  useEffect(() => {
    if (!state || !splashEntered || frenzyRunTriggered || frenzyClaimActiveRef.current) return;

    let frenzyCalculatingTimeout: number | null = null;
    let frenzyCalculatingShownAt = 0;
    let frenzyProgressInterval: number | null = null;
    let frenzyProgressDisplayInterval: number | null = null;
    let frenzyProgressPollInFlight = false;
    let latestProgressSnapshot = { processed: 0, total: 0 };
    let activeFrenzyPostId: string | null = null;
    let activeFrenzyAttemptId: string | null = null;
    const stopFrenzyProgressPolling = () => {
      if (frenzyProgressInterval !== null) {
        window.clearInterval(frenzyProgressInterval);
        frenzyProgressInterval = null;
      }
      if (frenzyProgressDisplayInterval !== null) {
        window.clearInterval(frenzyProgressDisplayInterval);
        frenzyProgressDisplayInterval = null;
      }
    };
    const refreshFrenzyProgress = async () => {
      if (frenzyProgressPollInFlight) return;
      frenzyProgressPollInFlight = true;
      try {
        const progress = await getJson<{
          postId: string | null;
          attemptId: string | null;
          updatedAt: number | null;
          active: boolean;
          processed: number;
          total: number;
          percent: number;
          completed: boolean;
        }>('/api/frenzy/progress');
        if (
          progress.postId !== activeFrenzyPostId ||
          progress.attemptId !== activeFrenzyAttemptId
        ) return;
        if (componentMountedRef.current) {
          const nextProcessed = Math.max(0, Math.floor(Number(progress.processed) || 0));
          const nextTotal = Math.max(0, Math.floor(Number(progress.total) || 0));
          latestProgressSnapshot = {
            processed: Math.max(latestProgressSnapshot.processed, nextProcessed),
            total: Math.max(latestProgressSnapshot.total, nextTotal),
          };
          setFrenzyDisplayedProcessed(current => Math.max(current, latestProgressSnapshot.processed));
          setFrenzyProgress(current => ({
            active: progress.active === true,
            processed: Math.max(current.processed, nextProcessed),
            total: Math.max(current.total, nextTotal),
            percent: Math.max(current.percent, Math.max(0, Math.min(100, Number(progress.percent) || 0))),
          }));
        }
      } catch {
        // Progress is display-only; keep the claim moving if polling is unavailable.
      } finally {
        frenzyProgressPollInFlight = false;
      }
    };

    const resolveFrenzy = async () => {
      // Lock before the first await. Effect replay must not run a second
      // handoff preflight before the first request reaches its claim guard.
      frenzyClaimActiveRef.current = true;
      let readyToClaim = false;
      let claimedFrenzyInfo: { rarity: number; isInfinity?: boolean; ownerUsername: string; postId: string } | null = null;
      let lastPreflightError: unknown = null;

      // Retry only the read-only handoff/info checks. Retrying the claim POST
      // after a network error is unsafe because the server may have committed
      // the reward even when the response did not reach this webview.
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          const handoff = await getJson<{ armed: boolean }>('/api/frenzy/handoff');
          // Only an explicitly armed post claim may auto-claim. If no handoff
          // exists, leave ordinary game launches untouched and avoid polling.
          if (!handoff.armed) return;

          const info = await getJson<{
            rarity: number;
            isInfinity?: boolean;
            ownerUsername: string;
            createdAt: number;
            claimedToday: boolean;
            isOwner: boolean;
            canClaim: boolean;
            selfClaimTest: boolean;
            postId: string;
            inGame?: boolean;
          }>('/api/frenzy/info');

          // Only a Frenzy claim explicitly armed from the public Frenzy post
          // may auto-claim here. Simply opening the game must never consume a Frenzy.
          if (!info.inGame || !info.canClaim) return;
          claimedFrenzyInfo = { rarity: info.rarity, isInfinity: info.isInfinity === true, ownerUsername: info.ownerUsername, postId: info.postId };
          readyToClaim = true;
          break;
        } catch (error) {
          lastPreflightError = error;
          if (attempt < 11) await new Promise(resolve => window.setTimeout(resolve, 150));
        }
      }

      if (!readyToClaim) {
        if (lastPreflightError) throw lastPreflightError;
        return;
      }

      if (!componentMountedRef.current) return;
      setFrenzyRunTriggered(true);
      setBusy(true);
      setIsRolling(true);
      setShowFrenzyCalculating(false);
      activeFrenzyPostId = claimedFrenzyInfo?.postId ?? null;
      activeFrenzyAttemptId = window.crypto?.randomUUID?.()
        ?? `frenzy-${Date.now().toString(36)}-${Math.floor(window.performance.now() * 1000).toString(36)}`;
      latestProgressSnapshot = { processed: 0, total: 0 };
      setFrenzyDisplayedProcessed(0);
      setFrenzyProgress({ active: true, processed: 0, total: 0, percent: 0 });
      void refreshFrenzyProgress();
      frenzyProgressInterval = window.setInterval(() => { void refreshFrenzyProgress(); }, 250);
      // Smooth the visible counter between authoritative server snapshots.
      // The estimate is capped close to the last confirmed count and never past the true target.
      frenzyProgressDisplayInterval = window.setInterval(() => {
        const { processed, total } = latestProgressSnapshot;
        if (total <= 0) return;
        setFrenzyDisplayedProcessed(current => {
          const base = Math.max(current, processed);
          const ceiling = Math.min(total, processed + Math.max(500, Math.ceil(total * 0.01)));
          if (base >= ceiling) return base;
          const room = ceiling - base;
          const step = 1 + Math.floor(Math.random() * Math.min(250, room));
          return Math.min(ceiling, base + step);
        });
      }, 50);
      frenzyCalculatingShownAt = 0;
      if (frenzyCalculatingTimeout !== null) window.clearTimeout(frenzyCalculatingTimeout);
      // Delay the full-screen treatment so quick claims keep their current flow.
      frenzyCalculatingTimeout = window.setTimeout(() => {
        frenzyCalculatingShownAt = Date.now();
        if (componentMountedRef.current) setShowFrenzyCalculating(true);
      }, FRENZY_CALCULATING_DELAY_MS);

      // Claim exactly once per attempt. A retry requires a fresh user action
      // because a failed HTTP response cannot prove the server did not commit.
      const res = await enqueueMutation(() =>
        getJson<RollResponse>('/api/frenzy/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId: activeFrenzyAttemptId }),
        }),
      );

      if (!componentMountedRef.current) return;

      stopFrenzyProgressPolling();
      const finalFrenzyCount = Math.max(0, Math.floor(Number(res.frenzyCount ?? 0) || 0));
      setFrenzyDisplayedProcessed(finalFrenzyCount);
      latestProgressSnapshot = { processed: finalFrenzyCount, total: finalFrenzyCount };
      setFrenzyProgress({
        active: false,
        processed: finalFrenzyCount,
        total: finalFrenzyCount,
        percent: 100,
      });
      if (frenzyCalculatingTimeout !== null) {
        window.clearTimeout(frenzyCalculatingTimeout);
        frenzyCalculatingTimeout = null;
      }
      if (frenzyCalculatingShownAt > 0) {
        const remainingVisibleMs = FRENZY_CALCULATING_MIN_VISIBLE_MS - (Date.now() - frenzyCalculatingShownAt);
        if (remainingVisibleMs > 0) {
          await new Promise(resolve => window.setTimeout(resolve, remainingVisibleMs));
        }
      }
      if (!componentMountedRef.current) return;
      setShowFrenzyCalculating(false);

      const revealBatch = res.batch?.length ? res.batch : [res.orb];

      // Apply the authoritative state without cancelling the visual reveal.
      applyPlayerState(res.state);
      setLastBatch(revealBatch);
      setBatchSummary({
        totalVal: res.totalRollValue,
        coins: res.coinsGained,
        shards: res.shardsGained,
        xp: res.xpGained,
        frenzyCount: res.frenzyCount ?? 0,
      });
      setReadyAt(Date.now() + res.rollsRemainingUntilNext);

      // The authoritative rewards are identical either way. Skip per-orb
      // JavaScript delays when the user has requested reduced motion.
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        setLastOrb(res.orb);
      } else {
        for (const revealedOrb of revealBatch) {
          if (!componentMountedRef.current) return;
          setLastOrb(revealedOrb);
          await new Promise(resolve => window.setTimeout(resolve, 240));
        }
        if (!componentMountedRef.current) return;
        setLastOrb(res.orb);
      }
      sound.playMythicFanfare();
      showToast(
        `⚡ Orb Frenzy claimed! ${formatNumber(res.frenzyCount ?? 0)} Orbs rolled.`,
        'success',
      );
      if (claimedFrenzyInfo) {
        setFrenzyThanksPrompt({
          ...claimedFrenzyInfo,
          message: `I claimed your 1/${formatRarity(claimedFrenzyInfo.rarity, claimedFrenzyInfo.isInfinity)} Orb Frenzy. Thanks, u/${claimedFrenzyInfo.ownerUsername}!`,
        });
      }
    };

    void resolveFrenzy()
      .catch(error => {
        if (componentMountedRef.current) {
          showToast(error?.message || 'Could not claim Orb Frenzy.', 'warn');
        }
      })
      .finally(() => {
        stopFrenzyProgressPolling();
        if (frenzyCalculatingTimeout !== null) window.clearTimeout(frenzyCalculatingTimeout);
        frenzyCalculatingTimeout = null;
        frenzyClaimActiveRef.current = false;
        activeFrenzyPostId = null;
        activeFrenzyAttemptId = null;
        if (!componentMountedRef.current) return;
        setFrenzyProgress({ active: false, processed: 0, total: 0, percent: 0 });
        setFrenzyDisplayedProcessed(0);
        setShowFrenzyCalculating(false);
        setIsRolling(false);
        setBusy(false);
      });
  }, [state, splashEntered, frenzyRunTriggered, applyPlayerState, enqueueMutation]);

  useEffect(() => {
    if (!splashEntered || !popupConfigLoaded || !popupConfig.frenzy) return;
    const startedAt = Date.now();
    const checkPrompt = () => {
      if (!splashEntered || !popupConfig.frenzy) return;
      if (showNotificationPrompt || showJoinSubredditPrompt || showFrenzyPrompt) return;
      const now = Date.now();
      const current = stateRef.current;
      if (!current || now - startedAt < FRENZY_PROMPT_DELAY_MS) return;
      if (!canShowDailyFrenzyPrompt(current.lastFrenzyAt ?? current.lastFrenzyDate, now)) return;
      if (frenzyPromptShownRef.current) return;
      const storageKey = 'io-frenzy-prompt-shown-' + todayKey(now);
      try {
        if (window.localStorage.getItem(storageKey) === '1') return;
        window.localStorage.setItem(storageKey, '1');
      } catch { /* local storage is optional */ }
      frenzyPromptShownRef.current = true;
      setFrenzyPromptPreview(false);
      setShowFrenzyPrompt(true);
      trackPopupEvent('frenzy', 'shown');
    };
    const interval = window.setInterval(checkPrompt, 15_000);
    checkPrompt();
    return () => window.clearInterval(interval);
  }, [splashEntered, popupConfigLoaded, popupConfig.frenzy, showNotificationPrompt, showJoinSubredditPrompt, showFrenzyPrompt, trackPopupEvent]);

  // Social quests count only when the player actually opens the social area.
  // Background leaderboard/guild refreshes must not award the visit quest.
  useEffect(() => {
    if (!splashEntered || tab !== 'social') return;

    // Mark the visit locally before the server records it. The server response
    // remains authoritative for quest progress and cross-device state.
    const rollback = beginOptimisticState(current => {
      const today = todayKey();
      if (current.socialActivityDate === today) return current;
      return {
        ...current,
        socialActivityDate: today,
        dailyQuests: current.dailyQuests.map(q =>
          q.id === 'daily-social' && !q.claimed
            ? { ...q, progress: Math.min(q.target, q.progress + 1) }
            : q
        ),
      };
    });

    void getJson<{ ok: boolean; state: PlayerState }>('/api/social/visit', { method: 'POST' })
      .then(result => applyPlayerState(result.state))
      .catch(() => {
        rollback?.();
      });
  }, [applyPlayerState, beginOptimisticState, tab, splashEntered]);

  // Roll action
  const handleRoll = useCallback(async (isAutoRoll = false) => {
    if (combatModeRef.current) return;
    if (isAutoRoll && !splashEntered) return;
    if (rollActionLockRef.current) return;
    const currentState = stateRef.current;
    if (!currentState) return;
    const previousBest = Math.max(2, Number(currentState.highestRarity) || 2);

    rollActionLockRef.current = true;
    let frenzySubmissionInFlight = false;
    setIsRolling(true);

    try {
      if (!isAutoRoll && frenzyArmed) {
        frenzySubmissionInFlight = true;
        // Consume the armed state immediately so a failed request cannot
        // leave the UI stuck in a dead "RELEASE FRENZY" state.
        setFrenzyArmed(false);
        const res = await enqueueMutation(() => getJson<{
          state: PlayerState;
          postId: string;
          url: string;
          rarity: number;
          orb: Orb;
          batch: Orb[];
          totalValueGained: number;
          totalRollValue: number;
          coinsGained: number;
          shardsGained: number;
          xpGained: number;
          rollsRemainingUntilNext: number;
          rollsProcessed: number;
          dramaticReveal: boolean;
        }>('/api/frenzy/start', { method: 'POST' }));

        const latestBest = Math.max(2, Number(res.state.highestRarity) || 2);
        if (res.orb.rarity > previousBest && res.orb.rarity >= latestBest) {
          setNewBestModalData({ orb: res.orb, prevBest: previousBest });
        }
        applyPlayerState(res.state);
        setFrenzyArmed(false);
        setLastOrb(res.orb);
        setLastBatch(res.batch ?? [res.orb]);
        setBatchSummary({
          totalVal: res.totalRollValue,
          coins: res.coinsGained,
          shards: res.shardsGained,
          xp: res.xpGained,
          frenzyCount: undefined,
        });
        setReadyAt(Date.now() + res.rollsRemainingUntilNext);
        sound.playEpicFanfare();
        showToast(
          `🔥 Frenzy submitted! Your ${formatRarity(res.rarity)} roll is now posted.`,
          'success',
        );
        return;
      }

      // The UI may animate while the request is pending, but it must not know
      // the outcome before the server commits it. Otherwise players can inspect
      // future rewards and selectively submit only favorable rolls.
      const ticket = await ensureRollTicket();
      const ticketIndex = ticket.nextIndex;
      rollTicketRef.current = {
        ...ticket,
        nextIndex: ticketIndex + 1,
        rollsRemaining: Math.max(0, 30 - (ticketIndex + 1)),
      };
      sound.playRollNormal();

      const res = await enqueueMutation(() => getJson<RollResponse>('/api/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto: isAutoRoll,
          ticketId: ticket.ticketId,
          ticketIndex,
          useAllFreeRolls: !isAutoRoll &&
            Math.max(0, Math.floor(Number(currentState.chainPatcherNextRarity ?? 0) || 0)) < 2 &&
            (currentState.freeRolls ?? 0) > 0,
        }),
      }));

      const latestBest = Math.max(2, Number(res.state.highestRarity) || 2);
      if (!isAutoRoll && res.orb.rarity > previousBest && res.orb.rarity >= latestBest) {
        setNewBestModalData({ orb: res.orb, prevBest: previousBest });
      }
      applyPlayerState(res.state);
      setLastOrb(res.orb);
      setLastBatch(res.batch ?? [res.orb]);
      setBatchSummary({
        totalVal: res.totalRollValue,
        coins: res.coinsGained,
        shards: res.shardsGained,
        xp: res.xpGained,
      });
      setReadyAt(Date.now() + res.rollsRemainingUntilNext);
      mutationResyncNeededRef.current = false;
          const acceptedRolls = Math.max(1, Math.min(1_000, Math.floor((Number(res.state.totalRolls) || 0) - (Number(currentState.totalRolls) || 0))));
          journeySessionRollsRef.current += acceptedRolls;
          if (!isAutoRoll) reportJourneyInteraction('roll_committed', acceptedRolls > 1 ? 'multi_roll' : 'single_roll');
          const sessionRolls = journeySessionRollsRef.current;
          if (sessionRolls >= 25) reportJourneyProgress(0.60, 'twenty_five_rolls');
          else if (sessionRolls >= 10) reportJourneyProgress(0.50, 'ten_rolls');
          else if (sessionRolls >= 5) reportJourneyProgress(0.35, 'five_rolls');
          else reportJourneyProgress(0.15, 'first_roll');
          if (!isAutoRoll && res.orb.rarity > previousBest && res.orb.rarity >= latestBest) reportJourneyInteraction('personal_best_found', 'new_rarity');
    } catch (error: any) {
      rollTicketRef.current = null;
      setFrenzyArmed(false);
      mutationResyncNeededRef.current = true;
      // A request might have committed before its response was lost. Read back
      // authoritative state before the next roll attempt, for either path.
      await refreshAll().catch(() => null);
      mutationResyncNeededRef.current = false;
      showToast(error?.message || 'Roll failed. State refreshed.', 'warn');
    } finally {
      setIsRolling(false);
      rollActionLockRef.current = false;
    }
  }, [
    applyPlayerState,
    enqueueMutation,
    ensureRollTicket,
    refreshAll,
    frenzyArmed,
    splashEntered,
    combatMode,
  ]);

  // Auto roll watcher (paced steadily)
  useEffect(() => {
    if (!splashEntered || combatMode || !autoRoll || !state || state.upgrades.auto === 0) return;
    const interval = setInterval(() => {
      if (Date.now() >= readyAt && !isRolling) {
        void handleRoll(true);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [autoRoll, state, readyAt, isRolling, handleRoll, splashEntered, combatMode]);

  // Standard upgrades are applied optimistically, queued for a short burst
  // window, and validated together by one authoritative server mutation.
  const flushUpgradeBatch = async () => {
    if (upgradeBatchInFlightRef.current || upgradeBatchQueueRef.current.length === 0) return;
    if (upgradeBatchTimerRef.current !== null) {
      window.clearTimeout(upgradeBatchTimerRef.current);
      upgradeBatchTimerRef.current = null;
    }

    const ids = upgradeBatchQueueRef.current.splice(0, 100);
    if (ids.length === 0) return;
    upgradeBatchInFlightRef.current = true;
    pendingMutationCountRef.current += 1;

    try {
      await enqueueMutation(async () => {
        try {
          const res = await getJson<{
            state: PlayerState;
            purchased: Array<{ id: UpgradeId; cost: number; level: number }>;
            totalSpent: number;
            stoppedReason?: string;
          }>('/api/upgrade/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });

          pendingMutationCountRef.current = Math.max(0, pendingMutationCountRef.current - 1);
          if (upgradeBatchQueueRef.current.length === 0) {
            applyPlayerState(res.state);
            mutationResyncNeededRef.current = false;
            if (res.purchased.length > 0) {
              for (const purchase of res.purchased) reportJourneyInteraction('upgrade_purchased', purchase.id);
              if (!journeyFirstUpgradeTrackedRef.current) {
                journeyFirstUpgradeTrackedRef.current = true;
                reportJourneyProgress(0.75, 'first_upgrade');
              }
              showToast(`Upgraded ${res.purchased.length} level${res.purchased.length === 1 ? '' : 's'} · ${formatNumber(res.totalSpent)} Coins spent.`, 'success');
            }
            if (res.stoppedReason && res.purchased.length < ids.length) {
              showToast(res.stoppedReason, res.purchased.length > 0 ? 'info' : 'warn');
            }
          }
        } catch (error: any) {
          pendingMutationCountRef.current = Math.max(0, pendingMutationCountRef.current - 1);
          mutationResyncNeededRef.current = true;
          // The optimistic queue depends on the prior batch. If the server
          // rejects that batch, discard dependent predictions and read back truth.
          upgradeBatchQueueRef.current = [];
          if (upgradeBatchTimerRef.current !== null) {
            window.clearTimeout(upgradeBatchTimerRef.current);
            upgradeBatchTimerRef.current = null;
          }
          await refreshAll().catch(() => null);
          mutationResyncNeededRef.current = false;
          showToast(error?.message || 'Upgrade verification failed. State refreshed.', 'warn');
        }
      });
    } finally {
      upgradeBatchInFlightRef.current = false;
      if (upgradeBatchQueueRef.current.length > 0 && upgradeBatchTimerRef.current === null) {
        upgradeBatchTimerRef.current = window.setTimeout(() => {
          upgradeBatchTimerRef.current = null;
          void flushUpgradeBatchRef.current?.();
        }, 25);
      }
    }
  };
  flushUpgradeBatchRef.current = flushUpgradeBatch;

  const handleBuyUpgrade = async (id: UpgradeId) => {
    const currentState = stateRef.current;
    if (!currentState) return;

    const level = currentState.upgrades[id] ?? 0;
    const cost = upgradeCost(id, level);
    const canBuy = id === 'auto'
      ? (currentState.manualRolls ?? 0) >= 3 && level === 0
      : Number.isFinite(cost) && currentState.coins >= cost;

    if (!canBuy) {
      showToast(
        id === 'auto'
          ? `Auto Roll unlocks after 3 manual rolls (${currentState.manualRolls ?? 0}/3).`
          : Number.isFinite(cost)
            ? `Need ${formatNumber(cost)} Coins.`
            : 'Upgrade is already at its maximum level.',
        'warn',
      );
      return;
    }

    // Instant local response: update the visible level/wallet before the server
    // round trip. Purchases still succeed only if the batch endpoint validates
    // affordability and level limits against the actual saved state.
    const nextState: PlayerState = id === 'auto'
      ? { ...currentState, upgrades: { ...currentState.upgrades, auto: 1 } }
      : {
          ...currentState,
          coins: currentState.coins - cost,
          upgrades: { ...currentState.upgrades, [id]: level + 1 },
        };
    stateRef.current = nextState;
    stateRevisionRef.current += 1;
    setState(nextState);
    sound.playChime(659.25, 'sine', 0.2);

    upgradeBatchQueueRef.current.push(id);
    if (!upgradeBatchInFlightRef.current) {
      if (upgradeBatchTimerRef.current !== null) window.clearTimeout(upgradeBatchTimerRef.current);
      upgradeBatchTimerRef.current = window.setTimeout(() => {
        upgradeBatchTimerRef.current = null;
        void flushUpgradeBatchRef.current?.();
      }, 55);
    }
  };
  const handleBuyChainPatcher = async () => {
    if (!stateRef.current || busy) return;
    setBusy(true);
    try {
      const result = await getJson<{
        state: PlayerState;
        targetRarity: number;
        shardsSpent: number;
        cooldownUntil: number;
      }>('/api/chain-patcher/buy', { method: 'POST' });
      applyPlayerState(result.state);
      // Purchasing a patch pauses Auto Roll server-side so the player can
      // deliberately trigger the one-orb guarantee.
      setAutoRoll(false);
      sound.playMythicFanfare();
      showToast(
        `Chain Patcher charged: your next roll is exactly one 1/${formatRarity(result.targetRarity)} orb. Spent ${formatNumber(result.shardsSpent)} Shards; 24-hour cooldown started.`,
        'success',
      );
    } catch (error: any) {
      showToast(error?.message || 'Chain Patcher purchase failed.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Upgrade All Standard Upgrades
  const handleBuyAllUpgrades = async () => {
    const currentState = stateRef.current;
    if (!currentState) return;

    const next: PlayerState = {
      ...currentState,
      upgrades: { ...currentState.upgrades },
    };
    const ids: UpgradeId[] = [
      'speed', 'multi', 'clusterRoll', 'auto', 'luck', 'coinBonus',
      'shardChance', 'xpBonus', 'critChance', 'critPower', 'offlineRate', 'valueBonus',
    ];
    let purchases = 0;

    let changed = true;
    while (changed && purchases < 5_000) {
      changed = false;
      for (const id of ids) {
        if (id === 'auto' || purchases >= 5_000) continue;
        const level = next.upgrades[id] ?? 0;
        const cost = upgradeCost(id, level);
        if (!Number.isFinite(cost) || cost > next.coins) continue;
        next.coins -= cost;
        next.upgrades[id] = level + 1;
        purchases++;
        changed = true;
      }
    }

    if (purchases <= 0) {
      showToast('No upgrades are currently affordable.', 'info');
      return;
    }

    stateRef.current = next;
    stateRevisionRef.current += 1;
    setState(next);
    sound.playChime(523.25, 'triangle', 0.3);

    pendingMutationCountRef.current += 1;
    void enqueueMutation(async () => {
      try {
        const res = await getJson<{ state: PlayerState; totalSpent: number; upgradedCount: number }>('/api/upgrade/all', {
          method: 'POST',
        });

        pendingMutationCountRef.current -= 1;
        if (pendingMutationCountRef.current === 0) {
          applyPlayerState(res.state);
          mutationResyncNeededRef.current = false;
          showToast(
            res.upgradedCount > 0
              ? `Bought ${res.upgradedCount} upgrade level${res.upgradedCount === 1 ? '' : 's'} for ${formatNumber(res.totalSpent)} Coins.`
              : 'No upgrades are currently affordable.',
            res.upgradedCount > 0 ? 'success' : 'info',
          );
        }
      } catch (error: any) {
        pendingMutationCountRef.current -= 1;
        mutationResyncNeededRef.current = true;
        if (pendingMutationCountRef.current === 0) {
          await refreshAll().catch(() => null);
          mutationResyncNeededRef.current = false;
        }
        showToast(error?.message || 'Upgrade verification failed. State refreshed.', 'warn');
      }
    });
  };

  // Turbo Roll Booster
  const handleActivateTurbo = async () => {
    setBusy(true);
    const durationMinutes = (stateRef.current?.prestigeUpgrades?.chronoOverdrive ?? 0) > 0 ? 60 : 30;
    const turboReductionPercent = durationMinutes === 60 ? 35 : 25;
    const durationMs = durationMinutes * 60 * 1000;
    const rollback = beginOptimisticState(current => {
      const wallet = optimisticShardSpend(current, 50);
      if (!wallet) return current;
      const now = Date.now();
      return {
        ...current,
        ...wallet,
        turboRollUntil: Math.max(now, current.turboRollUntil ?? 0) + durationMs,
      };
    });
    try {
      const res = await getJson<{ state: PlayerState }>('/api/turbo/activate', { method: 'POST' });
      applyPlayerState(res.state);
      sound.playChime(880, 'sawtooth', 0.3);
      const turboDescription = durationMinutes === 60
        ? '35% faster cooldowns for 60 minutes'
        : '25% faster cooldowns for 30 minutes';
      showToast(`Turbo Roll Activated! ${turboDescription}.`, 'success');
    } catch (e: any) {
      rollback?.();
      showToast(e.message || 'Could not activate turbo roll', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Daily Orb Frenzy
  const handleStartOrbFrenzy = async () => {
    if (frenzyArmed) return;

    const current = stateRef.current;
    if (!current) return;
    const remaining = frenzyCooldownRemaining(current.lastFrenzyAt);
    if (remaining > 0) {
      const total = Math.ceil(remaining / 1000);
      const hours = Math.floor(total / 3600);
      const mins = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      showToast('Orb Frenzy is on cooldown for ' + hours + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + '.', 'warn');
      return;
    }

    setBusy(true);

    try {
      // Stop Auto Roll before arming. The next click must be a genuine manual
      // roll so the player deliberately chooses the starter result.
      if (autoRoll) {
        const rollback = beginOptimisticState(state => ({
          ...state,
          autoRollEnabled: false,
        }));
        setAutoRoll(false);

        try {
          const res = await enqueueMutation(() =>
            getJson<{ state: PlayerState }>('/api/auto-roll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: false }),
            }),
          );
          applyPlayerState(res.state);
        } catch (error) {
          rollback?.();
          setAutoRoll(true);
          throw error;
        }
      }

      setFrenzyArmed(true);
      sound.playChime(1040, 'sawtooth', 0.22);
      showToast('⚡ Frenzy armed. Your next manual Roll will submit it.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Could not arm Orb Frenzy', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleActivateGlobalBooster = async (id: GlobalBoosterId, useCredit: boolean) => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      if (useCredit) {
        if ((current.globalBoosterCredits ?? 0) <= 0) return current;
        return {
          ...current,
          globalBoosterCredits: Math.max(0, (current.globalBoosterCredits ?? 0) - 1),
        };
      }
      const wallet = optimisticShardSpend(current, 250);
      if (!wallet) return current;
      return {
        ...current,
        ...wallet,
      };
    });
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
      applyPlayerState(res.state);
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
      rollback?.();
      showToast(e.message || 'Could not activate Global Booster', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleActivatePremiumBooster = async (id: PremiumBoosterId) => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      const info = PREMIUM_BOOSTERS[id];
      const wallet = info ? optimisticShardSpend(current, info.costShards) : null;
      if (!info || !wallet) return current;
      return {
        ...current,
        ...wallet,
        activeBoosters: {
          ...(current.activeBoosters ?? {}),
          [id]: Math.max(Date.now(), current.activeBoosters?.[id] ?? 0) + info.durationMs,
        },
      };
    });
    try {
      const res = await getJson<{ state: PlayerState }>('/api/boosters/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      applyPlayerState(res.state);
      sound.playChime(1046, 'sawtooth', 0.3);
      showToast('Premium booster activated.', 'success');
    } catch (e: any) {
      rollback?.();
      showToast(e.message || 'Could not activate booster', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Permanent automation
  const handleBuyAutomation = async (id: AutomationId) => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      const info = AUTOMATIONS[id];
      if (!info || current.automations?.[id]) return current;
      const wallet = optimisticShardSpend(current, info.costShards);
      if (!wallet) return current;
      return {
        ...current,
        ...wallet,
        automations: { ...(current.automations ?? {}), [id]: true },
      };
    });
    try {
      const res = await getJson<{ state: PlayerState }>('/api/automation/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      applyPlayerState(res.state);
      sound.playLevelUpFanfare();
      showToast('Automation unlocked.', 'success');
    } catch (e: any) {
      rollback?.();
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
      applyPlayerState(res.state);
      if (res.rewardCoins > 0) {
        sound.playChime(880, 'triangle', 0.3);
        showToast(
          `Community cache claimed! +${formatNumber(res.rewardCoins)} Coins, +${formatNumber(res.rewardXp)} XP.`,
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
    const rollback = beginOptimisticState(current => ({
      ...current,
      offlineRolls: 0,
      lastSeenAt: Date.now(),
    }));
    const previousBest = Math.max(2, Number(stateRef.current?.highestRarity) || 2);
    try {
      const res = await getJson<RollResponse>('/api/offline/claim', { method: 'POST' });
      const latestBest = Math.max(2, Number(res.state.highestRarity) || 2);
      if (res.orb.rarity > previousBest && res.orb.rarity >= latestBest) {
        setNewBestModalData({ orb: res.orb, prevBest: previousBest });
      }
      applyPlayerState(res.state);
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
        `Claimed ${formatNumber(res.rollsProcessed ?? res.batch?.length ?? 0)} offline rolls! Highest: 1/${formatRarity(res.orb.rarity)}`,
        'success'
      );
    } catch (e: any) {
      rollback?.();
      showToast(e.message || 'Could not claim offline rolls', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Altar Sacrifice
  const handleSacrifice = async (coins: number, shards: number): Promise<PlayerState> => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      if (current.coins < coins || (current.shards ?? 0) < shards) return current;
      const sacrifices = current.sacrifices ?? {
        coinsSacrificed: 0,
        shardsSacrificed: 0,
        altarLevel: 0,
        luckSurgeUntil: 0,
        altarPity: 0,
      };
      return {
        ...current,
        coins: current.coins - coins,
        shards: (current.shards ?? 0) - shards,
        sacrifices: {
          ...sacrifices,
          coinsSacrificed: (sacrifices.coinsSacrificed ?? 0) + coins,
          shardsSacrificed: (sacrifices.shardsSacrificed ?? 0) + shards,
        },
      };
    });
    try {
      const res = await getJson<{
        state: PlayerState;
        altarLeveledUp: boolean;
        luckSurgeExtended: boolean;
        altarBreakthroughChance: number;
        altarPity: number;
      }>('/api/altar/sacrifice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins, shards }),
      });
      applyPlayerState(res.state);
      if (res.altarLeveledUp) {
        sound.playLevelUpFanfare();
        showToast(
          `Devotion breakthrough! Altar reached Lvl ${res.state.sacrifices?.altarLevel} at ${res.altarBreakthroughChance}% chance. +1 Mastery Point.`,
          'success',
        );
      } else if (res.altarBreakthroughChance > 0) {
        showToast(
          `The altar resisted the offering (${res.altarBreakthroughChance}% chance). Pity is now ${res.altarPity}.`,
          'info',
        );
      } else if (res.luckSurgeExtended) {
        showToast('Shard sacrifice accepted! Luck Surge extended by 15 minutes per Shard.', 'success');
      } else {
        showToast('Offerings consumed by the Altar.', 'info');
      }
      return res.state;
    } catch (e: any) {
      rollback?.();
      showToast(e.message || 'Sacrifice failed', 'warn');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  // Upgrade Mastery Skill
  const handleUpgradeMastery = async (skillId: MasterySkillId) => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      const currentLevel = current.masterySkills?.[skillId] ?? 0;
      const cost = masterySkillCost(skillId, currentLevel);
      if ((current.masteryPoints ?? 0) < cost) return current;
      return {
        ...current,
        masteryPoints: (current.masteryPoints ?? 0) - cost,
        masterySkills: {
          continuumLuck: current.masterySkills?.continuumLuck ?? 0,
          prosperity: current.masterySkills?.prosperity ?? 0,
          shardAttunement: current.masterySkills?.shardAttunement ?? 0,
          critMastery: current.masterySkills?.critMastery ?? 0,
          aftershock: current.masterySkills?.aftershock ?? 0,
          chronoFlow: current.masterySkills?.chronoFlow ?? 0,
          infiniteVault: current.masterySkills?.infiniteVault ?? 0,
          cosmicAttunement: current.masterySkills?.cosmicAttunement ?? 0,
          celestialSurge: current.masterySkills?.celestialSurge ?? 0,
          pityAccelerant: current.masterySkills?.pityAccelerant ?? 0,
          apexFortune: current.masterySkills?.apexFortune ?? 0,
          celestialVolley: current.masterySkills?.celestialVolley ?? 0,
          [skillId]: currentLevel + 1,
        },
      };
    });
    try {
      const res = await getJson<{ state: PlayerState }>('/api/mastery/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });
      applyPlayerState(res.state);
      showToast('Mastery Skill enhanced!', 'success');
    } catch (e: any) {
      rollback?.();
      throw e;
    } finally {
      setBusy(false);
    }
  };

  // Daily Streak
  const handleClaimDailyStreak = async () => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      const today = todayKey();
      if (current.streak.lastClaimDate === today) return current;
      const yesterday = todayKey(Date.now() - 86_400_000);
      const count =
        current.streak.lastClaimDate === yesterday
          ? current.streak.count + 1
          : 1;
      const day = ((count - 1) % 7) + 1;
      const next = {
        ...current,
        coins: current.coins + day * 100,
        lifetimeCoins: (current.lifetimeCoins ?? 0) + day * 100,
        streak: {
          ...current.streak,
          count,
          longestStreak: Math.max(current.streak.longestStreak, count),
          lastClaimDate: today,
        },
      };
      grantFreeShards(next, day === 7 ? 5 : day === 3 ? 1 : 0);
      return next;
    });
    try {
      const res = await getJson<{ state: PlayerState; rewardCoins: number; rewardShards: number }>(
        '/api/streak/claim',
        { method: 'POST' }
      );
      applyPlayerState(res.state);
      sound.playChime(784, 'triangle', 0.3);
      showToast(
        `Streak claimed! +${formatNumber(res.rewardCoins)} Coins ${res.rewardShards > 0 ? `+${formatNumber(res.rewardShards)} Shards` : ''}`,
        'success'
      );
    } catch (e: any) {
      rollback?.();
      showToast(e.message || 'Could not claim streak', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Claim Quest
  const handleClaimQuest = async (type: 'daily' | 'weekly', id: string) => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      const list = type === 'daily' ? current.dailyQuests : current.weeklyQuests;
      const quest = list.find(item => item.id === id);
      if (!quest || quest.claimed || quest.unlocked === false || quest.progress < quest.target) {
        return current;
      }

      const next: PlayerState = {
        ...current,
        coins: current.coins + quest.rewardCoins,
        lifetimeCoins: (current.lifetimeCoins ?? 0) + quest.rewardCoins,
        questsCompleted: (current.questsCompleted ?? 0) + 1,
        xp: current.xp + levelAdjustedXpReward(current.level || 1, quest.rewardXp ?? 0),
      };
      grantFreeShards(next, quest.rewardShards ?? 0);
      applyLevelProgress(next);

      const updatedQuest = { ...quest, claimed: true };
      if (type === 'daily') {
        next.dailyQuests = next.dailyQuests.map(item => item.id === id ? updatedQuest : item);
      } else {
        next.weeklyQuests = next.weeklyQuests.map(item => item.id === id ? updatedQuest : item);
      }
      return next;
    });
    try {
      const res = await getJson<{ state: PlayerState; rewardCoins: number; rewardShards?: number }>(
        '/api/quests/claim',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, id }),
        }
      );
      applyPlayerState(res.state);
      sound.playChime(700, 'sine', 0.25);
      showToast(`Quest completed! +${formatNumber(res.rewardCoins)} Coins`, 'success');
    } catch (e: any) {
      rollback?.();
      showToast(e.message || 'Could not claim quest', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Prestige Reset
  const handlePrestige = async () => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      const dustEarned = calculateCosmicDust(current);
      if (dustEarned <= 0 || (current.collectionValue ?? 0) < 1_000_000) return current;

      const inheritanceLevel = current.prestigeUpgrades?.cosmicInheritance ?? 0;
      const keepPct = Math.min(0.50, inheritanceLevel * 0.10);
      const keptCoins = Math.max(50, Math.floor(current.coins * keepPct));
      // Shards always survive prestige; Cosmic Inheritance only affects Coins.

      return {
        ...current,
        cosmicDust: Math.min(MAX_COSMIC_DUST, (current.cosmicDust ?? 0) + dustEarned),
        prestigeCount: (current.prestigeCount ?? 0) + 1,
        masteryPoints: (current.masteryPoints ?? 0) + 3,
        collectionValue: 0,
        coins: keptCoins,
        shards: current.shards ?? 0,
        upgrades: createInitialState().upgrades,
        offlineRolls: 0,
        rollsSinceBest: 0,
        currentRunRolls: 0,
        lastRollAt: null,
      };
    });
    try {
      const res = await getJson<{ state: PlayerState; dustGained?: number; cosmicDustEarned?: number }>('/api/prestige', {
        method: 'POST',
      });
      applyPlayerState(res.state);
      sound.playMythicFanfare();
      const dust = res.dustGained ?? res.cosmicDustEarned ?? 0;
      showToast(`Prestige Complete! You earned +${dust} Cosmic Dust.`, 'success');
    } catch (e: any) {
      rollback?.();
      showToast(e.message || 'Prestige failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Buy Permanent Prestige Upgrade
  const handleBuyPrestigeUpgrade = async (id: PrestigeUpgradeId) => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      const currentLevel = current.prestigeUpgrades?.[id] ?? 0;
      const cost = prestigeUpgradeCost(id, currentLevel);
      if ((current.cosmicDust ?? 0) < cost) return current;
      return {
        ...current,
        cosmicDust: current.cosmicDust - cost,
        prestigeUpgrades: {
          ...(current.prestigeUpgrades ?? createInitialState().prestigeUpgrades),
          [id]: currentLevel + 1,
        },
      };
    });
    try {
      const res = await getJson<{ state: PlayerState }>('/api/prestige/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      applyPlayerState(res.state);
      sound.playChime(659.25, 'sine', 0.25);
      showToast('Permanent cosmic upgrade obtained!', 'success');
    } catch (e: any) {
      rollback?.();
      showToast(e.message || 'Prestige upgrade failed', 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Astral Forge Dust Synthesis
  const handleSynthesizeDust = async () => {
    setBusy(true);
    const rollback = beginOptimisticState(current => {
      const wallet = optimisticShardSpend(current, 100);
      if (!wallet) return current;
      return {
        ...current,
        ...wallet,
        cosmicDust: (current.cosmicDust ?? 0) + 1,
      };
    });
    try {
      const res = await getJson<{ state: PlayerState; dustEarned: number }>('/api/prestige/synthesize', {
        method: 'POST',
      });
      applyPlayerState(res.state);
      sound.playChime(1046.5, 'triangle', 0.4);
      showToast(`+${res.dustEarned} Cosmic Dust forged in the Astral Forge!`, 'success');
      void refreshAll();
    } catch (e: any) {
      rollback?.();
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
      void refreshGuildData().catch(() => undefined);
    } catch (e: any) {
      showToast(e.message || 'Could not upgrade perk', 'warn');
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
      void refreshGuildData().catch(() => undefined);
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
      void refreshGuildData().catch(() => undefined);
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
      void refreshGuildData().catch(() => undefined);
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
      void refreshGuildData().catch(() => undefined);
    } catch (e: any) {
      showToast(e.message || 'Could not change Trust status', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleKickGuildMember = async (username: string) => {
    setBusy(true);
    try {
      await getJson('/api/guilds/kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      showToast(username + ' was kicked from the guild.', 'success');
      void refreshGuildData().catch(() => undefined);
    } catch (e: any) {
      showToast(e.message || 'Could not kick guild member', 'warn');
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
      void refreshGuildData().catch(() => undefined);
    } catch (e: any) {
      showToast(e.message || 'Could not change Guild Tax', 'warn');
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

  const handlePostFrenzyThanks = async () => {
    const prompt = frenzyThanksPrompt;
    if (!prompt || postingFrenzyThanks || !prompt.message.trim()) return;
    setPostingFrenzyThanks(true);
    try {
      await getJson<{ success: true; commentId: string }>('/api/frenzy/thank-you', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: prompt.postId, text: prompt.message.trim() }),
      });
      setFrenzyThanksPrompt(null);
      showToast('Thank-you comment posted as you. Please consider upvoting the Frenzy post, too.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not post your thank-you comment.', 'warn');
    } finally {
      setPostingFrenzyThanks(false);
    }
  };

  const handleToggleNotifications = async (): Promise<boolean> => {
    try {
      const enabled = !notificationsEnabled;
      const res = await getJson<{ enabled: boolean }>('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const nextEnabled = res.enabled === true;
      setNotificationsEnabled(nextEnabled);
      showToast(
        nextEnabled ? 'Reddit notifications enabled.' : 'Reddit notifications disabled.',
        'success',
      );
      return nextEnabled === enabled;
    } catch (e: any) {
      showToast(e.message || 'Could not update Reddit notification settings.', 'warn');
      return false;
    }
  };

  useEffect(() => {
    if (!popupConfig.notification && !notificationPromptPreview) setShowNotificationPrompt(false);
    if (!popupConfig.frenzy && !frenzyPromptPreview) setShowFrenzyPrompt(false);
    if (!popupConfig.joinSubreddit && !joinSubredditPreview) setShowJoinSubredditPrompt(false);
  }, [popupConfig.notification, popupConfig.frenzy, popupConfig.joinSubreddit, notificationPromptPreview, frenzyPromptPreview, joinSubredditPreview]);

  const handleEnableNotificationsFromPrompt = async () => {
    if (notificationPromptPreview) {
      setShowNotificationPrompt(false);
      setNotificationPromptPreview(false);
      showToast('Preview closed; your notification setting was not changed.', 'info');
      return;
    }
    const enabled = await handleToggleNotifications();
    if (enabled) {
      trackPopupEvent('notification', 'accepted');
      setShowNotificationPrompt(false);
      setNotificationPromptPreview(false);
    }
  };

  const dismissNotificationPrompt = () => {
    setShowNotificationPrompt(false);
    if (notificationPromptPreview) {
      setNotificationPromptPreview(false);
      return;
    }
    trackPopupEvent('notification', 'dismissed');
    setNotificationPromptShown(true);
    notificationPromptShownRef.current = true;
    try { window.localStorage.setItem('io-notification-prompt-shown-v2', '1'); } catch { /* storage optional */ }
  };

  // Notification prompts take priority when both progression thresholds happen at once.
  useEffect(() => {
    if (
      !splashEntered || !popupConfigLoaded || !popupConfig.notification ||
      !notificationSettingsLoaded || !state || notificationsEnabled ||
      notificationPromptShown || notificationPromptShownRef.current ||
      showFrenzyPrompt || showJoinSubredditPrompt ||
      Math.max(0, Number(state.totalRolls) || 0) < 5
    ) return;
    try {
      if (window.localStorage.getItem('io-notification-prompt-shown-v2') === '1') {
        notificationPromptShownRef.current = true;
        setNotificationPromptShown(true);
        return;
      }
      window.localStorage.setItem('io-notification-prompt-shown-v2', '1');
    } catch { /* storage optional; in-memory guard still applies */ }
    notificationPromptShownRef.current = true;
    setNotificationPromptShown(true);
    setNotificationPromptPreview(false);
    setShowNotificationPrompt(true);
    trackPopupEvent('notification', 'shown');
  }, [
    splashEntered, popupConfigLoaded, popupConfig.notification, notificationSettingsLoaded,
    state?.totalRolls, notificationsEnabled, notificationPromptShown,
    showFrenzyPrompt, showJoinSubredditPrompt, trackPopupEvent,
  ]);

  const dismissFrenzyPrompt = () => {
    setShowFrenzyPrompt(false);
    if (frenzyPromptPreview) {
      setFrenzyPromptPreview(false);
      showToast('Preview closed; no Frenzy was started.', 'info');
      return;
    }
    trackPopupEvent('frenzy', 'dismissed');
  };

  const acceptFrenzyPrompt = () => {
    if (frenzyPromptPreview) {
      setShowFrenzyPrompt(false);
      setFrenzyPromptPreview(false);
      showToast('Preview closed; no Frenzy was started.', 'info');
      return;
    }
    trackPopupEvent('frenzy', 'accepted');
    setShowFrenzyPrompt(false);
    void handleStartOrbFrenzy();
  };

  const dismissJoinSubredditPrompt = () => {
    setShowJoinSubredditPrompt(false);
    if (joinSubredditPreview) {
      setJoinSubredditPreview(false);
      showToast('Preview closed; no subscription or reward was applied.', 'info');
      return;
    }
    trackPopupEvent('joinSubreddit', 'dismissed');
    try { window.localStorage.setItem('io-join-subreddit-dismissed-until-v1', String(Date.now() + 24 * 60 * 60_000)); } catch { /* storage optional */ }
  };

  const acceptJoinSubredditPrompt = async () => {
    if (joinSubredditPreview) {
      setShowJoinSubredditPrompt(false);
      setJoinSubredditPreview(false);
      showToast('Preview closed; no subscription or reward was applied.', 'info');
      return;
    }
    if (claimingFollowReward) return;
    setClaimingFollowReward(true);
    try {
      const result = await getJson<{state: PlayerState; rollsGranted: number; freeRollsAdded: number; totalFreeRolls: number}>(
        '/api/follow-reward',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      );
      applyPlayerState(result.state);
      trackPopupEvent('joinSubreddit', 'accepted');
      setFollowRewardClaimed(true);
      setShowJoinSubredditPrompt(false);
      setJoinSubredditPreview(false);
      followPromptShownRef.current = true;
      showToast('Joined r/' + joinSubredditName + ' — +' + formatNumber(result.freeRollsAdded ?? result.rollsGranted ?? 100) + ' Free Rolls added.', 'success');
    } catch (error: any) {
      const raw = String(error?.message ?? '');
      const message = raw.includes('FOLLOW_REWARD_LEVEL_REQUIRED')
        ? 'Reach Level 5 to claim the subreddit reward.'
        : raw.includes('FOLLOW_REWARD_ALREADY_CLAIMED')
          ? 'This subreddit reward has already been claimed on your account.'
          : raw || 'Could not join the subreddit or claim Free Rolls. Please retry.';
      showToast(message, 'warn');
      if (raw.includes('FOLLOW_REWARD_ALREADY_CLAIMED')) setFollowRewardClaimed(true);
    } finally {
      setClaimingFollowReward(false);
    }
  };

  useEffect(() => {
    if (
      !splashEntered || !popupConfigLoaded || !popupConfig.joinSubreddit ||
      !followRewardStatusLoaded || !state || followRewardClaimed ||
      showNotificationPrompt || showFrenzyPrompt || showJoinSubredditPrompt ||
      followPromptShownRef.current
    ) return;
    const level = Math.max(1, Math.floor(Number(state.level) || 1), calculateLevelFromXp(Number(state.xp) || 0).level);
    if (level < 5) return;
    if (popupConfig.notification && !notificationsEnabled && !notificationPromptShown && Math.max(0, Number(state.totalRolls) || 0) >= 5) return;
    try {
      const snoozeUntil = Number(window.localStorage.getItem('io-join-subreddit-dismissed-until-v1') ?? 0);
      if (Number.isFinite(snoozeUntil) && snoozeUntil > Date.now()) return;
    } catch { /* storage optional */ }
    followPromptShownRef.current = true;
    setJoinSubredditPreview(false);
    setShowJoinSubredditPrompt(true);
    trackPopupEvent('joinSubreddit', 'shown');
  }, [
    splashEntered, popupConfigLoaded, popupConfig.joinSubreddit, popupConfig.notification, followRewardStatusLoaded,
    state?.level, state?.xp, state?.totalRolls, notificationsEnabled, notificationPromptShown,
    followRewardClaimed, showNotificationPrompt, showFrenzyPrompt, showJoinSubredditPrompt, trackPopupEvent,
  ]);

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
  const handleShareToReddit = async (rarity: number, isInfinity = false) => {
    const res = await getJson<{ success: boolean; id?: string }>('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rarity, isInfinity }),
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
    if (startupError) {
      return (
        <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-6">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10">
              <Shield className="w-7 h-7 text-rose-400" />
            </div>
            <h1 className="mt-5 text-xl font-black text-white">Unable to connect</h1>
            <p className="mt-2 text-sm text-slate-400">{startupError}</p>
            <button
              type="button"
              onClick={() => { setStartupError(null); void refreshAll(); }}
              className="mt-6 rounded-xl bg-purple-600 px-5 py-3 text-sm font-black text-white hover:bg-purple-500"
            >
              Retry
            </button>
          </div>
        </main>
      );
    }

    return (
      <SplashScreen
        ready={false}
        hasProgress={false}
        onEnter={() => undefined}
      />
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
                <button type="button"
                  onClick={() => setShowDevModal(true)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm"
                >
                  Open Admin Console
                </button>
              </div>
            ) : (
              <div className="mt-6 text-xs text-slate-500">
                {adminStatusUnavailable ? (
                  <button type="button" onClick={() => void refreshAdminStatus()} className="rounded-lg border border-amber-500/30 px-3 py-2 font-bold text-amber-300 hover:bg-amber-500/10">
                    Admin tools could not be checked. Retry.
                  </button>
                ) : (
                  'Contact an Infinity Orbs administrator if you believe this was a mistake.'
                )}
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

  if (!splashEntered) {
    return (
      <SplashScreen
        ready={true}
        hasProgress={(state.totalRolls ?? 0) > 0}
        highestRarity={state.highestRarity ?? 2}
        highestRarityIsInfinity={state.highestRarityIsInfinity}
        totalRolls={state.totalRolls ?? 0}
        onEnter={() => {
          setSplashEntered(true);
          // Start only after the player explicitly enters the game, never on preview or app load.
          swallowJourneyEvent(ensureJourneyStarted);
        }}
      />
    );
  }

  return (
    <div className="app-shell io-ui min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Sticky Top Header */}
      <Header
        state={state}
        combatMode={combatMode}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(sound.toggle())}
        onOpenOdds={() => setShowOddsModal(true)}
        onOpenFeedback={() => setShowFeedbackModal(true)}
        onOpenChangelog={() => {
          try { window.localStorage.setItem('io-changelog-viewed-version', APP_VERSION); } catch {}
          setChangelogUnread(false);
          setShowChangelogModal(true);
        }}
        changelogUnread={isBeta && changelogUnread}
        onClaimOffline={handleClaimOffline}
        onOpenDevDebug={isAdmin ? () => setShowDevModal(true) : undefined}
        adminStatusUnavailable={adminStatusUnavailable}
        onRetryAdminStatus={() => { void refreshAdminStatus(); }}
        onOpenProfile={() => changeTab('profile')}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={() => void handleToggleNotifications()}
      />

      {/* Global Booster Activation Announcement */}
      {boosterAnnouncement && (
        <div className="fixed top-[68px] left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 w-full flex justify-center animate-in slide-in-from-top-3 fade-in duration-200">
          <div className="max-w-xl rounded-2xl border border-fuchsia-400/40 bg-slate-950/95 px-4 py-3 shadow-2xl shadow-fuchsia-950/30 backdrop-blur-md text-center">
            <div className="text-sm font-black text-fuchsia-200">
              u/{boosterAnnouncement.username} activated {boosterAnnouncement.name} booster for 2 hours!
            </div>
          </div>
        </div>
      )}

      {/* Persistent live region announces transient toast messages to assistive technology. */}
      <div
        className="sr-only"
        role={toast?.type === 'warn' ? 'alert' : 'status'}
        aria-live={toast?.type === 'warn' ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {toast?.msg ?? ''}
      </div>

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
            <button type="button"
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
            <button type="button"
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

      {showNotificationPrompt && (notificationPromptPreview || !notificationsEnabled) && (
        <div className="fixed inset-0 z-[70] io-modal-backdrop io-notification-backdrop flex items-center justify-center p-4" data-testid="notification-prompt-backdrop">
          <section
            className="io-modal-card io-notification-prompt w-full max-w-md bg-slate-950/95"
            role="dialog"
            aria-modal="true"
            aria-labelledby="io-notification-prompt-title"
            data-testid="notification-prompt"
          >
            {notificationPromptPreview && (
              <div className="mb-3 rounded-lg border border-teal-400/30 bg-teal-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-teal-200">
                Admin Preview · Notification settings will not change
              </div>
            )}
            <div className="io-notification-prompt-kicker">
              <Bell className="w-4 h-4" />
              Push Notifications
            </div>
            <h2 id="io-notification-prompt-title" className="mt-2 text-2xl font-black text-white">
              Allow push notifications?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              We’ll only send notifications when your idle rewards are ready to claim or an Infinity Orbs update is ready.
            </p>
            <div className="io-notification-prompt-note">
              <div className="text-[10px] uppercase tracking-widest font-black text-teal-200">Notifications are off by default</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                This prompt will only appear once. You can change your choice later with the bell icon.
              </p>
            </div>
            <div className="io-modal-actions">
              <button
                type="button"
                onClick={() => void handleEnableNotificationsFromPrompt()}
                className="io-public-button io-public-button-primary"
                data-testid="notification-prompt-enable"
              >
                <Bell className="w-4 h-4" />
                Allow Notifications
              </button>
              <button
                type="button"
                onClick={dismissNotificationPrompt}
                className="io-public-button io-public-button-secondary"
                data-testid="notification-prompt-dismiss"
              >
                Not now
              </button>
            </div>
            <button type="button" onClick={dismissNotificationPrompt} className="io-modal-close" aria-label="Close notification prompt">
              <X className="w-4 h-4" />
            </button>
          </section>
        </div>
      )}

      <nav aria-label={combatMode ? "Combat navigation" : "Game navigation"} className={"io-nav app-nav" + (combatMode ? " io-nav-combat" : "")}>
        <div className="nav-shell">
          {!combatMode ? (
            <>
              <div className="io-nav-primary" role="group" aria-label="Main game">
                {renderNavItem('roll', 'Roll', Sparkles)}
                {renderNavItem('upgrades', 'Upgrades', Zap)}
                {renderNavItem('collection', 'Collection', BookOpen)}
                {renderNavItem('quests', 'Quests', Calendar, streakReady || questsReady)}
                {renderNavItem('social', 'Community', Users)}
                {renderNavItem('profile', 'Progress', Star, prestigeReady, 'io-nav-profile-primary')}
              </div>
              <div className="io-nav-trailing">
                <div className="io-nav-more-wrap">
                  <button
                    type="button"
                    className={"nav-tab io-nav-more" + (moreNavOpen || ['boosters', 'altar', 'mastery'].includes(tab) ? " is-active" : "") + (['quests', 'social'].includes(tab) ? " io-nav-mobile-more-active" : "") + (tab === 'profile' ? " io-nav-profile-active" : "")}
                    aria-expanded={moreNavOpen}
                    aria-controls="io-more-navigation"
                    onClick={() => setMoreNavOpen(open => !open)}
                  >
                    <span className="io-nav-label">More</span>
                    {tab === 'boosters' && <span className="io-nav-current-page">Boosters</span>}
                    {tab === 'altar' && <span className="io-nav-current-page">Altar</span>}
                    {tab === 'mastery' && <span className="io-nav-current-page">Mastery</span>}
                    {tab === 'quests' && <span className="io-nav-current-page">Quests</span>}
                    {tab === 'social' && <span className="io-nav-current-page">Community</span>}
                    <ChevronDown className="io-nav-icon io-nav-chevron" aria-hidden="true" />
                  </button>
                  {moreNavOpen && (
                    <div id="io-more-navigation" className="io-nav-menu" role="group" aria-label="More game features">
                      <button
                        type="button"
                        className="io-nav-guide-entry"
                        onClick={() => { setMoreNavOpen(false); setShowGettingStarted(true); }}
                      >
                        <BookOpen className="io-nav-icon" aria-hidden="true" />
                        <span>How to play</span>
                      </button>
                      <p className="io-nav-menu-title">More ways to play</p>
                      {renderNavItem('quests', 'Quests', Calendar, streakReady || questsReady, 'io-nav-mobile-only')}
                      {renderNavItem('social', 'Community', Users, false, 'io-nav-mobile-only')}
                      {renderNavItem('profile', 'Progress', Star, prestigeReady, 'io-nav-profile-mobile')}
                      {renderNavItem('boosters', 'Boosters', Dices)}
                      {renderNavItem('altar', 'Altar', Flame)}
                      {renderNavItem('mastery', 'Mastery', Sparkles, (state.masteryPoints ?? 0) > 0)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => changeTab('fight')}
                  className="nav-tab io-combat-mode-switch"
                  aria-label={state.level < FEATURE_UNLOCK_LEVELS.combat ? "Combat, unlocks at level " + FEATURE_UNLOCK_LEVELS.combat : "Enter Combat"}
                  title={state.level < FEATURE_UNLOCK_LEVELS.combat ? "Combat unlocks at Level " + FEATURE_UNLOCK_LEVELS.combat + "." : "Enter the combat game"}
                >
                  <Swords className="io-nav-icon" />
                  <span className="io-nav-label">Combat</span>
                  {state.level < FEATURE_UNLOCK_LEVELS.combat && <span className="io-nav-unlock">Lv {FEATURE_UNLOCK_LEVELS.combat}</span>}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="io-nav-primary io-nav-combat-list" role="group" aria-label="Combat pages">
                <button type="button" aria-current={tab === 'fight' ? 'page' : undefined} onClick={() => changeTab('fight')} className={"nav-tab io-nav-item" + (tab === 'fight' ? " is-active" : "")}><Flame className="io-nav-icon" /><span className="io-nav-label">Fight</span></button>
                <button type="button" aria-current={tab === 'dungeons' ? 'page' : undefined} onClick={() => changeTab('dungeons')} className={"nav-tab io-nav-item" + (tab === 'dungeons' ? " is-active" : "")}><DoorOpen className="io-nav-icon" /><span className="io-nav-label">Dungeons</span></button>
                <button type="button" aria-current={tab === 'gear' ? 'page' : undefined} onClick={() => changeTab('gear')} className={"nav-tab io-nav-item" + (tab === 'gear' ? " is-active" : "")}><Package className="io-nav-icon" /><span className="io-nav-label">Gear</span></button>
                <button type="button" aria-current={tab === 'runes' ? 'page' : undefined} onClick={() => changeTab('runes')} className={"nav-tab io-nav-item" + (tab === 'runes' ? " is-active" : "")}><Gem className="io-nav-icon" /><span className="io-nav-label">Runes</span></button>
                <button type="button" aria-current={tab === 'forge' ? 'page' : undefined} onClick={() => changeTab('forge')} className={"nav-tab io-nav-item" + (tab === 'forge' ? " is-active" : "")}><Hammer className="io-nav-icon" /><span className="io-nav-label">Forge</span></button>
                <button type="button" aria-current={tab === 'skills' ? 'page' : undefined} onClick={() => changeTab('skills')} className={"nav-tab io-nav-item" + (tab === 'skills' ? " is-active" : "")}><Sparkles className="io-nav-icon" /><span className="io-nav-label">Skills</span></button>
                <button type="button" aria-current={tab === 'arena' ? 'page' : undefined} onClick={() => changeTab('arena')} className={"nav-tab io-nav-item" + (tab === 'arena' ? " is-active" : "")}><Users className="io-nav-icon" /><span className="io-nav-label">Arena</span><span className="io-nav-unlock">Coming soon</span></button>
              </div>
              <button type="button" onClick={() => changeTab('roll')} className="nav-tab io-combat-mode-switch">
                <Sparkles className="io-nav-icon" />
                <span className="io-nav-label">Back to Orbs</span>
              </button>
            </>
          )}
        </div>
      </nav>

      {combatTutorialStatusLoaded && state && combatTutorialStep > 0 && !combatTutorialDismissed && (
        <section className="io-tutorial-guide io-combat-onboarding" aria-live="polite" aria-label="Combat unlock tutorial">
          <div className="io-tutorial-topline"><span>Combat · Level {FEATURE_UNLOCK_LEVELS.combat}</span><span>Step {combatTutorialStep} of 3</span><button type="button" onClick={finishCombatTutorial} aria-label="Skip Combat tutorial">Skip</button></div>
          {combatTutorialStep === 1 && <>
            <h2>Your next progression path is Combat</h2>
            <p>Each attack uses a roll from your main game. Rarer Orbs hit harder, so the Luck and Speed upgrades you buy here carry into battle.</p>
            <button type="button" className="io-tutorial-primary" onClick={() => { setCombatTutorialStep(2); changeTab('fight'); }}><Swords size={15} /> Enter Combat</button>
          </>}
          {combatTutorialStep === 2 && <>
            <h2>Learn the rhythm</h2>
            <p>Fights take turns every 30 seconds. Speed decides who acts first. Wins earn Combat Marks and gear for your next run.</p>
            <button type="button" className="io-tutorial-primary" onClick={() => { setCombatTutorialStep(3); changeTab('gear'); }}><Package size={15} /> View your Gear</button>
          </>}
          {combatTutorialStep === 3 && <>
            <h2>Grow your build</h2>
            <p>Spend Combat Marks on upgrades, equip the gear you find, and use Runes to improve your main-game rolls. Bosses always drop a Rune.</p>
            <button type="button" className="io-tutorial-primary" onClick={() => { finishCombatTutorial(); changeTab('runes'); }}><Gem size={15} /> Finish in Runes</button>
          </>}
        </section>
      )}

      {/* Main Container Content */}
      <main className="app-main flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">

        {!combatMode && state && tutorialStatusLoaded && !tutorialDismissed && (state.totalRolls <= 3 || tutorialStep > 0) && (
          <section className="io-tutorial-guide" aria-live="polite" aria-label={`First steps tutorial, step ${Math.min(4, tutorialStep + 1)} of 4`}>
          <div className="io-tutorial-topline"><span>First steps</span><span>Step {Math.min(4, tutorialStep + 1)} of 4</span><button type="button" onClick={finishTutorial} aria-label="Skip tutorial">Skip</button></div>
            {tutorialStep === 0 && <>
              <h2>Roll your first orb</h2>
              <p>Each roll finds an Orb. Rarer ones are worth more Coins, and every roll earns XP. Some rolls also find Shards.</p>
              <button type="button" className="io-tutorial-primary" disabled={isRolling || busy} onClick={() => { void handleRoll(false); }}><Sparkles size={15} /> Roll my first orb</button>
            </>}
            {tutorialStep === 1 && <>
              <h2>Turn the result into progress</h2>
              <p>{lastOrb ? `You found ${lastOrb.name} (1 / ${formatNumber(lastOrb.rarity)}). ` : ''}Keep rolling to earn Coins and XP. Level 2 opens Upgrades, where Luck and Speed help your next roll.</p>
              {state.level >= 2
                ? <button type="button" className="io-tutorial-primary" onClick={() => { setTutorialStep(2); changeTab('upgrades'); }}>Explore Upgrades <Zap size={15} /></button>
                : <button type="button" className="io-tutorial-primary" disabled={isRolling || busy} onClick={() => { void handleRoll(false); }}>Roll toward Level 2 <Sparkles size={15} /></button>}
            </>}
            {tutorialStep === 2 && <>
              <h2>Make the next roll better</h2>
              <p>Luck helps you find rarer Orbs. Speed lets you roll again sooner. Level 4 opens your Collection, where every new discovery is saved.</p>
              {state.level >= 4
                ? <button type="button" className="io-tutorial-primary" onClick={() => { setTutorialStep(3); changeTab('collection'); }}>Open the Codex <BookOpen size={15} /></button>
                : <button type="button" className="io-tutorial-primary" disabled={isRolling || busy} onClick={() => { void handleRoll(false); }}>Roll toward Level 4 <Sparkles size={15} /></button>}
            </>}
            {tutorialStep >= 3 && <>
              <h2>Grow beyond rolling</h2>
              <p>Your finds stay in Collection. At Level {FEATURE_UNLOCK_LEVELS.combat}, Combat opens a new way to play; Runes you find there can improve your rolls here.</p>
              <button type="button" className="io-tutorial-primary" onClick={() => { finishTutorial(); changeTab('roll'); }}>Back to rolling <Sparkles size={15} /></button>
            </>}
          </section>
        )}
        {combatMode ? (
          <CombatSection page={tab as CombatPage} onNavigate={changeTab} />
        ) : (
          <>
        {tab === 'roll' && (
          <RollSection
            state={state}
            lastOrb={lastOrb}
            lastBatch={lastBatch}
            batchSummary={batchSummary}
            readyAt={readyAt}
            busy={isRolling}
            autoRoll={autoRoll}
            onBuyUpgrade={handleBuyUpgrade}
            onBuyAllUpgrades={handleBuyAllUpgrades}
            onOpenUpgrades={() => changeTab('upgrades')}
            onToggleAutoRoll={handleToggleAutoRoll}
            onRoll={handleRoll}
            onOrbFrenzy={handleStartOrbFrenzy}
            frenzyArmed={frenzyArmed}
            onOpenShareModal={(r, isInfinity) => { setShareRarity(r); setShareIsInfinity(!!isInfinity); }}
            onNewBest={(orb, prevBest) => setNewBestModalData({ orb, prevBest })}
          />
        )}

        {tab === 'upgrades' && (
          <UpgradesSection
            state={state}
            onBuyUpgrade={handleBuyUpgrade}
            onBuyAllUpgrades={handleBuyAllUpgrades}
            onActivateTurbo={handleActivateTurbo}
            busy={false}
          />
        )}

        {tab === 'boosters' && (
          <BoostersAndAutomation
            state={state}
            busy={false}
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
            busy={false}
          />
        )}

        {tab === 'mastery' && (
          <MasterySection
            state={state}
            onUpgradeMastery={handleUpgradeMastery}
            busy={false}
          />
        )}

        {tab === 'collection' && (
          <CollectionSection
            state={state}
            onOpenShareModal={(r, isInfinity) => { setShareRarity(r); setShareIsInfinity(!!isInfinity); }}
            onBuyChainPatcher={handleBuyChainPatcher}
          />
        )}

        {tab === 'quests' && (
          <QuestsAndStreaks
            state={state}
            onClaimDailyStreak={handleClaimDailyStreak}
            onClaimQuest={handleClaimQuest}
            busy={false}
          />
        )}

        {tab === 'social' && (
          <GuildsAndSocial
            guilds={guildData.guilds}
            myGuild={guildData.mine}
            guildLoadError={guildLoadError}
            guildLoading={guildLoading}
            guildDataLoaded={guildDataLoaded}
            onRefreshGuildData={refreshGuildData}
            leaderboard={leaderboardData}
            leaderboards={leaderboards ?? undefined}
            onRefreshLeaderboards={refreshLeaderboards}
            leaderboardLoading={leaderboardLoading}
            leaderboardLoaded={leaderboardLoaded}
            leaderboardLoadError={leaderboardLoadError}
            worldEvent={worldEvent}
            onCreateGuild={handleCreateGuild}
            onJoinGuild={handleJoinGuild}
            onLeaveGuild={handleLeaveGuild}
            onBuyGuildPerk={handleBuyGuildPerk}
            onToggleGuildTrust={handleToggleGuildTrust}
            onKickGuildMember={handleKickGuildMember}
            onSetGuildTax={handleSetGuildTax}
            playerUsername={state.username ?? ''}
            playerHasShared={Boolean(state.lastShareAt && state.lastShareAt > 0)}
            busy={false}
          />
        )}

        {tab === 'profile' && (
          <ProfileAndPrestige
            state={state}
            onPrestige={handlePrestige}
            onBuyPrestigeUpgrade={handleBuyPrestigeUpgrade}
            onSynthesizeDust={handleSynthesizeDust}
            busy={false}
          />
        )}
          </>
        )}
      </main>

      {showFrenzyPrompt && (
        <div className="fixed inset-0 z-[70] io-modal-backdrop flex items-center justify-center p-4">
          <section className="io-modal-card io-frenzy-prompt w-full max-w-md bg-slate-950/95">
            {frenzyPromptPreview && <div className="mb-3 rounded-lg border border-teal-400/30 bg-teal-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-teal-200">Admin Preview · No metrics or Frenzy action</div>}
            <div className="io-frenzy-prompt-kicker">
              <Flame className="w-4 h-4" />
              Daily Frenzy
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">Post today’s Frenzy</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Charge a public Frenzy from today’s best roll. Your next manual Roll creates the post
              and lets other players claim that same Frenzy. Each player can claim it once, subject to their personal claim cooldown.
            </p>
            <div className="io-frenzy-prompt-reward">
              <div className="text-3xl font-black text-fuchsia-200">+{FRENZY_OWNER_SHARD_REWARD} Shards</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">
                When someone claims your Frenzy, you receive these Shards. This is a separate bonus and does not count toward your roll-earned Shard total.
              </div>
            </div>
            <div className="io-modal-actions">
              <button type="button"
                onClick={acceptFrenzyPrompt}
                disabled={busy || frenzyPromptPreview}
                className="io-public-button io-public-button-primary"
              >
                <Flame className="w-4 h-4" />
                {busy ? 'Charging…' : 'Charge My Frenzy'}
              </button>
              <button type="button"
                onClick={dismissFrenzyPrompt}
                className="io-public-button io-public-button-secondary"
              >
                Not now
              </button>
            </div>
            <div className="mt-3 text-[10px] text-slate-600">
              You can post another Frenzy tomorrow.
            </div>
          </section>
        </div>
      )}

      {showJoinSubredditPrompt && (joinSubredditPreview || popupConfig.joinSubreddit) && !followRewardClaimed && (
        <div className="fixed inset-0 z-[71] io-modal-backdrop flex items-center justify-center p-4" data-testid="join-subreddit-prompt-backdrop">
          <section className="io-modal-card io-join-subreddit-prompt w-full max-w-md bg-slate-950/95" role="dialog" aria-modal="true" aria-labelledby="io-join-subreddit-prompt-title" data-testid="join-subreddit-prompt">
            {joinSubredditPreview && <div className="mb-3 rounded-lg border border-teal-400/30 bg-teal-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-teal-200">Admin Preview · No subscription, reward, or metrics</div>}
            <div className="io-join-subreddit-kicker"><Users className="w-4 h-4" /> COMMUNITY REWARD · LEVEL 5</div>
            <h2 id="io-join-subreddit-prompt-title" className="mt-2 text-2xl font-black text-white">Join r/{joinSubredditName}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">Join the community where you’re playing to keep up with Infinity Orbs news, discoveries, and updates.</p>
            <div className="io-join-subreddit-reward">
              <div className="text-3xl font-black text-cyan-200">+100 FREE ROLLS</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">Join this subreddit to add 100 rolls to your saved Free Rolls balance. This reward can be claimed once per account.</div>
            </div>
            <div className="io-modal-actions">
              <button type="button" onClick={() => void acceptJoinSubredditPrompt()} disabled={claimingFollowReward || joinSubredditPreview} className="io-public-button io-public-button-primary" data-testid="join-subreddit-accept">
                <Users className="w-4 h-4" /> {claimingFollowReward ? 'Joining…' : 'Join & Claim 100 Free Rolls'}
              </button>
              <button type="button" onClick={dismissJoinSubredditPrompt} disabled={claimingFollowReward} className="io-public-button io-public-button-secondary" data-testid="join-subreddit-dismiss">Not now</button>
            </div>
            <button type="button" onClick={dismissJoinSubredditPrompt} className="io-modal-close" aria-label="Close join subreddit prompt" disabled={claimingFollowReward}><X className="w-4 h-4" /></button>
          </section>
        </div>
      )}

      {/* New Best Ball Celebration Modal */}
      {newBestModalData && (
        <NewBestModal
          orb={newBestModalData.orb}
          prevBest={newBestModalData.prevBest}
          onClose={() => setNewBestModalData(null)}
          onOpenShareModal={(r, isInfinity) => { setShareRarity(r); setShareIsInfinity(!!isInfinity); }}
        />
      )}

      {/* Reddit Share Modal (GDD Section 17 & 18) */}
      {shareRarity !== null && (
        <RedditShareModal
          rarity={shareRarity}
          isInfinity={shareIsInfinity}
          state={state}
          onClose={() => setShareRarity(null)}
          onShare={handleShareToReddit}
        />
      )}

      {frenzyThanksPrompt && (
        <div className="fixed inset-0 z-[80] io-modal-backdrop flex items-center justify-center p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="frenzy-thanks-title" className="io-modal-card w-full max-w-md bg-slate-950/95">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-fuchsia-300">
              <Flame className="w-4 h-4" />
              Frenzy thank-you
            </div>
            <h2 id="frenzy-thanks-title" className="mt-2 text-2xl font-black text-white">Thank the Frenzy poster</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              You claimed u/{frenzyThanksPrompt.ownerUsername}'s Frenzy. You can leave an optional public comment below.
              It will be posted as your Reddit account, not the app.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Please also consider upvoting the Frenzy post to thank its owner. Commenting is optional and gives no gameplay reward.
            </p>
            <label className="mt-4 block text-xs font-bold text-slate-300" htmlFor="frenzy-thanks-message">Public comment</label>
            <textarea
              id="frenzy-thanks-message"
              value={frenzyThanksPrompt.message}
              onChange={event => setFrenzyThanksPrompt(current => current ? { ...current, message: event.target.value } : current)}
              maxLength={500}
              rows={4}
              disabled={postingFrenzyThanks}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
            />
            <div className="mt-1 text-right text-[10px] text-slate-600">{frenzyThanksPrompt.message.length}/500</div>
            <div className="mt-3 text-xs">
              <a
                href={`https://www.reddit.com/comments/${frenzyThanksPrompt.postId.replace(/^t3_/, '')}/`}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-fuchsia-300 underline hover:text-fuchsia-200"
              >
                Open the Frenzy post to upvote
              </a>
            </div>
            <div className="io-modal-actions mt-4">
              <button
                type="button"
                onClick={() => void handlePostFrenzyThanks()}
                disabled={postingFrenzyThanks || !frenzyThanksPrompt.message.trim()}
                className="io-public-button io-public-button-primary disabled:opacity-50"
              >
                {postingFrenzyThanks ? 'Posting comment…' : `Post comment as u/${state.username ?? 'Redditor'}`}
              </button>
              <button
                type="button"
                onClick={() => setFrenzyThanksPrompt(null)}
                disabled={postingFrenzyThanks}
                className="io-public-button io-public-button-secondary"
              >
                Not now
              </button>
            </div>
          </section>
        </div>
      )}

      {showFrenzyCalculating && (
        <div className="fixed inset-0 z-[90] io-modal-backdrop io-frenzy-calculating-backdrop flex items-center justify-center p-4" data-testid="frenzy-calculating-backdrop">
          <section
            className="io-modal-card io-frenzy-calculating-card w-full max-w-md bg-slate-950/95"
            role="dialog"
            aria-modal="true"
            aria-labelledby="frenzy-calculating-title"
            aria-describedby="frenzy-calculating-description"
            data-testid="frenzy-calculating-popup"
          >
            <div className="io-frenzy-calculating-kicker"><Flame className="w-4 h-4" /> FRENZY SEQUENCE</div>
            <div className="io-frenzy-calculating-stage" aria-hidden="true">
              <div className="io-frenzy-calculating-aura" />
              {Array.from({ length: 12 }, (_, index) => (
                <span className="io-frenzy-calculating-orb" key={index} />
              ))}
              <div className="io-frenzy-calculating-core"><span>∞</span></div>
            </div>
            <h2 id="frenzy-calculating-title" className="io-frenzy-calculating-title">Calculating Frenzy</h2>
            <p id="frenzy-calculating-description" className="io-frenzy-calculating-copy">
              Rolling your payout at warp speed.
            </p>
            <div className="io-frenzy-progress-wrap">
              <div className="io-frenzy-progress-meta">
                <span>
                  {frenzyProgress.total > 0
                    ? `${formatNumber(frenzyProgressCount)} / ${formatNumber(frenzyProgress.total)} ORBS`
                    : 'PREPARING ROLLS'}
                </span>
                <strong>{Math.round(Math.max(0, Math.min(100, frenzyProgressPercent)))}%</strong>
              </div>
              <div
                className="io-frenzy-progress-track"
                role="progressbar"
                aria-label="Frenzy claim progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.max(0, Math.min(100, frenzyProgressPercent)))}
                aria-valuetext={`${formatNumber(frenzyProgressCount)} of ${formatNumber(frenzyProgress.total)} Orbs processed`}
              >
                <span style={{ width: `${Math.max(0, Math.min(100, frenzyProgressPercent))}%` }} />
              </div>
            </div>
            <div className="io-frenzy-calculating-status" role="status" aria-live="polite">
              <span className="io-frenzy-calculating-status-dot" />
              Processing your Frenzy reward
            </div>
          </section>
        </div>
      )}

      {/* Global Chat */}
      <GlobalChatWindow username={state.username ?? ''} launcherContext="main" />

      {/* Changelog */}
      {showChangelogModal && (
        <ChangelogModal onClose={() => setShowChangelogModal(false)} />
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
        <RarityTableModal highestRarity={state.highestRarity || 0} onClose={() => setShowOddsModal(false)} />
      )}

      {showGettingStarted && (
        <GettingStartedModal level={state.level} onClose={() => setShowGettingStarted(false)} />
      )}

      {/* Admin Console */}
      {showDevModal && isAdmin && (
        <DevDebugModal
          onClose={() => setShowDevModal(false)}
          onRefresh={refreshAll}
          onForceFrenzyPopup={() => {
            setFrenzyPromptPreview(true);
            setShowFrenzyPrompt(true);
          }}
          onForceNotificationPopup={() => {
            setNotificationPromptPreview(true);
            setShowNotificationPrompt(true);
          }}
          onForceJoinSubredditPopup={() => {
            setJoinSubredditPreview(true);
            setShowJoinSubredditPrompt(true);
          }}
          onPopupConfigChanged={setPopupConfig}
          onForceRollResult={res => {
            changeTab('roll');
            applyPlayerState(res.state);
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
