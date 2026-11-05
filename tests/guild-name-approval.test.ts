import test from 'node:test';
import assert from 'node:assert/strict';
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
