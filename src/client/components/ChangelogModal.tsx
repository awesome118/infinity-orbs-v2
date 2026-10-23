import React from 'react';
import { BookOpen, X } from 'lucide-react';
import { APP_VERSION } from '../../shared/version.js';

interface ChangelogModalProps {
  onClose: () => void;
}

const entries: Array<{
  title: string;
  description: string;
}> = [
  {
    title: 'Infinity Overflow',
    description: 'When a roll’s calculated rarity exceeds the largest finite number JavaScript can represent, it displays as 1/Infinity. The finite 1.797693e308 rarity remains numeric; Infinity is a separate overflow result.',
  },
  {
    title: 'Supernova Critical Scaling',
    description: 'Supernova now multiplies your normal critical rarity by 5×, so it scales with Critical Power instead of replacing it.',
  },
  {
    title: 'Inline Post Scroll Compliance',
    description: 'Inline launch and Orb Frenzy posts now use bounded, non-scrollable preview surfaces that allow vertical feed gestures to pass through to Reddit. The in-post Global Chat scroller and oversized fallback dialog were removed from Frenzy; full chat and long interactions stay in Expanded Mode.',
  },
  {
    title: 'Combat Reliability & Rune Inventory',
    description: 'Combat saves now fail safely instead of silently resetting, empty gear inventories stay empty, and encounter effects clear when a new run begins. Rune inventory adds search, equipped filters, level progress, capacity warnings, safer Strengthen actions, and serialized requests. Upgrade purchases, Global Chat requests, quest progress, and daily-streak previews have additional reliability and accessibility fixes.',
  },
  {
    title: 'Rune Major Abilities & Auto Sacrifice',
    description: 'Rune tooltips now explain fourteen scalable Major Abilities: Fateweaver improves Orb Luck, Midas Engine boosts Coins, Memory Well improves XP, Echo Chamber chains extra rolls, Paradox Engine expands multi-rolls, Event Horizon rewards record rarities, Shard Constellation and Temporal Loop build persistent meters, Prismatic Fork boosts rare outcomes, Critical Convergence reacts to crits, Rarity Ladder rewards rising sequences, Stellar Dividend pays roll milestones, Shard Jackpot boosts Shard payouts, and Milestone Engine rewards new rarity decades. Strengthen a chosen Rune by clicking a donor, or auto-sacrifice eligible drops into a random equipped Rune.',
  },
  {
    title: 'Combat Unlock & Mark Shop',
    description: 'Combat unlocks at Level 8 with a guided introduction. Coins are shown in the core game, while Combat Marks are shown in Combat. Mark Magnet and Warding Doctrine add new permanent upgrades, and Starfall and Mark Harvest expand possible gear Major Abilities.',
  },
  {
    title: 'Shared Orb Frenzies',
    description: 'An Orb Frenzy can now be claimed by multiple different players during its lifetime. Per-player receipts prevent duplicate claims, and the existing individual claim cooldown remains in force.',
  },
  {
    title: 'Combat Reset & Readability',
    description: 'Full player wipes now clear the separate Combat save. Combat echo waves last longer, and item Details tooltips use viewport-aware positioning on narrow screens.',
  },
  {
    title: 'Runes · Combat Loot for the Main Game',
    description: 'Monsters can now drop seven Rune rarities. Equip Runes in the new Runes menu to improve Orb Luck, Coins, Shard chance, or XP in the core game. Bosses always drop a Rune; elites have better odds. Earn more Rune slots through Delver levels and depth, then sacrifice spare Runes into the ones you want to strengthen.',
  },
  {
    title: 'First Steps Tutorial',
    description: 'New players are guided through their first orb roll, the result, Upgrades, and the Codex. The tutorial respects feature unlock levels and can be skipped at any time.',
  },
  {
    title: 'New Skills · Aftershock & Unbroken Momentum',
    description: 'Aftershock is now a Mastery skill that activates Critical Luck from your best dry interval between successive all-time rarity records. Unbroken Momentum is now a Prestige upgrade that unlocks logarithmic session-based Speed: +20% at 48 hours, about +25% at 72 hours, capped at +30%. Their live bonuses are shown in their purchase menus.',
  },
  {
    title: 'Codex Devotion',
    description: 'The Mastery upgrade now displays both its current Luck bonus and the bonus after the next level, calculated from your longest consecutive Codex rarity chain.',
  },
  {
    title: 'Balancing',
    description: 'Mastery Engine has been removed for balancing purposes.',
  },
  {
    title: 'Chain Patcher',
    description: 'Chain Patcher is now located in the Codex. Its pre-purchase preview correctly shows the next rarity and Shard cost using your full server-side Codex. It targets the cheapest missing rarity adjacent to your longest consecutive chain, guarantees exactly one orb of that rarity on your next accepted roll, and has a 24-hour purchase cooldown.',
  },
  {
    title: 'Bug Fixes & Improvements',
    description: 'Global Chat remains visible when posting is unavailable and explains why. The player list includes each active player’s current session length. Session-based bonuses now activate only after purchase, and the release includes regression fixes for Codex placement, chat availability, and logarithmic Momentum scaling.',
  },
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[80] io-modal-backdrop flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="io-changelog-title"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="io-modal-card w-full max-w-lg bg-slate-950/95 border border-purple-500/30 shadow-2xl shadow-purple-950/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-black text-purple-300">
              <BookOpen className="w-4 h-4" />
              Changelog
            </div>
            <h2 id="io-changelog-title" className="mt-1 text-2xl font-black text-white">
              Update {APP_VERSION}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close Changelog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 max-h-[60vh] overflow-y-auto pr-1 space-y-2">
          {entries.map(({ title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
            >
              <div className="text-sm font-black text-white">{title}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">{description}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-black text-slate-200 transition-colors"
        >
          Close
        </button>
      </section>
    </div>
  );
};
