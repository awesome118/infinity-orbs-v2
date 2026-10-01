import React, { useState } from 'react';
import { X, Wrench, Coins, Gem, Sparkles, Zap, RotateCcw, Play } from 'lucide-react';
import type { PlayerState, RollResponse } from '../../shared/game.js';
import { sound } from '../sound.js';

interface DevDebugModalProps {
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onForceRollResult?: (res: RollResponse) => void;
}

export const DevDebugModal: React.FC<DevDebugModalProps> = ({
  onClose,
  onRefresh,
  onForceRollResult,
}) => {
  const [customRarity, setCustomRarity] = useState<string>('100000');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');

  const sendDebugAction = async (endpoint: string, body: any = {}) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Debug request failed');
      sound.playClick();
      setMessage('Success!');
      await onRefresh();
      return data;
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForceRoll = async (rarityNum: number) => {
    const data = await sendDebugAction('/api/dev/force-roll', { rarity: rarityNum });
    if (data && onForceRollResult) {
      onForceRollResult(data as RollResponse);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl p-6 max-w-xl w-full space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Developer Debug Menu</h3>
              <p className="text-xs text-slate-400">Easy to remove modular debug tools</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {message && (
          <div className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400">
            {message}
          </div>
        )}

        {/* 1. Force Exact Rarity Roll */}
        <div className="space-y-2.5 bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-cyan-400" />
              Force Roll Exact Rarity
            </span>
            <span className="text-[10px] text-slate-500">Continuum & Animation Testing</span>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              value={customRarity}
              onChange={e => setCustomRarity(e.target.value)}
              placeholder="e.g. 50000"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
            <button
              onClick={() => handleForceRoll(Number(customRarity))}
              disabled={loading}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md active:scale-95"
            >
              Roll Exact Rarity
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {[100, 1000, 10000, 100000, 1000000, 10000000, 100000000].map(val => (
              <button
                key={val}
                onClick={() => handleForceRoll(val)}
                disabled={loading}
                className="text-[10px] font-mono font-semibold px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
              >
                1/{val.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Currencies */}
        <div className="space-y-2.5 bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-bold text-white uppercase tracking-wider block">
            Add Currencies
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => sendDebugAction('/api/dev/currency', { coins: 10000 })}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>+10K Coins</span>
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/currency', { coins: 1000000 })}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>+1M Coins</span>
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/currency', { coins: 100000000 })}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>+100M Coins</span>
            </button>

            <button
              onClick={() => sendDebugAction('/api/dev/currency', { shards: 25 })}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold"
            >
              <Gem className="w-3.5 h-3.5" />
              <span>+25 Shards</span>
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/currency', { shards: 500 })}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold"
            >
              <Gem className="w-3.5 h-3.5" />
              <span>+500 Shards</span>
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/currency', { dust: 50 })}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 text-xs font-bold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+50 Dust</span>
            </button>
          </div>
        </div>

        {/* 3. Cooldown & Upgrades */}
        <div className="space-y-2.5 bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-bold text-white uppercase tracking-wider block">
            Cooldown & Upgrades
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => sendDebugAction('/api/dev/reset-cooldown')}
              disabled={loading}
              className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Reset Cooldown</span>
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/unlock-upgrades')}
              disabled={loading}
              className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Unlock Upgrades</span>
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/add-offline')}
              disabled={loading}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <span>+50 Offline Rolls</span>
            </button>
          </div>
        </div>

        {/* 4. Community World Event Debug */}
        <div className="space-y-3 bg-slate-950/70 border border-purple-500/40 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Community Event Control
            </span>
            <span className="text-[10px] text-slate-500">Live Dynamic Goal Testing</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Set Event Goal
              </label>
              <div className="flex gap-1">
                {[1000, 10000, 100000, 1000000].map(g => (
                  <button
                    key={g}
                    onClick={() => sendDebugAction('/api/dev/event', { goal: g })}
                    disabled={loading}
                    className="flex-1 py-1 text-[10px] font-mono font-semibold rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                  >
                    {g >= 1000000 ? `${g / 1000000}M` : `${g / 1000}K`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Set Progress
              </label>
              <div className="flex gap-1">
                {[0, 500, 5000, 50000].map(p => (
                  <button
                    key={p}
                    onClick={() => sendDebugAction('/api/dev/event', { progress: p })}
                    disabled={loading}
                    className="flex-1 py-1 text-[10px] font-mono font-semibold rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                  >
                    {p >= 1000 ? `${p / 1000}K` : p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              onClick={() => sendDebugAction('/api/dev/event', { addRolls: 500 })}
              disabled={loading}
              className="py-1.5 px-2.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold"
            >
              +500 Event Rolls
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/event', { addRolls: 5000 })}
              disabled={loading}
              className="py-1.5 px-2.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold"
            >
              +5,000 Event Rolls
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/event', { addRolls: 50000 })}
              disabled={loading}
              className="py-1.5 px-2.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold"
            >
              +50,000 Event Rolls
            </button>
            <button
              onClick={() => sendDebugAction('/api/dev/event', { reset: true })}
              disabled={loading}
              className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
            >
              Reset Event
            </button>
          </div>
        </div>

        {/* 5. Danger Zone */}
        <div className="space-y-2 bg-rose-950/20 border border-rose-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
              Danger Zone
            </span>
            <button
              onClick={() => {
                void sendDebugAction('/api/dev/reset-all');
              }}
              disabled={loading}
              className="py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Data to 0</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
