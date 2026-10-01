import React from 'react';
import { X, ShieldCheck, Coins } from 'lucide-react';
import { CONTINUUM_TIERS, type ContinuumTierMilestone } from '../../shared/game.js';

interface RarityTableModalProps {
  onClose: () => void;
}

export const RarityTableModal: React.FC<RarityTableModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl relative max-h-[85vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-black text-white">Rarity Continuum & Drop Odds</h3>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
          <div className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Economy: <strong className="text-amber-300">Coins = Rarity</strong></span>
          </div>
          <p className="text-slate-400">
            Every roll yields coins equal to the rarity rolled (e.g. 1/2 = 2 coins, 1/10 = 10 coins, 1/1,000 = 1,000 coins).
          </p>
          <p className="text-slate-400">
            Orbs generate continuously: any number <code className="text-cyan-300">R ≥ 2</code> is obtainable. Chance of rolling at least R is <code className="text-cyan-300">(2 × Luck) / R</code>.
          </p>
        </div>

        {/* Continuum Milestones Table */}
        <div className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl bg-slate-950/60 divide-y divide-slate-800/60 pr-1">
          <div className="grid grid-cols-4 px-4 py-2.5 bg-slate-900 text-[11px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
            <span>Tier</span>
            <span>Threshold</span>
            <span>Base Odds</span>
            <span className="text-right">Coins Yield</span>
          </div>

          {CONTINUUM_TIERS.map((tier: ContinuumTierMilestone) => (
            <div
              key={tier.tier}
              className="grid grid-cols-4 items-center px-4 py-2.5 text-xs hover:bg-slate-900/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: tier.color }}
                />
                <span className="font-bold text-white" style={{ color: tier.color }}>
                  {tier.tier}
                </span>
              </div>

              <div className="font-mono text-slate-300 font-bold">
                {tier.label}
              </div>

              <div className="text-slate-400 font-medium">
                {tier.approxChance}
              </div>

              <div className="text-right font-mono text-amber-400 font-semibold">
                {tier.coinsPerOrb}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            Close Table
          </button>
        </div>
      </div>
    </div>
  );
};
