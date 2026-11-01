/**
 * Keep the growing Codex out of player save requests.
 */
export const CODEX_STORAGE_VERSION = 1;
export const CODEX_SHARD_COUNT = 16;
export const CODEX_MIGRATION_BATCH_SIZE = 384;

export function codexShardIndex(rarityKey: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < rarityKey.length; index += 1) {
    hash ^= rarityKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % CODEX_SHARD_COUNT;
}

export function codexShardKey(userId: string, generation: number, shard: number): string {
  const safeGeneration = Math.max(0, Math.floor(Number(generation) || 0));
  const safeShard = Math.max(0, Math.min(CODEX_SHARD_COUNT - 1, Math.floor(Number(shard) || 0)));
  return `player:codex:${userId}:g${safeGeneration}:s${safeShard}`;
}

export interface CodexShardFields {
  shard: number;
  fields: Record<string, string>;
}

export function groupCodexFields(entries: Iterable<readonly [string, number]>): CodexShardFields[] {
  const grouped = Array.from({ length: CODEX_SHARD_COUNT }, () => ({} as Record<string, string>));
  for (const [rarity, count] of entries) grouped[codexShardIndex(rarity)][rarity] = String(count);
  return grouped.flatMap((fields, shard) => Object.keys(fields).length ? [{ shard, fields }] : []);
}
