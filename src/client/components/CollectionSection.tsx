import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Share2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import type { PlayerState } from '../../shared/game.js';
import { CONTINUUM_TIERS, getOrbInfo, coinsForRarity } from '../../shared/game.js';
import { sound } from '../sound.js';

interface CollectionSectionProps {
  state: PlayerState;
  onOpenShareModal: (rarity: number) => void;
}

interface CollectionPageItem {
  rarity: number;
  count: number;
}

interface CollectionPageResponse {
  items: CollectionPageItem[];
  total: number;
  offset: number;
  limit: number;
}

const PAGE_SIZE = 60;

export const CollectionSection: React.FC<CollectionSectionProps> = ({
  state,
  onOpenShareModal,
}) => {
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'rarity_desc' | 'rarity_asc' | 'count'>('rarity_desc');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<CollectionPageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fmt = (n: number) => n.toLocaleString();
  const tiersList = useMemo(
    () => [
      'all',
      'Common',
      'Uncommon',
      'Rare',
      'Epic',
      'Legendary',
      'Mythic',
      'Relic',
      'Divine',
      'Transcendent',
    ],
    [],
  );

  useEffect(() => {
    setPage(0);
  }, [selectedTier, sortBy]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');

    const params = new URLSearchParams({
      offset: String(page * PAGE_SIZE),
      limit: String(PAGE_SIZE),
      tier: selectedTier,
      sort: sortBy,
    });

    fetch(`/api/collection?${params.toString()}`, { signal: controller.signal })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load Codex.');
        return data as CollectionPageResponse;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setItems([]);
        setTotal(0);
        setLoadError(error instanceof Error ? error.message : 'Failed to load Codex.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page, selectedTier, sortBy]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = total === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const pageEnd = Math.min(total, safePage * PAGE_SIZE + items.length);

  const goToPage = (nextPage: number) => {
    setPage(Math.max(0, Math.min(totalPages - 1, nextPage)));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/20 to-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400 block mb-1">
              Continuum Codex
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <span>Orb Collection</span>
              <span className="text-sm font-semibold text-slate-400">
                ({fmt(total)} Unique Orbs Discovered)
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              The Codex loads a small page at a time, so enormous collections do not become a browser benchmark.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl px-4 py-2.5">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Collection Value
              </span>
              <span className="text-lg font-black text-amber-400">{fmt(state.collectionValue)}</span>
            </div>
            <div className="w-[1px] h-8 bg-slate-800" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Highest Orb
              </span>
              <span className="text-lg font-black text-purple-300">
                1 / {fmt(state.highestRarity || 2)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Continuum Tier Milestones
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-1.5 text-center">
            {CONTINUUM_TIERS.map(milestone => {
              const reached = (state.highestRarity || 0) >= milestone.minRarity;
              return (
                <div
                  key={milestone.tier}
                  className={`p-2 rounded-xl border text-xs flex flex-col items-center justify-center transition-all ${
                    reached
                      ? 'bg-slate-900 border-slate-700 shadow-sm'
                      : 'bg-slate-950/40 border-slate-900 opacity-40'
                  }`}
                >
                  <span
                    className="font-extrabold text-[11px]"
                    style={{ color: reached ? milestone.color : '#64748b' }}
                  >
                    {milestone.tier}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                    1/{milestone.minRarity >= 1000000 ? `${milestone.minRarity / 1000000}M` : milestone.minRarity >= 1000 ? `${milestone.minRarity / 1000}k` : milestone.minRarity}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl">
        <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-thin">
          {tiersList.map(t => (
            <button
              key={t}
              onClick={() => setSelectedTier(t)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-all whitespace-nowrap ${
                selectedTier === t
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white bg-slate-950/40'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold">Sort:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'rarity_desc' | 'rarity_asc' | 'count')}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-lg px-2 py-1 font-semibold"
          >
            <option value="rarity_desc">Highest Rarity</option>
            <option value="rarity_asc">Lowest Rarity</option>
            <option value="count">Most Owned</option>
          </select>
        </div>
      </div>

      {loadError ? (
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-10 text-center space-y-2">
          <BookOpen className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="text-sm font-bold text-rose-300">Codex failed to load</p>
          <p className="text-xs text-slate-500">{loadError}</p>
          <button
            onClick={() => {
              setLoadError('');
              setPage(p => p);
            }}
            className="text-xs font-bold text-cyan-300 hover:text-cyan-200"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 text-center">
          <Loader2 className="w-8 h-8 text-purple-400 mx-auto animate-spin" />
          <p className="text-sm font-bold text-slate-300 mt-3">Loading Codex page…</p>
          <p className="text-xs text-slate-500 mt-1">Only {PAGE_SIZE} entries are being prepared.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-400">No Orbs Found in this filter</p>
          <p className="text-xs text-slate-500">Roll more orbs to discover new rarities along the continuum.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Showing {fmt(pageStart)}–{fmt(pageEnd)} of {fmt(total)}</span>
            <span>Page {safePage + 1} / {totalPages}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {items.map(item => {
              const info = getOrbInfo(item.rarity);
              return (
                <div
                  key={item.rarity}
                  className="relative rounded-2xl p-4 border bg-slate-900/90 border-slate-800 hover:border-slate-700 transition-all shadow-md"
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 border border-white/10 shadow-inner relative"
                      style={{ background: info.bgGradient }}
                    >
                      <span className="text-[10px] font-black text-white/90 drop-shadow">
                        1/{item.rarity >= 1_000_000
                          ? `${(item.rarity / 1_000_000).toFixed(1)}M`
                          : item.rarity >= 1_000
                          ? `${(item.rarity / 1_000).toFixed(0)}k`
                          : item.rarity}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border"
                          style={{
                            color: info.color,
                            borderColor: `${info.color}44`,
                            backgroundColor: `${info.color}11`,
                          }}
                        >
                          {info.tier}
                        </span>
                        <span className="text-xs font-bold text-slate-300">×{fmt(item.count)}</span>
                      </div>

                      <h3 className="text-sm font-black text-white truncate mt-1">{info.name}</h3>

                      <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                        <span className="font-mono text-[11px]">1 in {fmt(item.rarity)}</span>
                        <span className="text-amber-400 font-semibold text-[11px]">
                          +{fmt(coinsForRarity(item.rarity))} Coins
                        </span>
                      </div>
                    </div>
                  </div>

                  {item.rarity >= 100 && (
                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex justify-end">
                      <button
                        onClick={() => {
                          sound.playClick();
                          onOpenShareModal(item.rarity);
                        }}
                        className="text-[11px] font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
                      >
                        <Share2 className="w-3 h-3" />
                        <span>Share to Reddit</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                disabled={safePage === 0}
                onClick={() => goToPage(safePage - 1)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-xs font-mono text-slate-500">Page {safePage + 1} / {totalPages}</span>
              <button
                disabled={safePage >= totalPages - 1}
                onClick={() => goToPage(safePage + 1)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
