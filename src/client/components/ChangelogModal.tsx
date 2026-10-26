import React from 'react';
import { BookOpen, X } from 'lucide-react';
import { APP_VERSION } from '../../shared/version.js';

interface ChangelogModalProps {
  onClose: () => void;
}

const sections: Array<{
  title: string;
  entries: Array<{ title: string; description: string }>;
}> = [
  {
    title: 'Major New Features',
    entries: [
      {
        title: 'Combat Mode',
        description: 'Added Combat as a separate game mode, unlocked at Core Level 8, with a guided introduction and its own progression.',
      },
      {
        title: 'Three Expeditions',
        description: 'Added Undercrypt, Cinder Vault, and Glass Labyrinth. Each dungeon tracks its own best depth and has a boss every tenth depth.',
      },
      {
        title: 'Dungeon Runs',
        description: 'Added automatic dungeon runs, selectable combat tactics, manual actions, persistent health between encounters, and new-run resets.',
      },
      {
        title: 'Gear, Forge & Abilities',
        description: 'Added seven gear slots, randomized gear stats and traits, quality rolls, nonlinear gear power, the Forge, Scrap, and 30 Gear Major Abilities.',
      },
      {
        title: 'Combat Skill Gacha',
        description: 'Added 35 active skills. Duplicate skills increase ranks, making repeated pulls useful.',
      },
      {
        title: 'Arena',
        description: 'Added asynchronous player-build battles against recently active players, with rating and win/loss records.',
      },
      {
        title: 'Rune System',
        description: 'Added seven Rune rarities, from Common through Cosmic. Monsters drop Runes; bosses always drop one and elites have improved drop odds.',
      },
      {
        title: 'Rune Loadouts',
        description: 'Rune loadouts improve core-game Orb Luck, Coins, Shard chance, and XP. Unlock more Rune slots through Delver levels and dungeon depth, then strengthen Runes by sacrificing duplicates or enabling Auto Sacrifice.',
      },
    ],
  },
  {
    title: 'Core Game Changes',
    entries: [
      {
        title: 'Push Notification Opt-In',
        description: 'Added a one-time push notification prompt. Notifications stay off unless enabled, and the prompt explains the limited alerts and the bell control for changing the setting later.',
      },
      {
        title: 'First-Roll Tutorial',
        description: 'Added a first-roll tutorial that introduces rolling an Orb, the result screen, Upgrades, and the Codex. It can be skipped at any time.',
      },
      {
        title: 'Aftershock',
        description: 'Added Aftershock, a Mastery skill that provides Critical Luck based on the best dry interval between successive all-time rarity records.',
      },
      {
        title: 'Unbroken Momentum',
        description: 'Added Unbroken Momentum, a Prestige upgrade that grants permanent roll Speed based on the longest uninterrupted online rolling session.',
      },
      {
        title: 'Codex Devotion',
        description: 'Updated Codex Devotion to show its current Luck bonus and the bonus from the next level.',
      },
      {
        title: 'Chain Patcher',
        description: 'Added Chain Patcher to the Codex. It guarantees the cheapest missing rarity adjacent to the longest consecutive Codex chain on the next accepted roll, for a Shard cost and with a 24-hour purchase cooldown.',
      },
      {
        title: 'Shared Orb Frenzies',
        description: 'Shared Orb Frenzies can be claimed by multiple different players during the post’s lifetime. Each player still has their own claim cooldown.',
      },
      {
        title: 'Rune Inventory Improvements',
        description: 'Added Rune inventory search, equipped filters, level and XP progress, capacity warnings, and clearer Strengthen and Auto Sacrifice controls.',
      },
      {
        title: 'Global Chat & Player Sessions',
        description: 'Improved Global Chat status messaging when posting is unavailable and added active-session length to the player list.',
      },
      {
        title: 'Post Previews & Play CTA',
        description: 'Revamped main-game, shared-Orb, and Frenzy previews with animated Orb visuals and a glowing, pulsing Play button that makes starting the game unmistakable.',
      },
      {
        title: 'Frenzy Reward Reveal',
        description: 'Reworked Frenzy rewards into a full animated Orb reveal with orbiting effects, visible personal claim cooldowns, post-expiry timer, and a persistent Play button. Main-game and shared-Orb posts now feature animated Orb energy effects.',
      },
      {
        title: 'Infinity Overflow',
        description: 'Rolls whose calculated rarity exceeds JavaScript’s largest finite number now display as 1/Infinity. The finite 1.797693e308 rarity remains a numeric rarity.',
      },
    ],
  },
  {
    title: 'Balance Changes',
    entries: [
      {
        title: 'Repeatable Upgrade Costs',
        description: 'Unlimited repeatable core-game upgrades cost 15% more; capped Roll Speed and Offline Generation Speed keep their existing cost curves.',
      },
      {
        title: 'Supernova Critical Scaling',
        description: 'Supernova now multiplies the normal critical multiplier instead of replacing it, so it remains powerful as Critical upgrades grow.',
      },
      {
        title: 'Mastery Engine Removed',
        description: 'Mastery Engine has been removed for balancing purposes.',
      },
    ],
  },
  {
    title: 'Bug Fixes & Improvements',
    entries: [
      {
        title: 'Notification Prompt',
        description: 'Fixed the one-time push prompt for returning players and added safe Frenzy and notification popup previews to the admin console.',
      },
      {
        title: 'Silent Alert Mode',
        description: 'Fixed Silent Alert Mode’s toggle becoming out of sync with the active sound mode.',
      },
      {
        title: 'Combat Encounter Effects',
        description: 'Fixed encounter effects carrying into a new run.',
      },
      {
        title: 'Shared Orb Previews',
        description: 'Fixed shared Orb previews rejecting valid large rarity values.',
      },
      {
        title: 'Leaderboard Recovery',
        description: 'Kept older shared-Orb leaderboard entries visible when legacy records are missing account IDs.',
      },
      {
        title: 'Frenzy Claims & Post Performance',
        description: 'Fixed Frenzy claims so the main game consumes the armed handoff and plays the reward-batch reveal; centered orbit rings, smoothed their rotation, reduced shared-Orb glow, and kept skill details open long enough to equip abilities.',
      },
      {
        title: 'Rune Controls',
        description: 'Fixed Rune controls so Equip, Strengthen, and Auto Sacrifice actions no longer conflict when used in quick succession.',
      },
    ],
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

        <div className="mt-5 max-h-[60vh] overflow-y-auto pr-1 space-y-5">
          {sections.map(section => (
            <section key={section.title} className="space-y-2">
              <h3 className="px-1 text-[10px] uppercase tracking-[0.16em] font-black text-purple-300">
                {section.title}
              </h3>
              {section.entries.map(({ title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div className="text-sm font-black text-white">{title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-400">{description}</div>
                </div>
              ))}
            </section>
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
