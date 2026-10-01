import React, { useEffect, useState } from 'react';
import {
  X, Wrench, Coins, Gem, Sparkles, Zap, RotateCcw, Play, Shield,
  Ban, UserX, CheckCircle2, RefreshCw, Flame,
  Database, Wand2, Trash2, Gauge, ListRestart, Save, Power,
} from 'lucide-react';
import type { RollResponse } from '../../shared/game.js';
import { sound } from '../sound.js';

interface DevDebugModalProps {
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onForceRollResult?: (res: RollResponse) => void;
}

type AdminContext = {
  username: string | null;
  userId: string | null;
  subredditName: string | null;
  postId: string | null;
  gameModerationVersion?: string;
  gameBan?: {
    active: true;
    bannedAt: number;
    bannedUntil: number | null;
    reason: string;
  } | null;
};

const buttonBase =
  'rounded-xl border text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
const panelBase = 'bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3';

export const DevDebugModal: React.FC<DevDebugModalProps> = ({
  onClose,
  onRefresh,
  onForceRollResult,
}) => {
  const [customRarity, setCustomRarity] = useState('100000');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [contextInfo, setContextInfo] = useState<AdminContext | null>(null);

  const [targetUser, setTargetUser] = useState('');
  const [banDuration, setBanDuration] = useState('permanent');
  const [banReason, setBanReason] = useState('Infinity Orbs admin action');

  const [frenzyRarity, setFrenzyRarity] = useState('');
  const [frenzyPostId, setFrenzyPostId] = useState('');
  const [frenzyPostUrl, setFrenzyPostUrl] = useState('');

  const [stateInputs, setStateInputs] = useState({
    coins: '',
    shards: '',
    dust: '',
    xp: '',
    totalRolls: '',
    highestRarity: '',
    collectionValue: '',
    offlineRolls: '',
    currentRunRolls: '',
    rollsSinceBest: '',
  });

  const [globalBooster, setGlobalBooster] = useState('luck');
  const [globalTier, setGlobalTier] = useState('5');
  const [globalMinutes, setGlobalMinutes] = useState('30');

  const sendAdminAction = async (endpoint: string, body: any = {}, refresh = true) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Admin request failed');
      sound.playClick();
      setMessage('Success.');
      if (refresh) await onRefresh();
      return data;
    } catch (e: any) {
      setMessage(`Error: ${e?.message || 'Admin request failed'}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getBannedUsers = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/dev/moderation/banned');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load banned users.');
      setBannedUsers(data.users ?? []);
      setMessage(`Loaded ${(data.users ?? []).length} banned users.`);
    } catch (e: any) {
      setMessage(`Error: ${e?.message || 'Could not load banned users.'}`);
    } finally {
      setLoading(false);
    }
  };

  const [bannedUsers, setBannedUsers] = useState<Array<{
    username: string;
    userId?: string;
    bannedAt: number;
    bannedUntil: number | null;
    reason: string;
  }>>([]);

  useEffect(() => {
    void fetch('/api/dev/status')
      .then(r => r.json())
      .then(setContextInfo)
      .catch(() => null);
  }, []);

  const handleForceRoll = async (rarityNum: number) => {
    const data = await sendAdminAction('/api/dev/force-roll', { rarity: rarityNum });
    if (data && onForceRollResult) {
      onForceRollResult(data as RollResponse);
      onClose();
    }
  };

  const updateState = async () => {
    const body: Record<string, number> = {};
    for (const [key, value] of Object.entries(stateInputs)) {
      if (!value.trim()) continue;
      const num = Number(value);
      if (!Number.isFinite(num)) {
        setMessage(`${key} must be a number.`);
        return;
      }
      const mapped = key === 'dust' ? 'cosmicDust' : key;
      body[mapped] = Math.floor(num);
    }
    if (Object.keys(body).length === 0) {
      setMessage('Enter at least one state value.');
      return;
    }
    await sendAdminAction('/api/dev/state', body);
  };

  const setPreset = async (preset: string) => {
    await sendAdminAction('/api/dev/preset', { preset });
  };

  const confirmation = (text: string) => window.confirm(text);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl p-4 sm:p-6 max-w-5xl w-full space-y-4 shadow-2xl relative max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Admin Console</h3>
              <p className="text-xs text-slate-400">Server-authorized testing and moderation controls.</p>
              <p className="text-[10px] text-emerald-400/70 font-mono">Game moderation: {contextInfo?.gameModerationVersion ?? "loading"}</p>
            </div>
          </div>
          <button title="Close the admin console." onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5">
            <div className="text-[9px] uppercase font-bold text-emerald-400">Admin</div>
            <div className="text-xs font-mono text-white truncate">{contextInfo?.username ?? '...'}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[9px] uppercase font-bold text-slate-500">User ID</div>
            <div className="text-[10px] font-mono text-slate-300 truncate">{contextInfo?.userId ?? '...'}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[9px] uppercase font-bold text-slate-500">Subreddit</div>
            <div className="text-xs font-semibold text-white truncate">{contextInfo?.subredditName ? `r/${contextInfo.subredditName}` : 'No context'}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[9px] uppercase font-bold text-slate-500">Post</div>
            <div className="text-[10px] font-mono text-slate-300 truncate">{contextInfo?.postId ?? 'Game root'}</div>
          </div>
        </div>

        {message && (
          <div className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400">
            {message}
          </div>
        )}

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
            <Wand2 className="w-4 h-4" /> Test Presets
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['fresh', 'Fresh Save', 'bg-slate-800 hover:bg-slate-700'],
              ['max', 'Max Everything', 'bg-emerald-600 hover:bg-emerald-500'],
              ['frenzy-ready', 'Frenzy Ready', 'bg-fuchsia-600 hover:bg-fuchsia-500'],
              ['offline-ready', '1,000 Offline', 'bg-indigo-600 hover:bg-indigo-500'],
              ['quests-ready', 'Quests Ready', 'bg-amber-600 hover:bg-amber-500'],
              ['prestige-ready', 'Prestige Ready', 'bg-violet-600 hover:bg-violet-500'],
              ['booster-test', 'Boosters 1h', 'bg-cyan-600 hover:bg-cyan-500'],
              ['upgrades-max', 'Upgrades Max', 'bg-emerald-700 hover:bg-emerald-600'],
              ['upgrades-reset', 'Upgrades 0', 'bg-slate-800 hover:bg-slate-700'],
              ['prestige-max', 'Prestige Max', 'bg-violet-700 hover:bg-violet-600'],
              ['prestige-reset', 'Prestige 0', 'bg-slate-800 hover:bg-slate-700'],
              ['mastery-max', 'Mastery Max', 'bg-purple-700 hover:bg-purple-600'],
              ['mastery-reset', 'Mastery 0', 'bg-slate-800 hover:bg-slate-700'],
              ['automations-on', 'Automation On', 'bg-cyan-700 hover:bg-cyan-600'],
              ['automations-off', 'Automation Off', 'bg-slate-800 hover:bg-slate-700'],
              ['boosters-off', 'Boosters Off', 'bg-slate-800 hover:bg-slate-700'],
              ['collection-clear', 'Clear Collection', 'bg-rose-700 hover:bg-rose-600'],
              ['quests-reset', 'Reset Quests', 'bg-slate-800 hover:bg-slate-700'],
              ['streak-reset', 'Reset Streak', 'bg-slate-800 hover:bg-slate-700'],
              ['offline-clear', 'Clear Offline', 'bg-slate-800 hover:bg-slate-700'],
            ].map(([id, label, cls]) => (
              <button title={`Apply the ${label} test preset.`} key={id} disabled={loading} onClick={() => void setPreset(id)} className={`${buttonBase} border-transparent px-3 py-2 text-white ${cls}`}>
                {label}
              </button>
            ))}
            <button
              title="Reset daily, weekly, streak, free-shard, and Frenzy timing flags."
              disabled={loading}
              onClick={() => void sendAdminAction('/api/dev/reset-daily')}
              className={`${buttonBase} bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-300 px-3 py-2`}
            >
              <ListRestart className="inline w-3.5 h-3.5 mr-1" /> Reset Daily
            </button>
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
            <Play className="w-4 h-4" /> Force Exact Roll
          </div>
          <div className="flex gap-2">
            <input
              title="Exact rarity denominator for the forced roll. For example, 100000 means 1/100,000."
              type="number"
              value={customRarity}
              onChange={e => setCustomRarity(e.target.value)}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              title="Enter the exact rarity to force for a test roll." placeholder="Rarity denominator"
            />
            <button title="Perform one roll at the exact rarity entered in the field." onClick={() => void handleForceRoll(Number(customRarity))} disabled={loading} className={`${buttonBase} bg-cyan-600 hover:bg-cyan-500 border-cyan-500 text-white px-4`}>
              Roll Exact
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000].map(v => (
              <button title={`Force one roll at exact rarity 1/${v.toLocaleString()}.`} key={v} onClick={() => void handleForceRoll(v)} disabled={loading} className={`${buttonBase} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 px-2.5 py-1.5 font-mono`}>
                1/{v.toLocaleString()}
              </button>
            ))}
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
            <Coins className="w-4 h-4" /> Resources
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              ['/api/dev/currency', { coins: 10_000 }, '+10K Coins'],
              ['/api/dev/currency', { coins: 1_000_000 }, '+1M Coins'],
              ['/api/dev/currency', { coins: 100_000_000 }, '+100M Coins'],
              ['/api/dev/currency', { shards: 25 }, '+25 Shards'],
              ['/api/dev/currency', { shards: 500 }, '+500 Shards'],
              ['/api/dev/currency', { dust: 50 }, '+50 Dust'],
            ].map(([endpoint, body, label]) => (
              <button title="Add the displayed test resource amount without normal gameplay costs." key={label as string} onClick={() => void sendAdminAction(endpoint as string, body)} disabled={loading} className={`${buttonBase} bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300 px-2.5 py-2`}>
                {label as string}
              </button>
            ))}
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
              <Database className="w-4 h-4" /> Fine State Control
            </div>
            <button title="Make the next normal roll immediately available." disabled={loading} onClick={() => void sendAdminAction('/api/dev/reset-cooldown')} className={`${buttonBase} bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30 text-indigo-300 px-3 py-1.5`}>
              <Gauge className="inline w-3.5 h-3.5 mr-1" /> Cooldown Ready
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {Object.entries(stateInputs).map(([key, value]) => (
              <label key={key} className="text-[10px] text-slate-400">
                <span className="block mb-1 uppercase font-bold">{key.replace(/([A-Z])/g, ' $1')}</span>
                <input
                  type="number"
                  value={value}
                  onChange={e => setStateInputs(prev => ({ ...prev, [key]: e.target.value }))}
                  title="Set this field directly for testing. Leave blank to keep its current value." placeholder="leave blank"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button title="Apply every nonblank state field above directly to the current test account." disabled={loading} onClick={() => void updateState()} className={`${buttonBase} bg-purple-600 hover:bg-purple-500 border-purple-500 text-white px-4 py-2`}>
              <Save className="inline w-3.5 h-3.5 mr-1" /> Apply State Fields
            </button>
            <button title="Set every standard upgrade to a high testing level." disabled={loading} onClick={() => void sendAdminAction('/api/dev/unlock-upgrades')} className={`${buttonBase} bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300 px-3 py-2`}>
              Unlock Standard Upgrades
            </button>
            <button title="Populate the account with a broad maxed progression state for testing." disabled={loading} onClick={() => void sendAdminAction('/api/dev/unlock-everything')} className={`${buttonBase} bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300 px-3 py-2`}>
              <Sparkles className="inline w-3.5 h-3.5 mr-1" /> Everything
            </button>
            <button title="Add 50 offline rolls to the vault." disabled={loading} onClick={() => void sendAdminAction('/api/dev/add-offline', { amount: 50 })} className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}>
              +50 Offline Rolls
            </button>
          </div>
        </section>

        <section className={`${panelBase} border border-fuchsia-500/30`}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
            <Flame className="w-4 h-4" /> Orb Frenzy Testing
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input
              type="number"
              value={frenzyRarity}
              onChange={e => setFrenzyRarity(e.target.value)}
              placeholder="Optional forced Frenzy rarity, e.g. 1000000"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
            <button
              title="Create a new test Frenzy post. The optional rarity forces its starting rarity and bypasses the daily limit."
              disabled={loading}
              onClick={async () => {
                const data = await sendAdminAction('/api/dev/frenzy/start', frenzyRarity.trim() ? { rarity: Number(frenzyRarity) } : {});
                if (data) {
                  setFrenzyPostId(data.postId ?? '');
                  setFrenzyPostUrl(data.url ?? '');
                }
              }}
              className={`${buttonBase} bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-500 text-white px-4 py-2`}
            >
              <Flame className="inline w-4 h-4 mr-1" /> Trigger Test Frenzy
            </button>
          </div>
          {frenzyPostId && (
            <div className="rounded-xl bg-slate-900 border border-fuchsia-500/20 p-3 space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-500">Latest Test Post</div>
              <div className="text-xs font-mono text-fuchsia-200 break-all">{frenzyPostId}</div>
              {frenzyPostUrl && (
                <a href={frenzyPostUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 underline break-all">
                  Open Frenzy post
                </a>
              )}
              <button
                title="Claim the latest admin test Frenzy as the owner to test the reward flow."
                disabled={loading}
                onClick={() => {
                  if (!confirmation('Claim the latest admin test Frenzy with this admin account?')) return;
                  void sendAdminAction('/api/dev/frenzy/claim', { postId: frenzyPostId });
                }}
                className={`${buttonBase} bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-300 px-3 py-2`}
              >
                Claim Own Test Frenzy
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button title="Clear Frenzy flags so another Frenzy test can run immediately." disabled={loading} onClick={() => void sendAdminAction('/api/dev/frenzy/reset')} className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}>
              <RotateCcw className="inline w-3.5 h-3.5 mr-1" /> Reset Frenzy Flags
            </button>
            {[100, 10_000, 1_000_000, 100_000_000].map(v => (
              <button title={`Use 1/${v.toLocaleString()} as the forced Frenzy rarity.`} key={v} disabled={loading} onClick={() => setFrenzyRarity(String(v))} className={`${buttonBase} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 px-2.5 py-1.5 font-mono`}>
                1/{v.toLocaleString()}
              </button>
            ))}
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
            <Power className="w-4 h-4" /> Global Booster Control
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select title="Choose the Global Booster to edit." value={globalBooster} onChange={e => setGlobalBooster(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white">
              <option value="luck">Global Luck</option>
              <option value="speed">Global Speed</option>
              <option value="crit">Global Crit</option>
            </select>
            <select title="Choose the tier to force. Off disables the booster." value={globalTier} onChange={e => setGlobalTier(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white">
              {[0, 1, 5, 10].map(v => <option key={v} value={v}>{v === 0 ? 'Off' : `Tier ${v}`}</option>)}
            </select>
            <input value={globalMinutes} onChange={e => setGlobalMinutes(e.target.value)} type="number" min="1" title="How many minutes the forced Global Booster state should remain active." className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono" placeholder="minutes" />
            <button
              title="Set a Global Booster's tier and duration directly without spending Shards."
              disabled={loading}
              onClick={() => void sendAdminAction('/api/dev/global-booster', { id: globalBooster, tier: Number(globalTier), minutes: Number(globalMinutes) })}
              className={`${buttonBase} bg-cyan-600 hover:bg-cyan-500 border-cyan-500 text-white px-3 py-2`}
            >
              Set Booster
            </button>
          </div>
        </section>

        <section className={`${panelBase} border border-purple-500/30`}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
            <Sparkles className="w-4 h-4" /> Community Event
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[1_000, 10_000, 100_000, 1_000_000].map(goal => (
              <button title={`Set the community event goal to ${goal.toLocaleString()} rolls.`} key={goal} disabled={loading} onClick={() => void sendAdminAction('/api/dev/event', { goal })} className={`${buttonBase} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 px-2.5 py-2 font-mono`}>
                Goal {goal >= 1_000_000 ? '1M' : goal >= 1_000 ? `${goal / 1000}K` : goal}
              </button>
            ))}
            {[0, 500, 5_000, 50_000].map(progress => (
              <button title={`Set community event progress to ${progress.toLocaleString()}.`} key={`progress-${progress}`} disabled={loading} onClick={() => void sendAdminAction('/api/dev/event', { progress })} className={`${buttonBase} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 px-2.5 py-2`}>
                Progress {progress >= 1000 ? `${progress / 1000}K` : progress}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[500, 5_000, 50_000].map(amount => (
              <button title={`Add ${amount.toLocaleString()} rolls to community event progress.`} key={amount} disabled={loading} onClick={() => void sendAdminAction('/api/dev/event', { addRolls: amount })} className={`${buttonBase} bg-purple-600/20 hover:bg-purple-600/30 border-purple-500/40 text-purple-300 px-3 py-1.5`}>
                +{amount.toLocaleString()} Event Rolls
              </button>
            ))}
            <button title="Reset the community event to its base state." disabled={loading} onClick={() => void sendAdminAction('/api/dev/event', { reset: true })} className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-1.5`}>
              Reset Event
            </button>
          </div>
        </section>

        <section className={`${panelBase} border border-rose-500/30`}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
            <Shield className="w-4 h-4" /> Game Moderation
          </div>
          <p className="text-[10px] text-slate-500">
            These actions affect Infinity Orbs accounts only. They do not ban, mute, approve, or otherwise moderate Reddit users.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <input
              value={targetUser}
              onChange={e => setTargetUser(e.target.value)}
              title="Enter the Reddit username whose Infinity Orbs game account you want to manage." placeholder="Reddit username, without u/"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
            <select
              title="Choose the duration of a game-only ban. Permanent stays until manually unbanned."
              value={banDuration}
              onChange={e => setBanDuration(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="permanent">Permanent game ban</option>
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              title="This reason is shown to the player on the Infinity Orbs ban screen." placeholder="Game ban reason"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
            <button
              title="Ban your own Infinity Orbs account only. The ban screen will keep the admin console available so you can unban yourself."
              disabled={loading}
              onClick={() => {
                const self = contextInfo?.username ?? '';
                if (!self) {
                  setMessage('Could not determine the current admin username.');
                  return;
                }
                if (!confirmation('Ban your own Infinity Orbs account using the current game-ban settings?')) return;
                void sendAdminAction('/api/dev/moderation/self-game-ban', {
                  durationDays: banDuration === 'permanent' ? null : Number(banDuration),
                  reason: banReason,
                });
              }}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <Ban className="inline w-3.5 h-3.5 mr-1" /> Ban Myself (Test)
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <button
              title="Ban the selected account from Infinity Orbs only. This does not affect Reddit."
              disabled={loading || !targetUser.trim()}
              onClick={() => void sendAdminAction('/api/dev/moderation/ban', {
                username: targetUser,
                durationDays: banDuration === 'permanent' ? null : Number(banDuration),
                reason: banReason,
              })}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <Ban className="inline w-3.5 h-3.5 mr-1" /> Ban in Game
            </button>
            <button
              title="Remove the selected account's Infinity Orbs game ban."
              disabled={loading || !targetUser.trim()}
              onClick={() => void sendAdminAction('/api/dev/moderation/unban', { username: targetUser })}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <CheckCircle2 className="inline w-3.5 h-3.5 mr-1" /> Unban Game
            </button>
            <button
              title="Delete the selected player's Infinity Orbs save. This does not change their game-ban record."
              disabled={loading || !targetUser.trim()}
              onClick={() => {
                if (!confirmation(`Delete all Infinity Orbs save data for u/${targetUser.replace(/^u\\//i, '')}?`)) return;
                void sendAdminAction('/api/dev/moderation/wipe-game', { username: targetUser });
              }}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <UserX className="inline w-3.5 h-3.5 mr-1" /> Wipe Save
            </button>
            <button
              title="Delete the selected save and then apply the selected Infinity Orbs game ban."
              disabled={loading || !targetUser.trim()}
              onClick={() => {
                if (!confirmation(`Wipe game data and game-ban u/${targetUser.replace(/^u\\//i, '')}?`)) return;
                void sendAdminAction('/api/dev/moderation/wipe-and-ban', {
                  username: targetUser,
                  durationDays: banDuration === 'permanent' ? null : Number(banDuration),
                  reason: banReason,
                });
              }}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <Ban className="inline w-3.5 h-3.5 mr-1" /> Wipe + Ban
            </button>
            <button
              title="Delete the selected save and remove the selected Infinity Orbs game ban."
              disabled={loading || !targetUser.trim()}
              onClick={() => {
                if (!confirmation(`Wipe game data and unban u/${targetUser.replace(/^u\\//i, '')}?`)) return;
                void sendAdminAction('/api/dev/moderation/wipe-and-unban', { username: targetUser });
              }}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <Trash2 className="inline w-3.5 h-3.5 mr-1" /> Wipe + Unban
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              title="Load the current list of active Infinity Orbs game bans."
              disabled={loading}
              onClick={() => void getBannedUsers()}
              className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}
            >
              <RefreshCw className="inline w-3.5 h-3.5 mr-1" /> Load Banned Game Accounts
            </button>
            <button
              title="Delete your own Infinity Orbs save while keeping your game-ban record unchanged."
              disabled={loading}
              onClick={() => {
                const self = contextInfo?.username ?? '';
                if (!self) return;
                if (!confirmation('Wipe your own Infinity Orbs save?')) return;
                void sendAdminAction('/api/dev/moderation/wipe-game', { username: self });
              }}
              className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}
            >
              Wipe My Save
            </button>
            <button
              title="Remove your own Infinity Orbs game ban. This is also available from the ban screen."
              disabled={loading}
              onClick={() => {
                const self = contextInfo?.username ?? '';
                if (!self) return;
                void sendAdminAction('/api/dev/moderation/unban', { username: self });
              }}
              className={`${buttonBase} bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300 px-3 py-2`}
            >
              Unban Me
            </button>
          </div>

          {bannedUsers.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/80 divide-y divide-slate-800">
              {bannedUsers.map(user => (
                <div key={user.id ?? user.username} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-200">u/{user.username}</div>
                    <div className="text-[10px] text-slate-500">
                      {user.bannedUntil === null ? 'Permanent' : `Until ${new Date(user.bannedUntil).toLocaleString()}`} · {user.reason}
                    </div>
                  </div>
                  <button
                    title="Remove this listed player's Infinity Orbs game ban."
                    disabled={loading}
                    onClick={() => void sendAdminAction('/api/dev/moderation/unban', { username: user.username })}
                    className={`${buttonBase} bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300 px-3 py-2`}
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-rose-950/20 border border-rose-500/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
            <Trash2 className="w-4 h-4" /> Destructive Testing
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              title="Erase the entire current Infinity Orbs save and restore the normal starting state."
              disabled={loading}
              onClick={() => {
                if (!confirmation('Reset your entire Infinity Orbs save to a fresh state?')) return;
                void sendAdminAction('/api/dev/reset-all');
              }}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <RotateCcw className="inline w-3.5 h-3.5 mr-1" /> Reset My Save
            </button>
            <button title="Reset the current test account to the ordinary new-player starting state." disabled={loading} onClick={() => void sendAdminAction('/api/dev/preset', { preset: 'fresh' })} className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}>
              <Database className="inline w-3.5 h-3.5 mr-1" /> Fresh State
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
