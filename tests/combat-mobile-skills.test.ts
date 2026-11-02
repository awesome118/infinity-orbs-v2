import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Combat Skill Gacha opens readable tap-first details on mobile', () => {
  const combat = source('src/client/components/CombatSection.tsx');
  const mobileCss = source('src/client/mobile-experience.css');

  assert.match(combat, /setMobileDetailSkillId\(skill\.id\)/);
  assert.match(combat, /data-testid="combat-skill-mobile-details"/);
  assert.match(combat, /role="dialog"/);
  assert.match(combat, /skillValue\(mobileDetailSkill/);
  assert.match(combat, /mobileDetailCopies/);
  assert.match(combat, /mobileDetailActionLabel/);
  assert.match(combat, /Close skill details/);
  assert.match(mobileCss, /\.io-combat-skill-mobile-detail-backdrop/);
  assert.match(mobileCss, /\.io-combat-skill-mobile-detail[\s\S]*max-height: min\(82dvh, 680px\)/);
  assert.match(mobileCss, /io-combat-skill-icon-wrap \.io-combat-skill-tooltip[\s\S]*display: none !important/);
});
