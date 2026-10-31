import React from 'react';
import type { Orb } from '../../shared/game.js';
import { getOrbInfo } from '../../shared/game.js';

interface Props {
  orbs: Orb[];
  radius?: number;
}

function orbBand(orb: Orb): 'standard' | 'epic' | 'mythic' | 'endgame' | 'infinity' {
  if (orb.isInfinity) return 'infinity';
  if (orb.rarity >= 1e15) return 'endgame';
  if (orb.rarity >= 100_000) return 'mythic';
  if (orb.rarity >= 1_000) return 'epic';
  return 'standard';
}

export function OrbOrbit({ orbs, radius = 152 }: Props) {
  if (orbs.length <= 1) return null;

  const visibleOrbs = orbs.slice(0, 8);
  const orbitCount = visibleOrbs.length;

  return (
    <div aria-hidden="true" className="io-orbit-system absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className="io-orbit-track absolute rounded-full"
        style={{ width: radius * 2, height: radius * 2 }}
      />
      <div className="io-orbit-rotator relative w-0 h-0">
        {visibleOrbs.map((orb, index) => {
          const angle = (index / orbitCount) * Math.PI * 2 - Math.PI / 2;
          const info = getOrbInfo(orb.rarity, orb.isInfinity);
          const band = orbBand(orb);
          return (
            <div
              key={`${orb.isInfinity ? 'infinity' : orb.rarity}:${index}`}
              className="io-orbit-position absolute"
              style={{
                left: Math.cos(angle) * radius,
                top: Math.sin(angle) * radius,
              }}
            >
              <div
                className="io-orbit-satellite-counter"
                data-orb-tier={info.tier.toLowerCase()}
                data-orb-band={band}
                style={{ '--io-orbit-accent': info.color } as React.CSSProperties}
              >
                <span
                  className="io-orbit-satellite"
                  style={{ background: info.bgGradient } as React.CSSProperties}
                >
                  <span className="io-orbit-satellite-core" />
                  <span className="io-orbit-satellite-glint" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
