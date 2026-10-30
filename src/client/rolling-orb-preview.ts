/**
 * Cosmetic rarity samples used only while the server is resolving a roll.
 * They are deliberately deterministic and never feed the roll request,
 * ticket, rewards, collection, or any authoritative game state.
 */
export const ROLLING_ORB_RARITIES = Object.freeze([
  2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377,
  610, 987, 1_597, 2_584, 4_181, 6_765, 10_946, 17_711,
  28_657, 46_368, 75_025, 121_393, 196_418, 317_811,
  514_229, 832_040, 1_346_269, 2_178_309, 3_524_578,
  5_702_887, 9_227_465, 14_930_352, 24_157_817, 39_088_169,
] as const);

/** Return a stable, cosmetic rarity sample for a rolling animation frame. */
export function rollingOrbRarityAt(frame: number, offset = 0): number {
  const safeFrame = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
  const safeOffset = Number.isFinite(offset) ? Math.floor(offset) : 0;
  const index = ((safeFrame + safeOffset) % ROLLING_ORB_RARITIES.length
    + ROLLING_ORB_RARITIES.length) % ROLLING_ORB_RARITIES.length;
  return ROLLING_ORB_RARITIES[index];
}

/** Build a small deterministic set of visual satellites without using gameplay RNG. */
export function rollingOrbRaritiesAt(frame: number, count = 6): number[] {
  const safeCount = Number.isFinite(count)
    ? Math.min(8, Math.max(0, Math.floor(count)))
    : 6;
  return Array.from({ length: safeCount }, (_, index) =>
    rollingOrbRarityAt(frame, index * 5),
  );
}
