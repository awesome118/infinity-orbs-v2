import React from 'react';
import { BookOpen, Flame, Sparkles, Users, Target, Gem, X } from 'lucide-react';
import { APP_VERSION } from '../../shared/version.js';

interface ChangelogModalProps {
  onClose: () => void;
}

const entries = [
  {
    icon: Sparkles,
    title: 'Colored rarity flairs',
    description: 'Your highest rarity flair now uses the color of its rarity tier, with readable text automatically chosen for the background.',
  },
  {
    icon: Flame,
    title: 'Frenzy flair',
    description: 'Orb Frenzy posts are now tagged with the frenzy flair so they are easy to find.',
  },
  {
    icon: BookOpen,
    title: 'Discovery flair',
    description: 'Shared Orb posts are now tagged with the discovery flair.',
  },
  {
    icon: Users,
    title: 'Guild Combo improvements',
    description: 'The remaining Guild Combo time is more prominent, and task tiers reset when the combo expires.',
  },
  {
    icon: Target,
    title: 'Codex Devotion fix',
    description: 'Codex Devotion now correctly displays and uses your best consecutive rarity chain.',
  },
  {
    icon: Gem,
    title: 'Altar pity cleanup',
    description: 'Altar pity is capped at one layer instead of stacking indefinitely.',
  },
] as const;

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
            <p className="mt-1 text-xs text-slate-500">
              New features and player-facing changes.
            </p>
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
          {entries.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-purple-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-white">{title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-400">{description}</div>
                </div>
              </div>
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
