import { redis } from './devvit-mock.js';
import type { PlayerState } from '../shared/game.js';

const PLAYER_COLLECTION_PAGE_PREFIX = 'io:player-collection:v1:';
const PLAYER_COLLECTION_PAGE_CHARS = 18_000;
const PLAYER_COLLECTION_MAX_PAGES = 256;

function serializeCollectionPages(collection: Record<string, number>): string[] {
  const pages: string[] = [];
  let entries: string[] = [];
  let pageChars = 2;
  for (const [rarity, count] of Object.entries(collection ?? {})) {
    const entry = JSON.stringify(rarity) + ':' + String(count);
    const entryChars = entry.length + (entries.length > 0 ? 1 : 0);
    if (entries.length > 0 && pageChars + entryChars > PLAYER_COLLECTION_PAGE_CHARS) {
      pages.push('{' + entries.join(',') + '}');
      entries = [];
      pageChars = 2;
    }
    entries.push(entry);
    pageChars += entryChars;
  }
  if (entries.length > 0) pages.push('{' + entries.join(',') + '}');
  if (pages.length > PLAYER_COLLECTION_MAX_PAGES) {
    throw new Error('Your Codex is too large to save safely. No player changes were written.');
  }
  return pages;
}

async function collectionPageId(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function collectionPageKey(userId: string, generation: number, pageId: string): string {
  return PLAYER_COLLECTION_PAGE_PREFIX + encodeURIComponent(userId) + ':' + generation + ':' + pageId;
}

/**
 * Compress a player snapshot before a direct Redis SET that cannot call game.save().
 * Existing immutable Codex manifests are retained; legacy inline Codices are
 * migrated to small content-addressed pages before the main player key is written.
 */
export async function preparePlayerStateForRedisWrite(
  state: PlayerState,
  userId: string,
  generation: number,
): Promise<Record<string, unknown>> {
  const metadata = state as PlayerState & {
    collectionStorageVersion?: unknown;
    collectionPageIds?: unknown;
  };
  const collection = state.collection && typeof state.collection === 'object' && !Array.isArray(state.collection)
    ? state.collection
    : {};

  if (metadata.collectionStorageVersion === 1) {
    if (
      !Array.isArray(metadata.collectionPageIds) ||
      metadata.collectionPageIds.length > PLAYER_COLLECTION_MAX_PAGES ||
      !metadata.collectionPageIds.every(id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id))
    ) {
      throw new Error('Your Codex page index is invalid. No player changes were written.');
    }
    if (Object.keys(collection).length === 0) {
      return {
        ...state,
        collection: {},
        collectionStorageVersion: 1,
        collectionPageIds: metadata.collectionPageIds,
      };
    }
  }

  const pages = serializeCollectionPages(collection);
  const pageIds = await Promise.all(pages.map(collectionPageId));
  const writes = pages.map((value, index) => ({
    key: collectionPageKey(userId, generation, pageIds[index]),
    value,
  }));
  for (let index = 0; index < writes.length; index += 4) {
    await Promise.all(writes.slice(index, index + 4).map(page => redis.set(page.key, page.value)));
  }

  const { collection: _collection, ...withoutCollection } = state;
  return {
    ...withoutCollection,
    collection: {},
    collectionStorageVersion: 1,
    collectionPageIds: pageIds,
  };
}
