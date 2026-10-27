import React from 'react';
import type { Orb } from '../../shared/game.js';
import { getOrbInfo } from '../../shared/game.js';

interface Props {
  orbs: Orb[];
  radius?: number;
}

export function OrbOrbit({ orbs, radius = 152 }: Props) {
  if (orbs.length <= 1) return null;

  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className="absolute rounded-full border border-dashed border-slate-700/50"
        style={{ width: radius * 2, height: radius * 2 }}
      />
      <div className="relative w-0 h-0 animate-orbit-ring">
        {orbs.slice(0, 8).map((orb, index) => {
          const angle = (index / Math.min(orbs.length, 8)) * Math.PI * 2 - Math.PI / 2;
          const info = getOrbInfo(orb.rarity, orb.isInfinity);
          return (
            <div
              key={index}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: Math.cos(angle) * radius,
                top: Math.sin(angle) * radius,
              }}
            >
              <div
                className="animate-orbit-counter w-8 h-8 rounded-full border border-white/20 shadow-md flex items-center justify-center"
                style={{ background: info.bgGradient }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
