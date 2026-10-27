import React from 'react';
import { X, ShieldCheck, Coins } from 'lucide-react';
import { visibleContinuumTiers } from '../../shared/game.js';
import type { ContinuumTierMilestone } from '../../shared/game.js';

interface RarityTableModalProps {
  onClose: () => void;
  highestRarity: number;
}

export const RarityTableModal: React.FC<RarityTableModalProps> = ({ onClose, highestRarity }) => {
  const visibleTiers = visibleContinuumTiers(highestRarity);
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="io-rarity-title"
        aria-describedby="io-rarity-description"
        className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 max-w-2xl w-full space-y-4 shadow-2xl relative max-h-[85dvh] overflow-hidden flex flex-col"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          aria-label="Close rarity continuum"
          title="Close rarity continuum"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <h3 id="io-rarity-title" className="pr-10 text-base sm:text-lg font-black text-white">Rarity Continuum & Drop Odds</h3>
        </div>

        <div id="io-rarity-description" className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
          <div className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Economy: <strong className="text-amber-300">Coins = Rarity</strong></span>
          </div>
          <p className="text-slate-400">
            Coin rewards scale with rarity using a diminishing-return formula, so higher-rarity orbs are worth more without paying their full rarity number.
          </p>
          <p className="text-slate-400">
            Orbs generate continuously: any number <code className="text-cyan-300">R ≥ 2</code> is obtainable. At 1× Luck, the chance of rolling at least R is <code className="text-cyan-300">1 / R</code>. Luck increases the tail weight with diminishing returns instead of multiplying the rolled rarity directly.
          </p>
          {highestRarity < 9 && (
            <p className="text-amber-300">
              The upper half of the continuum is hidden until you discover a 1/9 orb.
            </p>
          )}
        </div>

        {/* Continuum milestones */}
        <p className="px-1 text-[10px] text-slate-500" role="status">
          {visibleTiers.length} discovered continuum tier{visibleTiers.length === 1 ? '' : 's'} shown.
        </p>
        <div
          role="table"
          aria-label="Rarity continuum thresholds, base odds, and coin yield"
          className="flex-1 min-h-0 overflow-y-auto border border-slate-800 rounded-2xl bg-slate-950/60 divide-y divide-slate-800/60 pr-1"
        >
          <div role="row" className="hidden sm:grid grid-cols-4 gap-3 px-4 py-2.5 bg-slate-900 text-[11px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
            <span role="columnheader">Tier</span>
            <span role="columnheader">Threshold</span>
            <span role="columnheader">Base Odds</span>
            <span role="columnheader" className="text-right">Coins</span>
          </div>

          {visibleTiers.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Discover an Orb to reveal its continuum tier here.</p>
          ) : visibleTiers.map((tier: ContinuumTierMilestone) => (
            <div
              role="row"
              key={tier.tier}
              className="grid grid-cols-2 sm:grid-cols-4 items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-3 text-xs hover:bg-slate-900/40 transition-colors"
            >
              <div role="cell" aria-label={`${tier.tier} tier`} className="flex min-w-0 items-center gap-2">
                <div aria-hidden="true" className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ backgroundColor: tier.color }} />
                <span className="font-bold text-white break-words" style={{ color: tier.color }}>{tier.tier}</span>
              </div>

              <div role="cell" className="min-w-0 break-words font-mono text-slate-300 font-bold">
                <span className="mr-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Threshold</span>
                {tier.label}
              </div>

              <div role="cell" className="min-w-0 break-words text-slate-400 font-medium">
                <span className="mr-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Odds</span>
                {tier.approxChance}
              </div>

              <div role="cell" className="min-w-0 break-words text-left sm:text-right font-mono text-amber-400 font-semibold">
                <span className="mr-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Coins</span>
                {tier.coinsPerOrb}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            Close table
          </button>
        </div>
      </div>
    </div>
  );
};
