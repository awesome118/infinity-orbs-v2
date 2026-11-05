import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GUILD_NAME_FIRST_WORDS,
  GUILD_NAME_SECOND_WORDS,
  GUILD_NAME_NOUNS,
  composeGuildName,
  isApprovedGuildName,
  guildTagForName,
} from '../src/shared/social.js';

test('curated guild fallback names always contain three approved parts', () => {
  const name = composeGuildName('Ashen', 'Astral', 'Alliance');
  assert.equal(name, 'Ashen Astral Alliance');
  assert.equal(isApprovedGuildName(name), true);
  assert.equal(isApprovedGuildName('Ashen Astral My Own Name'), false);
  assert.equal(composeGuildName('Unlisted', 'Astral', 'Alliance'), '');
});

test('every curated guild combination produces a unique three-letter tag', () => {
  const tags = new Set<string>();
  for (const first of GUILD_NAME_FIRST_WORDS) {
    for (const second of GUILD_NAME_SECOND_WORDS) {
      for (const noun of GUILD_NAME_NOUNS) {
        const name = composeGuildName(first, second, noun);
        const tag = guildTagForName(name);
        assert.equal(isApprovedGuildName(name), true);
        assert.match(tag, /^[A-Z]{3}$/);
        assert.equal(tags.has(tag), false, 'duplicate tag for ' + name);
        tags.add(tag);
      }
    }
  }
  assert.equal(tags.size, GUILD_NAME_FIRST_WORDS.length * GUILD_NAME_SECOND_WORDS.length * GUILD_NAME_NOUNS.length);
});

test('guild names with unapproved parts cannot generate public fallback tags', () => {
  assert.equal(isApprovedGuildName('Player Chosen Words'), false);
  assert.equal(guildTagForName('Player Chosen Words'), '');
});

test('guild custom names are only exposed through an admin-only approval queue', () => {
  const social = readFileSync(resolve(process.cwd(), 'src/server/social.ts'), 'utf8');
  const guildInfo = social.slice(social.indexOf('export async function guildInfo'), social.indexOf('export async function getPlayerGuildContext'));
  const createGuild = social.slice(social.indexOf('export async function createGuild'), social.indexOf('export async function getGuildNameRequests'));
  const review = social.slice(social.indexOf('export async function reviewGuildNameRequest'), social.indexOf('export async function joinGuild'));

  assert.match(social, /async function applyGuildNameReviewMigration/);
  assert.match(social, /await applyGuildNameReviewMigration\(\)/);
  assert.match(social, /function requireGuildNameAdmin\(\)[\s\S]*?isAdminUsername\(context\.username\)/);
  assert.match(createGuild, /name: cleanFallbackName/);
  assert.match(createGuild, /nameStatus: cleanRequestedName \? 'pending' : 'approved'/);
  const publicGuildRecord = createGuild.match(/const guild: Guild = \{([\s\S]*?)\n    \};/);
  assert.equal(publicGuildRecord?.[1]?.includes('requestedName'), false);
  assert.match(guildInfo, /\.map\(guild => \(\{/);
  assert.doesNotMatch(guildInfo, /requestedName/);
  assert.match(review, /guild\.name = request\.requestedName/);
  assert.match(review, /guild\.nameStatus = 'approved'/);
  const migration = social.slice(social.indexOf('async function applyGuildNameReviewMigration'), social.indexOf('type StoredGuildNameRequest'));
  assert.match(migration, /const hasRecordedDecision = guild\.nameStatus === 'approved'/);
  assert.match(migration, /if \(guild\.nameStatus === 'approved'\)/);
  assert.doesNotMatch(migration, /if \(isApprovedGuildName\(originalName\)\) \{/);
  assert.match(migration, /activeRequests = requests\.filter\(request => pendingGuildIds\.has\(request\.guildId\)\)/);
  assert.match(migration, /for \(const request of requests\) usedNames\.add\(request\.requestedName\.toLowerCase\(\)\)/);
  assert.match(migration, /const oldName = String\(guild\.name \?\? ''\)[\\s\\S]*?slice\(0, 32\)/);
  const leave = social.slice(social.indexOf('export async function leaveGuild'), social.indexOf('export async function contribute'));
  assert.match(leave, /filter\(request => request\.guildId !== guild\.id\)/);
  assert.match(createGuild, /filter\(request => request\.guildId !== deletedGuildId\)/);
  assert.match(createGuild, /pendingRequests\.some\(request => request\.requestedName\.toLowerCase\(\) === cleanFallbackName\.toLowerCase\(\)\)/);
  assert.match(review, /filter\(item => item\.guildId !== guild\.id\)/);
  const queueReader = social.slice(social.indexOf('export async function getGuildNameRequests'), social.indexOf('export async function reviewGuildNameRequest'));
  assert.ok(queueReader.indexOf('await loadGuilds()') < queueReader.indexOf('await readGuildNameRequests()'));
  assert.doesNotMatch(queueReader, /Promise\.all/);
});
