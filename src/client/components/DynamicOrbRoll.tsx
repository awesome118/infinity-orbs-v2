import React, { useEffect, useState } from 'react';
import type { Orb } from '../../shared/game.js';
import { formatRarity, getOrbInfo } from '../../shared/game.js';
import { rollingOrbRaritiesAt, rollingOrbRarityAt } from '../rolling-orb-preview.js';
import { OrbOrbit } from './OrbOrbit.js';

interface Props {
  busy: boolean;
  reducedMotion: boolean;
  frenzyRevealActive?: boolean;
  orb: Orb | null;
  batch: Orb[];
  radius: number;
  primaryActionLabel: string;
  cosmeticEffectClass: string;
  isRevealing: boolean;
  personalBestRarity: number;
  personalBestIsInfinity?: boolean;
  onClick: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
}

/**
 * Visual-only roll reel. Its deterministic samples are discarded when the
 * request ends; only the Orb supplied by the authoritative server is revealed.
 */
export const DynamicOrbRoll: React.FC<Props> = ({
  busy,
  reducedMotion,
  frenzyRevealActive = false,
  orb,
  batch,
  radius,
  primaryActionLabel,
  cosmeticEffectClass,
  isRevealing,
  personalBestRarity,
  personalBestIsInfinity = false,
  onClick,
  onKeyDown,
  children,
}) => {
  const [frame, setFrame] = useState(0);
  const isSpinning = busy && !frenzyRevealActive;

  useEffect(() => {
    if (!isSpinning || reducedMotion) {
      setFrame(0);
      return;
    }

    let currentFrame = 0;
    let timer: number | null = null;
    const startedAt = Date.now();

    const advanceReel = () => {
      currentFrame += 1;
      setFrame(currentFrame);

      // Start briskly, then ease the visual reel down while the server resolves.
      // This is presentation-only and never delays or changes the actual roll.
      const elapsed = Date.now() - startedAt;
      const nextDelay = elapsed < 450 ? 54 : elapsed < 1_100 ? 76 : 104;
      timer = window.setTimeout(advanceReel, nextDelay);
    };

    timer = window.setTimeout(advanceReel, 40);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isSpinning, reducedMotion]);

  const previewRarity = rollingOrbRarityAt(frame);
  const previewInfo = isSpinning ? getOrbInfo(previewRarity) : null;
  const stageInfo = isSpinning
    ? previewInfo
    : orb
      ? getOrbInfo(orb.rarity, orb.isInfinity)
      : null;

  const previewOrbit = isSpinning
    ? rollingOrbRaritiesAt(frame).map(rarity => {
        const info = getOrbInfo(rarity);
        return { rarity, rolledAt: 0, tier: info.tier, name: info.name };
      })
    : batch;

  return (
    <>
      {(isSpinning || batch.length > 1) && (
        <OrbOrbit orbs={previewOrbit} radius={radius} rolling={isSpinning} />
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label={primaryActionLabel.toLowerCase()}
        aria-busy={busy}
        aria-disabled={busy}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={`io-main-orb relative z-10 w-44 h-44 sm:w-48 sm:h-48 rounded-full flex flex-col items-center justify-center transition-all duration-500 transform cursor-pointer active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 ${cosmeticEffectClass} ${isSpinning ? 'is-dynamic-rolling' : isRevealing ? 'scale-105 ring-4 ring-white/60' : 'hover:scale-102'}`}
        style={{
          background: stageInfo
            ? stageInfo.bgGradient
            : 'radial-gradient(circle at 35% 30%, #6366f1, #312e81 65%, #0f172a)',
          borderColor: isSpinning && stageInfo ? stageInfo.color : undefined,
        }}
      >
        {!isSpinning && children}

        {/* Subtle Inner Glass Ring */}
        <div className="absolute inset-2 rounded-full border border-white/20 pointer-events-none" />

        {/* Preview values are explicitly labelled as rolling and are never persisted. */}
        <div className="relative z-10 text-center px-4" aria-live="off">
          <span
            className="text-[11px] font-black uppercase tracking-widest block mb-1 drop-shadow"
            style={{ color: stageInfo ? stageInfo.color : '#cbd5e1' }}
          >
            {isSpinning ? 'ROLLING' : stageInfo ? stageInfo.tier : 'READY'}
          </span>

          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-md font-mono">
            {isSpinning
              ? `1 / ${formatRarity(previewRarity)}`
              : orb
                ? `1 / ${formatRarity(orb.rarity, orb.isInfinity)}`
                : '—'}
          </div>

          <div className="text-xs font-semibold text-white/90 mt-1 drop-shadow">
            {isSpinning ? stageInfo?.name ?? 'Resonating…' : stageInfo ? stageInfo.name : 'Tap to Roll'}
          </div>
          <div
            className="mt-2 text-[10px] text-slate-300/80"
            aria-label={`Personal best rarity 1 in ${formatRarity(personalBestRarity, personalBestIsInfinity)}`}
          >
            {isSpinning ? 'Resolving your roll…' : `Personal best · 1 / ${formatRarity(personalBestRarity, personalBestIsInfinity)}`}
          </div>
        </div>

        {/* Only server-confirmed Orb metadata can produce result badges. */}
        {!isSpinning && orb?.isCrit && (
          <div className="absolute -top-6 bg-gradient-to-r from-rose-500 to-amber-500 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-lg border border-amber-300">
            ⚡ 2× CRITICAL ROLL
          </div>
        )}
        {!isSpinning && orb?.isNew && (
          <div className="absolute -top-2 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-lg">
            ★ NEW ORB
          </div>
        )}
      </div>
    </>
  );
};
