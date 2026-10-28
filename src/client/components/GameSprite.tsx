import React from 'react';
import spriteAsset from '../assets/infinity-orbs-sprites.svg?url';
import './game-sprites.css';

export type GameSpriteName =
  | 'orb-common' | 'orb-uncommon' | 'orb-rare' | 'orb-epic' | 'orb-legendary' | 'orb-mythic' | 'orb-cosmic' | 'orb-infinity'
  | 'player-idle' | 'enemy-flame' | 'enemy-crystal' | 'enemy-void' | 'boss-flame' | 'boss-crystal' | 'boss-void'
  | 'gear-sword' | 'gear-helmet' | 'gear-armor' | 'gear-boots' | 'rune-diamond'
  | 'skill-slash' | 'skill-starfall' | 'skill-shield' | 'skill-heart' | 'skill-speed' | 'skill-luck'
  | 'portal' | 'chest' | 'shard' | 'coin';

interface GameSpriteProps {
  name: GameSpriteName;
  size?: number;
  className?: string;
  title?: string;
}

export function GameSprite({ name, size = 32, className = '', title }: GameSpriteProps) {
  const description = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const };
  return (
    <svg
      {...description}
      className={('io-game-sprite ' + className).trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <use href={spriteAsset + '#' + name} />
    </svg>
  );
}

const cleanTier = (tier?: string) => String(tier ?? '').toLowerCase().replace(/[^a-z]/g, '');

export function getOrbSpriteName(tier?: string, isInfinity = false): GameSpriteName {
  if (isInfinity || cleanTier(tier).includes('infinity')) return 'orb-infinity';
  const value = cleanTier(tier);
  if (value.includes('cosmic')) return 'orb-cosmic';
  if (value.includes('mythic')) return 'orb-mythic';
  if (value.includes('legend')) return 'orb-legendary';
  if (value.includes('epic')) return 'orb-epic';
  if (value.includes('rare')) return 'orb-rare';
  if (value.includes('uncommon')) return 'orb-uncommon';
  if (value.includes('common')) return 'orb-common';
  return 'orb-rare';
}

export function getEnemySpriteName(kind?: string, name?: string): GameSpriteName {
  const value = (String(kind ?? '') + ' ' + String(name ?? '')).toLowerCase();
  const isBoss = /boss|warden|titan|overlord|colossus|king|queen|guardian/.test(value);
  const isCrystal = /ice|frost|crystal|glacier|frozen|cold/.test(value);
  const isVoid = /void|shadow|cosmic|abyss|singular|eclipse|rift/.test(value);
  if (isBoss) return isCrystal ? 'boss-crystal' : isVoid ? 'boss-void' : 'boss-flame';
  return isCrystal ? 'enemy-crystal' : isVoid ? 'enemy-void' : 'enemy-flame';
}

export function getGearSpriteName(slot: string): GameSpriteName {
  switch (slot.toLowerCase()) {
    case 'helmet': return 'gear-helmet';
    case 'armor': return 'gear-armor';
    case 'boots': return 'gear-boots';
    case 'weapon':
    case 'gloves':
    case 'ring':
    case 'amulet':
    default: return 'gear-sword';
  }
}

export function getCombatActionSpriteName(action: string): GameSpriteName {
  switch (action.toLowerCase()) {
    case 'heavy': return 'skill-starfall';
    case 'guard': return 'skill-shield';
    case 'mend': return 'skill-heart';
    case 'speed': return 'skill-speed';
    case 'luck': return 'skill-luck';
    case 'strike':
    default: return 'skill-slash';
  }
}
