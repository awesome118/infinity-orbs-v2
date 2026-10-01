import React, { useEffect, useState } from 'react';
import {
  Bot,
  Clock,
  Coins,
  Gauge,
  Gift,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import type {
  AutomationId,
  GlobalBoosterId,
  GlobalBoosterSnapshot,
  PlayerState,
  PremiumBoosterId,
} from '../../shared/game.js';
import {
  AUTOMATIONS,
  FREE_SHARD_DAILY_CAP,
  GLOBAL_BOOSTERS,
  GLOBAL_BOOSTER_STACK_MS,
  decayGlobalBoosterState,
  globalBoosterProgress,
  globalBoosterLuckMultiplier,
  globalBoosterSpeedMultiplier,
  globalBoosterCritChanceBonus,
  globalBoosterCritDamageBonus,
  PREMIUM_BOOSTERS,
  onlinePlayerLuckMultiplier,
  premiumBoosterRemainingMs,
} from '../../shared/game.js';

interface BoostersAndAutomationProps {
  state: PlayerState;
  busy: boolean;
  onActivateBooster: (id: PremiumBoosterId) => Promise<void>;
  globalBoosters: GlobalBoosterSnapshot;
  onActivateGlobalBooster: (id: GlobalBoosterId, useCredit: boolean) => Promise<void>;
  onBuyAutomation: (id: AutomationId) => Promise<void>;
  onClaimCommunityReward: () => Promise<void>;
}

const boosterIcons: Record<PremiumBoosterId, React.ReactNode> = {
  fortune: <Star className="w-5 h-5 text-amber-300" />,
  hyperdrive: <Gauge className="w-5 h-5 text-cyan-300" />,
  barrage: <Zap className="w-5 h-5 text-fuchsia-300" />,
  prosperity: <Coins className="w-5 h-5 text-yellow-300" />,
  ascension: <Sparkles className="w-5 h-5 text-purple-300" />,
};

const automationIcons: Record<AutomationId, React.ReactNode> = {
  autoQuestClaim: <Gift className="w-5 h-5 text-emerald-300" />,
  autoStreakClaim: <Clock className="w-5 h-5 text-amber-300" />,
  autoCommunityClaim: <Users className="w-5 h-5 text-indigo-300" />,
  autoOfflineClaim: <Clock className="w-5 h-5 text-teal-300" />,
  autoUpgrade: <TrendingUp className="w-5 h-5 text-cyan-300" />,
};

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  return minutes + 'm ' + seconds + 's';
}

export const BoostersAndAutomation: React.FC<BoostersAndAutomationProps> = ({
  state,
  busy,
  globalBoosters,
  onActivateBooster,
  onActivateGlobalBooster,
  onBuyAutomation,
  onClaimCommunityReward,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const onlinePlayers = Math.max(1, state.onlinePlayers ?? 1);
  const onlineLuck = onlinePlayerLuckMultiplier(onlinePlayers);
  const freeShards = Math.min(FREE_SHARD_DAILY_CAP, state.freeShardsEarnedToday ?? 0);
  const nextCommunityClaim = Math.max(
    0,
    (state.communityRewardClaimedAt ?? 0) + 5 * 60 * 1000 - now,
  );
  const communityReady = nextCommunityClaim <= 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="rounded-3xl border border-indigo-500/25 bg-gradient-to-br from-slate-900 via-indigo-950/20 to-slate-900 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">Boosters & Automation</h2>
              <Sparkles className="w-4 h-4 text-purple-300 animate-pulse" />
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Spend Shards for huge temporary power spikes and permanent quality-of-life
              automation. Boosters change your odds and output, but every orb is still RNG.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
              <span className="block text-[10px] uppercase font-black text-cyan-300/70">Online</span>
              <span className="text-lg font-black text-cyan-200">{onlinePlayers.toLocaleString()}</span>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <span className="block text-[10px] uppercase font-black text-emerald-300/70">Online Luck</span>
              <span className="text-lg font-black text-emerald-200">×{onlineLuck.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-black text-cyan-300">Free Shards today: {freeShards}/{FREE_SHARD_DAILY_CAP}</span>
            <span className="text-slate-500 ml-2">Gameplay earnings are capped server-side.</span>
          </div>
          <div className="text-slate-400">
            {state.shards.toLocaleString()} Shards available
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-fuchsia-500/20 bg-gradient-to-br from-slate-900 via-fuchsia-950/10 to-slate-900 p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-white">World Boosters</h3>
              <Users className="w-4 h-4 text-fuchsia-300" />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Anyone can spend 25 Shards to boost every player. Stacks add time, never strength.
              Each stack adds 30 minutes of charge. Crossing another full bar tier increases the effect,
              while the timer drains faster. Tier 5 drains at 3× speed.
            </p>
          </div>
          <div className="text-[11px] font-bold text-fuchsia-200">
            Free World Boosts: {state.globalBoosterCredits ?? 0}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          {(Object.keys(GLOBAL_BOOSTERS) as GlobalBoosterId[]).map(id => {
            const raw = globalBoosters[id];
            const displayed = decayGlobalBoosterState(raw, now);
            const active = displayed.remainingMs > 0 && displayed.tier > 0;
            const progress = globalBoosterProgress(displayed);
            const drain = displayed.tier > 0 ? (1 + (displayed.tier - 1) * 0.5) : 1;
            const effect = id === 'luck'
              ? '×' + globalBoosterLuckMultiplier(displayed).toFixed(2) + ' Luck'
              : id === 'speed'
                ? Math.round((1 - globalBoosterSpeedMultiplier(displayed)) * 100) + '% faster cooldown'
                : '+' + Math.round(globalBoosterCritChanceBonus(displayed) * 100) + '% Crit, +' +
                  globalBoosterCritDamageBonus(displayed).toFixed(1) + '× damage';

            return (
              <div key={id} className="rounded-2xl border border-slate-800 bg-slate-950/65 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white">{GLOBAL_BOOSTERS[id].name}</span>
                  <span className="text-[10px] font-black text-fuchsia-300">
                    {active ? 'Tier ' + displayed.tier : 'Inactive'}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-400 transition-all duration-700"
                      style={{ width: (active ? Math.min(100, progress) : 0) + '%' }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">
                      {active ? formatDuration(displayed.remainingMs / drain) + ' real time left' : 'No active boost'}
                    </span>
                    <span className="text-fuchsia-300 font-bold">
                      {active ? effect : 'Base effect available'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void onActivateGlobalBooster(id, false)}
                    disabled={busy || state.shards < GLOBAL_BOOSTERS[id].costShards}
                    className="flex-1 px-2.5 py-2 rounded-xl text-[10px] font-black bg-slate-800 hover:bg-slate-700 text-white disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    +30m • 25 💎
                  </button>
                  <button
                    onClick={() => void onActivateGlobalBooster(id, true)}
                    disabled={busy || (state.globalBoosterCredits ?? 0) <= 0}
                    className="px-2.5 py-2 rounded-xl text-[10px] font-black bg-fuchsia-600/20 border border-fuchsia-500/25 text-fuchsia-200 hover:bg-fuchsia-600/30 disabled:text-slate-600 disabled:cursor-not-allowed"
                    title="Use one free World Booster activation from a purchased Shard pack"
                  >
                    Free
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Zap className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm font-black text-white uppercase tracking-wide">Premium Boosters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(PREMIUM_BOOSTERS) as PremiumBoosterId[]).map(id => {
            const info = PREMIUM_BOOSTERS[id];
            const remaining = premiumBoosterRemainingMs(state, id, now);
            const active = remaining > 0;
            const canAfford = state.shards >= info.costShards;

            return (
              <div key={id} className="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      {boosterIcons[id]}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">{info.name}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{info.desc}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-1">
                    {info.costShards} 💎
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className={active ? 'text-emerald-300 text-xs font-black' : 'text-slate-500 text-xs font-bold'}>
                    {active ? 'ACTIVE • ' + formatDuration(remaining) + ' left' : 'Ready to activate'}
                  </span>
                  <button
                    onClick={() => void onActivateBooster(id)}
                    disabled={busy || !canAfford}
                    className={
                      active
                        ? 'px-3 py-2 rounded-xl text-xs font-black transition-all bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 hover:bg-indigo-500/30 active:scale-95'
                        : canAfford
                          ? 'px-3 py-2 rounded-xl text-xs font-black transition-all bg-gradient-to-r from-cyan-600 to-indigo-600 text-white hover:from-cyan-500 hover:to-indigo-500 active:scale-95'
                          : 'px-3 py-2 rounded-xl text-xs font-black transition-all bg-slate-800 text-slate-500 cursor-not-allowed'
                    }
                  >
                    {active ? 'Extend' : 'Activate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 via-emerald-950/10 to-slate-900 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-300" />
              <h3 className="text-base font-black text-white">Community Reward</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              A claimable community cache refreshes every 5 minutes while you are around.
              It rewards Coins and XP based on the current community event tier.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="block text-[10px] uppercase font-black text-slate-500">Next claim</span>
              <span className={communityReady ? 'text-sm font-black text-emerald-300' : 'text-sm font-black text-slate-200'}>
                {communityReady ? 'READY' : formatDuration(nextCommunityClaim)}
              </span>
            </div>
            <button
              onClick={() => void onClaimCommunityReward()}
              disabled={busy || !communityReady}
              className={
                communityReady
                  ? 'px-4 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
                  : 'px-4 py-2.5 rounded-xl text-xs font-black bg-slate-800 text-slate-500 cursor-not-allowed'
              }
            >
              Claim
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Bot className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-black text-white uppercase tracking-wide">Permanent Automation</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(AUTOMATIONS) as AutomationId[]).map(id => {
            const info = AUTOMATIONS[id];
            const owned = Boolean(state.automations?.[id]);
            const canAfford = state.shards >= info.costShards;

            return (
              <div key={id} className={
                owned
                  ? 'rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-4 shadow-md'
                  : 'rounded-2xl border border-slate-800 bg-slate-900/85 p-4 shadow-md'
              }>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      {automationIcons[id]}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">{info.name}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{info.desc}</p>
                    </div>
                  </div>
                  {owned ? (
                    <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-1">
                      UNLOCKED
                    </span>
                  ) : (
                    <span className="text-[10px] font-black text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-1">
                      {info.costShards} 💎
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    {id === 'autoCommunityClaim'
                      ? 'Never miss the 5-minute community cache.'
                      : id === 'autoQuestClaim'
                        ? 'Claims rewards as soon as objectives finish.'
                        : id === 'autoStreakClaim'
                          ? 'Keeps daily streak rewards from sitting unclaimed.'
                          : id === 'autoOfflineClaim'
                            ? 'Processes offline rolls as soon as they become claimable.'
                            : 'Keeps affordable standard upgrades flowing.'}
                  </span>
                  <button
                    onClick={() => void onBuyAutomation(id)}
                    disabled={busy || owned || !canAfford}
                    className={
                      owned
                        ? 'px-3 py-2 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 cursor-default'
                        : canAfford
                          ? 'px-3 py-2 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-700 text-white active:scale-95'
                          : 'px-3 py-2 rounded-xl text-xs font-black bg-slate-800 text-slate-500 cursor-not-allowed'
                    }
                  >
                    {owned ? 'Active' : 'Unlock'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
