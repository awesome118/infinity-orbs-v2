import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Guild polling runs concurrently with the world-event request', () => {
  const main = source('src/client/main.tsx');
  const start = main.indexOf('const refreshCommunityState = async () =>');
  const end = main.indexOf('\n    const onVisibilityChange', start);
  assert.ok(start >= 0 && end > start, 'community polling effect must exist');
  const poll = main.slice(start, end);
  assert.match(poll, /getJson<WorldEvent \| null>\('\/api\/world-event'\)\.catch\(\(\) => null\)/);
  assert.match(poll, /getJson<\{ guilds: Guild\[\]; mine: Guild \| null \}>\('\/api\/guilds', \{ cache: 'no-store' \}\)/);
  assert.match(poll, /const \[we, gd\] = await Promise\.all\(\[worldEventRequest, guildRequest\]\)/);
  assert.match(poll, /Guild data could not be loaded/);
  assert.doesNotMatch(poll, /const we = await getJson<WorldEvent/);
});

test('Failed Guild requests preserve the last successful snapshot and expose retry', () => {
  const main = source('src/client/main.tsx');
  const guildUi = source('src/client/components/GuildsAndSocial.tsx');
  assert.doesNotMatch(main, /catch\(\(\) => \(\{ guilds: \[\], mine: null \}\)\)/);
  assert.match(main, /if \(gd\.data\) \{\s*setGuildData\(gd\.data\)/);
  assert.match(main, /setGuildLoadError\(gd\.error\)/);
  assert.match(guildUi, /Guild data could not be loaded/);
  assert.match(guildUi, /Retry loading/);
});

test('Production Guild parsing repairs non-authoritative nested state before strict validation', () => {
  const social = source('src/server/social.ts');
  const recoveryStart = social.indexOf('function normalizeRecoverableGuildNestedFields(');
  const recoveryEnd = social.indexOf('\nfunction validateGuildNestedState(', recoveryStart);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart,
    'production nested-state recovery helper must exist');
  const recovery = social.slice(recoveryStart, recoveryEnd);
  assert.match(recovery, /guild\.tasks = guild\.tasks\.slice\(0, 3\)\.map/);
  assert.match(recovery, /guild\.chat = guild\.chat/);
  assert.match(recovery, /delete guild\.boss/);
  assert.match(recovery, /guild\.perks\[rank\] = clampInteger/);
  assert.match(recovery, /guild\.combo\.endsAt = clampInteger/);
  assert.doesNotMatch(recovery, /guild\.id\s*=/);
  assert.doesNotMatch(recovery, /member\.role\s*=/);
  assert.doesNotMatch(recovery, /member\.userId\s*=/);

  const parserStart = social.indexOf('function parseGuildListRaw(');
  const parserEnd = social.indexOf('\nfunction parseGuildList(', parserStart);
  assert.ok(parserStart >= 0 && parserEnd > parserStart, 'Guild parser boundaries must exist');
  const parser = social.slice(parserStart, parserEnd);
  const recoveryCall = parser.indexOf('normalizeRecoverableGuildNestedFields(item, index)');
  const strictValidation = parser.indexOf('validateGuildNestedState(item as Record<string, unknown>)');
  assert.ok(recoveryCall >= 0 && strictValidation > recoveryCall,
    'nested non-authoritative fields must be repaired before validation');
  assert.match(parser, /\['owner', 'officer', 'member'\]\.includes\(\(member as any\)\.role\)/);
  assert.match(parser, /\(\(member as any\)\.userId == null \|\| typeof \(member as any\)\.userId === 'string'\)/);
});
