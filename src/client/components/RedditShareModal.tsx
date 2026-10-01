import React, { useState } from 'react';
import { X, ArrowBigUp, Share2, CheckCircle2, MessageSquare } from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
import { getOrbInfo } from '../../shared/game.js';
import { sound } from '../sound.js';

interface RedditShareModalProps {
  rarity: number;
  state: PlayerState;
  onClose: () => void;
  onShare: (rarity: number) => Promise<{ success: boolean; id?: string }>;
}

export const RedditShareModal: React.FC<RedditShareModalProps> = ({
  rarity,
  state,
  onClose,
  onShare,
}) => {
  const [busy, setBusy] = useState(false);
  const [successPostId, setSuccessPostId] = useState<string | null>(null);

  const info = getOrbInfo(rarity);
  const fmt = (n: number) => n.toLocaleString();

  const handleShare = async () => {
    setBusy(true);
    sound.playClick();
    try {
      const res = await onShare(rarity);
      if (res.success) {
        sound.playEpicFanfare();
        setSuccessPostId(res.id ?? 'post-shared');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-orange-500" />
          <h3 className="text-lg font-black text-white">Share to Reddit</h3>
        </div>

        <p className="text-xs text-slate-400">
          Show off your luck to the subreddit! Your rare Orb discovery will be formatted into an interactive community post.
        </p>

        {/* Mock Reddit Post Preview (GDD Section 18) */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          {/* Post Header */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="font-bold text-white">r/InfinityOrbs</span>
              <span>• Posted by u/you</span>
              <span>• Just now</span>
            </div>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase"
              style={{
                color: info.color,
                backgroundColor: `${info.color}22`,
                borderColor: `${info.color}44`,
              }}
            >
              {info.tier} Drop
            </span>
          </div>

          {/* Post Title */}
          <h4 className="text-sm font-bold text-white">
            I just found a 1/{fmt(rarity)} Orb ({info.name}) in ORBS — The Infinite Roll!
          </h4>

          {/* Post Body Preview */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-[10px] text-white shrink-0"
                style={{ background: info.bgGradient }}
              >
                1/{rarity >= 1000 ? `${(rarity / 1000).toFixed(0)}k` : rarity}
              </div>
              <div>
                <span className="font-bold text-white block">{info.name}</span>
                <span className="text-slate-400">Theoretical Odds: 1 in {fmt(rarity)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div>Roll #{fmt(state.totalRolls)}</div>
              <div>Collection Value: {fmt(state.collectionValue)}</div>
            </div>
          </div>

          {/* Reddit Action Bar Simulation */}
          <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
            <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg">
              <ArrowBigUp className="w-4 h-4 text-orange-500" />
              <span className="font-bold text-orange-400">Vote</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Comments</span>
            </div>
          </div>
        </div>

        {/* Status or Submit Button */}
        {successPostId ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-emerald-300">Shared to Subreddit!</h4>
            <p className="text-xs text-slate-400">
              Your post is live for other players to upvote and admire.
            </p>
            <button
              onClick={onClose}
              className="mt-3 px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
            >
              <Share2 className="w-4 h-4" />
              <span>{busy ? 'Posting to Reddit...' : 'Confirm & Post'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
