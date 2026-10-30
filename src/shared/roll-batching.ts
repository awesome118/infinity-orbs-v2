/**
 * Large online/Frenzy batches use weighted representative rolls. Each sample
 * stands in for several effective Orbs, with the matching squared Luck factor.
 */
export const MAX_SIMULATED_ROLLS_PER_BATCH = 50_000;
export const MAX_EFFECTIVE_ROLLS_PER_BATCH = 500_000;

export interface RollBatchPlan {
  effectiveCount: number;
  protectedOpeningCount: number;
  remainingEffectiveCount: number;
  compressionWeight: number;
  simulatedBaseCount: number;
}

export function createRollBatchPlan(
  effectiveCount: number,
  protectedOpeningCount = 0,
  compress = true,
): RollBatchPlan {
  const safeCount = Number.isSafeInteger(effectiveCount) ? Math.max(0, effectiveCount) : 0;
  const opening = Math.min(
    safeCount,
    Number.isSafeInteger(protectedOpeningCount) ? Math.max(0, protectedOpeningCount) : 0,
  );
  const remaining = safeCount - opening;
  const weight = compress && remaining > MAX_SIMULATED_ROLLS_PER_BATCH
    ? Math.ceil(remaining / MAX_SIMULATED_ROLLS_PER_BATCH)
    : 1;
  const sampleCount = remaining > 0 ? Math.ceil(remaining / weight) : 0;

  return {
    effectiveCount: safeCount,
    protectedOpeningCount: opening,
    remainingEffectiveCount: remaining,
    compressionWeight: weight,
    simulatedBaseCount: opening + sampleCount,
  };
}

export function effectiveWeightAtSample(plan: RollBatchPlan, sampleIndex: number): number {
  const index = Math.floor(Number(sampleIndex));
  if (!Number.isFinite(index) || index < 0 || index >= plan.simulatedBaseCount) return 0;
  if (index < plan.protectedOpeningCount) return 1;
  const compressedIndex = index - plan.protectedOpeningCount;
  return Math.max(
    0,
    Math.min(
      plan.compressionWeight,
      plan.remainingEffectiveCount - compressedIndex * plan.compressionWeight,
    ),
  );
}

export function virtualRollOffsetAtSample(plan: RollBatchPlan, sampleIndex: number): number {
  const index = Math.floor(Number(sampleIndex));
  if (!Number.isFinite(index) || index < 0 || index >= plan.simulatedBaseCount) return plan.effectiveCount;
  if (index < plan.protectedOpeningCount) return index;
  return plan.protectedOpeningCount
    + (index - plan.protectedOpeningCount) * plan.compressionWeight;
}

/** Approximate Binomial(n,p) in constant/expected-success time for batched procs. */
export function sampleBinomialCount(n: number, p: number, random: () => number): number {
  const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const probability = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
  if (count === 0 || probability === 0) return 0;
  if (probability >= 1) return count;

  const mean = count * probability;
  const variance = mean * (1 - probability);
  if (variance >= 1) {
    const rawU1 = Number(random());
    const rawU2 = Number(random());
    const u1 = Number.isFinite(rawU1) ? Math.max(1e-12, Math.min(1 - Number.EPSILON, rawU1)) : 0.5;
    const u2 = Number.isFinite(rawU2) ? Math.max(0, Math.min(1, rawU2)) : 0.5;
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.min(count, Math.round(mean + Math.sqrt(variance) * gaussian)));
  }

  // Geometric gaps are efficient for the very low Shard Proc probabilities.
  const logFailure = Math.log1p(-probability);
  let position = 0;
  let successes = 0;
  while (position <= count) {
    const raw = Number(random());
    const sample = Number.isFinite(raw) ? Math.max(1e-12, Math.min(1 - Number.EPSILON, raw)) : 0.5;
    position += Math.floor(Math.log(sample) / logFailure) + 1;
    if (position <= count) successes += 1;
  }
  return successes;
}
