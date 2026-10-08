import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createInitialState,
  frenzyOrbCountForRarity,
  frenzyClaimCountForRarity,
  grantFrenzyOwnerShards,
  FRENZY_OWNER_SHARD_REWARD,
  FRENZY_PROMPT_DELAY_MS,
  FRENZY_CLAIM_MAX_ORBS,
  canShowDailyFrenzyPrompt,
  todayKey,
} from '../src/shared/game.js';

const NOW = 1_800_000_000_000;

test('Frenzy claim size is multiplied by Multi Roll', () => {
  const base = frenzyOrbCountForRarity(1_000_000);
  assert.equal(frenzyClaimCountForRarity(1_000_000, 1), base);
  assert.equal(frenzyClaimCountForRarity(1_000_000, 4), base * 4);
  assert.equal(frenzyClaimCountForRarity(1_000_000, 0), base);
});

test('Frenzy Volley keeps its existing bonus on top of the Multi Roll multiplier', () => {
  const base = frenzyOrbCountForRarity(10_000);
  const multi = 5;
  assert.equal(
    frenzyClaimCountForRarity(10_000, multi, 1),
    Math.floor(base * 1.8),
  );
});

test('Frenzy claim size is capped safely', () => {
  assert.equal(
    frenzyClaimCountForRarity(1e100, 1e100),
    FRENZY_CLAIM_MAX_ORBS,
  );
});

test('Frenzy owner reward bypasses the normal 50-Shard daily cap', () => {
  const state = createInitialState(NOW);
  state.shards = 50;
  state.lifetimeShards = 50;
  state.lastFreeShardReset = todayKey(NOW);
  state.freeShardsEarnedToday = 50;

  const granted = grantFrenzyOwnerShards(state);

  assert.equal(granted, FRENZY_OWNER_SHARD_REWARD);
  assert.equal(state.shards, 55);
  assert.equal(state.lifetimeShards, 55);
  assert.equal(state.freeShardsEarnedToday, 50);
});

test('Frenzy prompt is delayed by three minutes and is daily', () => {
  assert.equal(FRENZY_PROMPT_DELAY_MS, 3 * 60_000);

  const today = todayKey(NOW);
  assert.equal(canShowDailyFrenzyPrompt(today, NOW), false);
  assert.equal(canShowDailyFrenzyPrompt('yesterday', NOW), true);
});

test('posted Frenzy opens the actual game entrypoint from the claim button', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/frenzy.tsx'), 'utf8');
  assert.match(source, /requestExpandedMode\(event\.nativeEvent, ['"]game['"]\)/);
  assert.match(source, /Click below to claim it\. You can only claim one a day\./);
  assert.match(source, /io-frenzy-rarity-number/);
  assert.match(source, /Your Multi Roll multiplies the Frenzy size/);
  assert.doesNotMatch(source, /When someone claims this Frenzy/);
  assert.doesNotMatch(source, /That \+5 Shard reward bypasses/);
  assert.doesNotMatch(source, /Self-claim is enabled for admin testing/);
  assert.match(source, /io-frenzy-orb-visual/);
});

test('posted Frenzy rarity uses the rarity color and roll-up animation', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/frenzy.tsx'), 'utf8');
  const styles = readFileSync(resolve(process.cwd(), 'src/client/styles.css'), 'utf8');
  assert.match(source, /getOrbInfo\(info\.rarity\)/);
  assert.match(source, /style=\{\{ color \}\}/);
  assert.match(styles, /@keyframes io-frenzy-number-roll/);
  assert.match(styles, /\.io-frenzy-rarity-number/);
});

test('starting a Frenzy creates a dedicated public Frenzy post', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(source, /entry: 'frenzy'/);
  assert.match(source, /postId = String\(post\?\.id/);
  assert.match(source, /FRENZY_OWNER_SHARD_REWARD/);
});

test('Frenzy posts use Orb terminology and claims return a visible Orb volley', () => {
  const server = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.doesNotMatch(server, /got a 1\/\$\{formatRarity\(rarity\)\} ball in their Frenzy/);
  assert.match(server, /got a 1\/\$\{formatRarity\(rarity\)\} Orb in their Frenzy/);
  assert.match(server, /const visibleBatch: Orb\[\] = \[\]/);
  assert.match(server, /batch: visibleBatch/);
});

test('Frenzy claims expose one-per-day eligibility and test self-claim', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(source, /canClaim: \(!claimedToday \|\| selfClaimTest\)/);
  assert.match(source, /selfClaimTest/);
  assert.match(source, /data\.adminTest === true/);
});


test('daily Frenzy prompt appears after the delay and explains the owner reward', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(source, /FRENZY_PROMPT_DELAY_MS/);
  assert.match(source, /Post today’s Frenzy/);
  assert.match(source, /\+\{FRENZY_OWNER_SHARD_REWARD\} Shards/);
  assert.match(source, /bypasses the 50 Shard daily cap/);
  assert.match(source, /localStorage\.setItem\(storageKey, '1'\)/);
});


test('Frenzy submission arms a manual roll and disables Auto Roll first', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(source, /const \[frenzyArmed, setFrenzyArmed\] = useState\(false\)/);
  assert.match(source, /body: JSON\.stringify\(\{ enabled: false \}\)/);
  assert.match(source, /setAutoRoll\(false\)/);
  assert.match(source, /setFrenzyArmed\(true\)/);
  assert.match(source, /if \(!isAutoRoll && frenzyArmed\)/);
  assert.match(source, /\/api\/frenzy\/start/);
});

test('Frenzy Roll button has a persistent lightning charge state and releases on click', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/components/RollSection.tsx'), 'utf8');
  const styles = readFileSync(resolve(process.cwd(), 'src/client/styles.css'), 'utf8');
  assert.match(source, /frenzy-supercharged/);
  assert.match(source, /frenzy-lightning-left/);
  assert.match(source, /frenzy-lightning-right/);
  assert.match(source, /RELEASE FRENZY/);
  assert.match(styles, /@keyframes io-frenzy-charge-pulse/);
  assert.match(styles, /@keyframes io-frenzy-lightning/);
});

test('Frenzy button shows a ticking daily cooldown after submission', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/components/RollSection.tsx'), 'utf8');
  assert.match(source, /nextFrenzyResetAt/);
  assert.match(source, /formatFrenzyCooldown/);
  assert.match(source, /Frenzy Cooldown/);
  assert.match(source, /disabled=\{busy \|\| frenzyArmed \|\| frenzyUsedToday\}/);
});

test('admin self-claim works even when the normal daily claim is already used', () => {
  const serverSource = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const clientSource = readFileSync(resolve(process.cwd(), 'src/client/frenzy.tsx'), 'utf8');
  assert.match(serverSource, /isFrenzyTestAdmin\(s\.username\)/);
  assert.match(serverSource, /data\.adminTest === true/);
  assert.match(clientSource, /const canClaim = info\.canClaim && !openedGame/);
  assert.match(clientSource, /Claim Your Frenzy · Test/);
  assert.match(serverSource, /if \(s\.lastFrenzyClaimDate === today && !selfClaimTest\)/);
});


test('Frenzy submission returns the starter roll and marks it as a manual roll', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(source, /s\.manualRolls = Math\.min\(10, \(s\.manualRolls \?\? 0\) \+ 1\)/);
  assert.match(source, /if \(s\.manualRolls >= 3\) s\.upgrades\.auto = 1/);
  assert.match(source, /orb: result\.bestOrb/);
  assert.match(source, /rollsProcessed: result\.rollCount/);
  assert.match(source, /lastFrenzyDate = today/);
});

test('Roll and Frenzy mutations share the client mutation queue', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');

  assert.match(
    source,
    /const res = await enqueueMutation\(\(\) =>[\s\S]*?\/api\/auto-roll/,
  );
  assert.match(
    source,
    /frenzySubmissionInFlight = true;[\s\S]*?const res = await enqueueMutation\(\(\) => getJson<\{/,
  );
  assert.match(source, /setFrenzyArmed\(false\);[\s\S]*?await refreshAll\(\)\.catch/);
});

test('Frenzy auto-claim requires an explicit server-side handoff', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(source, /\/api\/frenzy\/handoff/);
  assert.match(source, /if \(!handoff\.armed\) return/);
});

test('Frenzy claim button arms the server-side handoff before opening the game', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/frenzy.tsx'), 'utf8');
  assert.match(source, /\/api\/frenzy\/arm/);
  assert.match(source, /requestExpandedMode\(event\.nativeEvent, 'game'\)/);
});

test('Frenzy auto-claim always releases the game loading state', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(
    source,
    /void resolveFrenzy\(\)[\s\S]*?\.finally\(\(\) => \{[\s\S]*?setIsRolling\(false\);[\s\S]*?setBusy\(false\);[\s\S]*?\}\);/,
  );
  assert.match(
    source,
    /const res = await enqueueMutation\(\(\) =>[\s\S]*?\/api\/frenzy\/claim/,
  );
});


test('client roll reveal displays the exact authoritative payout', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/components/RollSection.tsx'), 'utf8');
  const main = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(source, /reward-burst/);
  assert.match(source, /batchSummary\.coins/);
  assert.match(source, /batchSummary\.xp/);
  assert.match(source, /batchSummary\.shards/);
  assert.match(source, /batchSummary\.totalVal/);
  assert.match(source, /roll-reward-summary/);
  assert.doesNotMatch(source, /coinsForRarity\(displayOrb\.rarity\)/);
  assert.match(main, /setBatchSummary\(\{[\s\S]*?coins: (?:res|prediction)\.coinsGained,[\s\S]*?xp: (?:res|prediction)\.xpGained/);
});

test('daily Frenzy popup closes when it arms the next manual roll', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(
    source,
    /onClick=\{\(\) => \{[\s\S]*?setShowFrenzyPrompt\(false\);[\s\S]*?void handleStartOrbFrenzy\(\);[\s\S]*?\}\}/,
  );
  assert.match(source, /Charge My Frenzy/);
  assert.match(source, /Your next manual Roll creates the post/);
});


test('Frenzy reveal survives the authoritative state update', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(source, /frenzyClaimActiveRef/);
  assert.match(source, /componentMountedRef/);
  assert.match(source, /for \(const revealedOrb of revealBatch\)/);
  assert.match(source, /setLastOrb\(revealedOrb\)/);
  assert.match(
    source,
    /applyPlayerState\(res\.state\);[\s\S]*?for \(const revealedOrb of revealBatch\)[\s\S]*?setLastOrb\(revealedOrb\)/,
  );
  const frenzyEffectStart = source.indexOf('  useEffect(() => {\n    if (!state || frenzyRunTriggered || frenzyClaimActiveRef.current) return;');
  const frenzyEffectEnd = source.indexOf('  useEffect(() => {\n    const startedAt = Date.now();', frenzyEffectStart);
  assert.ok(frenzyEffectStart >= 0);
  assert.ok(frenzyEffectEnd > frenzyEffectStart);
  const frenzyEffect = source.slice(frenzyEffectStart, frenzyEffectEnd);
  assert.doesNotMatch(frenzyEffect, /let cancelled = false/);
  assert.doesNotMatch(frenzyEffect, /cancelled = true/);
});

test('Admin console exposes a Force Frenzy Popup control', () => {
  const admin = readFileSync(resolve(process.cwd(), 'src/client/components/DevDebugModal.tsx'), 'utf8');
  const main = readFileSync(resolve(process.cwd(), 'src/client/main.tsx'), 'utf8');
  assert.match(admin, /onForceFrenzyPopup/);
  assert.match(admin, /Force Frenzy Popup/);
  assert.match(main, /onForceFrenzyPopup=\{\(\) => \{[\s\S]*?setShowFrenzyPrompt\(true\)/);
});

test('Frenzy rarity below one is normalized to the minimum orb count', () => {
  assert.equal(frenzyOrbCountForRarity(0), 1);
  assert.equal(frenzyOrbCountForRarity(-500), 1);
  assert.equal(frenzyOrbCountForRarity(Number.NaN), 1);
});

test('Frenzy orb count is strictly increasing across practical rarity milestones', () => {
  const rarities = [2, 10, 100, 1_000, 10_000, 1_000_000];
  const counts = rarities.map(frenzyOrbCountForRarity);
  for (let i = 1; i < counts.length; i += 1) {
    assert.ok(counts[i] > counts[i - 1], String(rarities[i]) + ' should produce more Frenzy orbs');
  }
});

test('Frenzy claim count treats zero or negative Multi Roll as one roll', () => {
  const base = frenzyOrbCountForRarity(500);
  assert.equal(frenzyClaimCountForRarity(500, 0), base);
  assert.equal(frenzyClaimCountForRarity(500, -4), base);
});

test('Frenzy Volley level zero does not reduce normal Multi Roll scaling', () => {
  const base = frenzyOrbCountForRarity(500);
  assert.equal(frenzyClaimCountForRarity(500, 6, 0), base * 6);
});

test('Frenzy Volley scales only the additional multiballs', () => {
  const base = frenzyOrbCountForRarity(500);
  const one = frenzyClaimCountForRarity(500, 1, 3);
  const four = frenzyClaimCountForRarity(500, 4, 3);
  assert.equal(one, base);
  assert.equal(four, Math.floor(base * 1.6));
});

test('Frenzy claim count is never below one orb', () => {
  assert.equal(frenzyClaimCountForRarity(2, 1), Math.max(1, frenzyOrbCountForRarity(2)));
  assert.equal(frenzyClaimCountForRarity(2, 0), Math.max(1, frenzyOrbCountForRarity(2)));
});

test('Frenzy cap applies after Multi Roll and Volley calculations', () => {
  assert.equal(frenzyClaimCountForRarity(1e100, 1e100, 5), FRENZY_CLAIM_MAX_ORBS);
});

test('Frenzy owner shard reward accepts a positive custom amount', () => {
  const state = createInitialState(NOW);
  state.shards = 10;
  state.lifetimeShards = 12;
  const granted = grantFrenzyOwnerShards(state, 9);
  assert.equal(granted, 9);
  assert.equal(state.shards, 19);
  assert.equal(state.lifetimeShards, 21);
});

test('Frenzy owner shard reward floors fractional requests instead of creating fractional currency', () => {
  const state = createInitialState(NOW);
  state.shards = 10;
  state.lifetimeShards = 10;
  assert.equal(grantFrenzyOwnerShards(state, 4.9), 4);
  assert.equal(state.shards, 14);
});

test('Frenzy owner shard reward rejects zero and negative custom amounts', () => {
  const state = createInitialState(NOW);
  state.shards = 10;
  state.lifetimeShards = 10;
  assert.equal(grantFrenzyOwnerShards(state, 0), 0);
  assert.equal(grantFrenzyOwnerShards(state, -5), 0);
  assert.equal(state.shards, 10);
  assert.equal(state.lifetimeShards, 10);
});

test('Frenzy daily availability flips only when the calendar day changes', () => {
  const today = todayKey(NOW);
  const laterToday = NOW + 23 * 60 * 60 * 1000;
  const tomorrow = NOW + 25 * 60 * 60 * 1000;
  assert.equal(canShowDailyFrenzyPrompt(today, laterToday), false);
  assert.equal(canShowDailyFrenzyPrompt(today, tomorrow), true);
});

test('Frenzy prompt delay is exactly three minutes, not an approximate value', () => {
  assert.equal(FRENZY_PROMPT_DELAY_MS, 180_000);
});

test('Frenzy claim limit constant is materially above ordinary early-game payouts', () => {
  assert.ok(FRENZY_CLAIM_MAX_ORBS >= 50_000_000);
  assert.ok(FRENZY_CLAIM_MAX_ORBS > frenzyClaimCountForRarity(1_000_000, 10));
});

test('Frenzy server creates posts with USER attribution rather than app attribution', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const start = source.indexOf('export async function startOrbFrenzy');
  const end = source.indexOf('export async function getOrbFrenzyInfo', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /runAs:\s*['"]USER['"]/);
  assert.doesNotMatch(block, /runAs:\s*['"]APP['"]/);
});

test('Frenzy post title contains the originating player identity', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.ok(source.includes('ownerUsername'));
  assert.ok(source.includes('got a 1/'));
  assert.ok(source.includes('Orb in their Frenzy'));
});

test('Frenzy post body tells claimers they can claim only once per day', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(source, /Click below to claim it! You can only claim one a day\./);
});

test('Frenzy post metadata stores the originating owner identity', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(source, /ownerId:\s*currentUserId\(\)/);
  assert.match(source, /ownerUsername/);
});

test('Frenzy handoff is stored against the claimant Reddit user, not the post alone', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(source, /redis\.set\(frenzyHandoffKey\(currentUserId\(\)\)/);
  assert.match(source, /function frenzyHandoffKey\(userId: string\)/);
});

test('Frenzy handoff expires after the configured short window', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(source, /FRENZY_HANDOFF_TTL_MS\s*=\s*60_000/);
  assert.match(source, /expiresAt:\s*Date\.now\(\)\s*\+\s*FRENZY_HANDOFF_TTL_MS/);
});

test('Frenzy info marks the post owner and blocks ordinary self-claims', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const start = source.indexOf('export async function getOrbFrenzyInfo');
  const end = source.indexOf('export async function claimOrbFrenzy', start);
  const block = source.slice(start, end);
  assert.match(block, /const isOwner = data\.ownerId === currentUserId\(\)/);
  assert.match(block, /canClaim:\s*\(!claimedToday \|\| selfClaimTest\) && \(!isOwner \|\| selfClaimTest\)/);
});

test('Frenzy claim enforces the same self-claim protection server-side', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const start = source.indexOf('export async function claimOrbFrenzy');
  const end = source.indexOf('export async function', start + 50);
  const block = source.slice(start, end);
  assert.match(block, /const isOwner = data\.ownerId === currentUserId\(\)/);
  assert.match(block, /if \(isOwner && !ownerSelfClaimAllowed\)/);
});

test('Frenzy claim enforces the daily limit independently of the post UI', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const start = source.indexOf('export async function claimOrbFrenzy');
  const end = source.indexOf('export async function', start + 50);
  const block = source.slice(start, end);
  assert.match(block, /s\.lastFrenzyClaimDate === today/);
  assert.match(block, /You already claimed a Frenzy reward today/);
});

test('Frenzy storage records the post as an in-game claimable post', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(source, /FRENZY_POST_PREFIX \+ postId, JSON\.stringify\(\{/);
  assert.match(source, /inGame:\s*true/);
});

test('Frenzy arm endpoint requires an actual Orb Frenzy post context', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const start = source.indexOf('export async function armOrbFrenzyClaim');
  const end = source.indexOf('export async function getOrbFrenzyHandoff', start);
  const block = source.slice(start, end);
  assert.match(block, /const postId = String\(context\.postId \?\? ''\)\.trim\(\)/);
  assert.match(block, /if \(!postId\) throw new Error\('This is not an Orb Frenzy post\.'\)/);
});
