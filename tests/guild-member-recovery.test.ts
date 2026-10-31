// [BOSS][TESTER] Regression coverage for recoverable legacy Guild member metadata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Guild parsing repairs only recoverable member metadata before strict validation', () => {
  const social = source('src/server/social.ts');
  const normalizeStart = social.indexOf('function normalizeRecoverableGuildMemberFields(');
  const normalizeEnd = social.indexOf('\nfunction validateGuildNestedState(', normalizeStart);
  assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart,
    'recoverable member normalizer boundary must exist');
  const parseStart = social.indexOf('function parseGuildListRaw(');
  const parseEnd = social.indexOf('\nfunction parseGuildList(', parseStart);
  assert.ok(parseStart >= 0 && parseEnd > parseStart, 'raw Guild parser boundary must exist');
  const parser = social.slice(parseStart, parseEnd);
  const recoveryCall = parser.indexOf('normalizeRecoverableGuildMemberFields(item)');
  const strictValidation = parser.indexOf('validateGuildNestedState(item as Record<string, unknown>)');
  assert.ok(recoveryCall >= 0 && strictValidation > recoveryCall,
    'recoverable member fields must be normalized before nested validation');

  const normalizer = social.slice(normalizeStart, normalizeEnd);
  assert.match(normalizer, /member\.username = trimmed \|\|/);
  assert.match(normalizer, /member\.contribution = capSafeGuildCounter\(member\.contribution\)/);
  assert.match(normalizer, /typeof member\.contribution !== 'number'/);
  assert.match(normalizer, /!Number\.isSafeInteger\(member\.contribution\)/);
  assert.match(normalizer, /member\.contribution < 0/);
  assert.match(normalizer, /member\.trusted = member\.role === 'owner'/);
  assert.match(normalizer, /delete member\.joinedAt/);
  assert.match(normalizer, /delete member\.lastLoginAt/);

  // Identity and role corruption are still rejected by the strict record shape.
  assert.match(parser, /\['owner', 'officer', 'member'\]\.includes\(\(member as any\)\.role\)/);
  assert.match(parser, /\(\(member as any\)\.userId == null \|\| typeof \(member as any\)\.userId === 'string'\)/);
});

test('legacy Guild contribution writer cannot create unsafe member counters', () => {
  const social = source('src/server/social.ts');
  const start = social.indexOf('export async function contribute(');
  const end = social.indexOf('export async function prepareGuildRollEffects(', start);
  assert.ok(start >= 0 && end > start, 'legacy contribution writer boundary must exist');
  const body = social.slice(start, end);
  assert.match(body, /const safeValue = capSafeGuildCounter\(value\)/);
  assert.match(body, /member\.contribution = capSafeGuildCounter\(member\.contribution \+ safeValue\)/);
  assert.doesNotMatch(body, /member\.contribution \+= value/);
  assert.match(body, /guild\.boss\.contributors\[username\(\)\] = capSafeGuildCounter/);
});


test('dev-only Guild recovery persists repaired snapshots without overwriting concurrent changes', () => {
  const social = source('src/server/social.ts');
  const start = social.indexOf('async function loadGuilds(): Promise<Guild[]>');
  const end = social.indexOf('\nexport interface GuildChatSpyGuild', start);
  assert.ok(start >= 0 && end > start, 'Guild loader boundaries must exist');
  const loader = social.slice(start, end);

  assert.match(loader, /parsedSnapshot = parseStoredJson<unknown>\(raw\)/);
  assert.match(loader, /isGuildPlaytestRecoveryEnabled\(\)/);
  assert.match(loader, /Array\.isArray\(parsedSnapshot\)/);
  assert.match(loader, /const txn = await redis\.watch\(GUILDS_KEY\)/);
  assert.match(loader, /if \(latestRaw !== raw\)/);
  assert.match(loader, /await txn\.set\(GUILDS_KEY, recoveredRaw\)/);
  assert.match(loader, /Guild Recovery.*Could not persist the dev-only repaired snapshot/);
  assert.ok(loader.indexOf('isGuildPlaytestRecoveryEnabled()') < loader.indexOf('await txn.set(GUILDS_KEY, recoveredRaw)'),
    'only the development subreddit can persist recovered Guild data');
});
