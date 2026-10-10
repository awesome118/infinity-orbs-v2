import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('follow reward save and its idempotency marker commit through the same save transaction', () => {
  const game = source('src/server/game.ts');
  const start = game.indexOf('export async function claimFollowReward');
  const end = game.indexOf('\nexport async function claimOffline', start);
  assert.ok(start >= 0 && end > start, 'claimFollowReward function must exist');
  const reward = game.slice(start, end);

  assert.match(reward, /await save\(s, \{[\s\S]*?key: rewardKey,[\s\S]*?expectedValue: null,[\s\S]*?nextValue: rewardMarker/);
  assert.match(reward, /if \(await redis\.get\(rewardKey\) !== rewardMarker\)/);
  assert.doesNotMatch(reward, /await redis\.set\(rewardKey,/);
});

test('Frenzy client retries read-only preflight but does not retry the claim POST', () => {
  const main = source('src/client/main.tsx');
  const start = main.indexOf('const resolveFrenzy = async () =>');
  const end = main.indexOf('\n    void resolveFrenzy()', start);
  assert.ok(start >= 0 && end > start, 'Frenzy resolver must exist');
  const resolver = main.slice(start, end);

  assert.match(resolver, /for \(let attempt = 0; attempt < 12; attempt\+\+\)/);
  assert.match(resolver, /getJson<RollResponse>\('\/api\/frenzy\/claim', \{ method: 'POST' \}\)/);
  assert.equal(
    (resolver.match(/getJson<RollResponse>\('\/api\/frenzy\/claim'/g) ?? []).length,
    1,
    'a potentially committed claim must not be automatically posted a second time',
  );
  assert.match(main.slice(end, end + 500), /showToast\(error\?\.message/);
});

test('global chat refresh replaces history with the server moderation-filtered snapshot', () => {
  const chat = source('src/client/components/GlobalChatWindow.tsx');
  assert.match(chat, /setMessages\(next\.slice\(-100\)\)/);
  assert.doesNotMatch(chat, /setMessages\(prev => mergeMessages\(prev, next\)\)/);
});

test('the static splash is imported and shown before the main game shell', () => {
  const main = source('src/client/main.tsx');
  const splash = source('src/client/components/SplashScreen.tsx');
  assert.match(main, /import \{ SplashScreen \} from '\.\/components\/SplashScreen\.js'/);
  assert.match(main, /if \(!splashEntered\)\s*\{[\s\S]*?<SplashScreen/);
  assert.match(splash, /infinity orbs/);
  assert.match(splash, /roll, collect, go further/);
  assert.doesNotMatch(splash, /setInterval|setTimeout|animate-/);
});

test('Reddit share failures render an accessible error instead of silently closing busy state', () => {
  const share = source('src/client/components/RedditShareModal.tsx');
  assert.match(share, /catch \(error\)\s*\{[\s\S]*?setErrorMessage/);
  assert.match(share, /role="alert"/);
});

test('global booster duration and UI copy agree on a two-hour activation', () => {
  const shared = source('src/shared/game.ts');
  const boosters = source('src/client/components/BoostersAndAutomation.tsx');
  const main = source('src/client/main.tsx');
  assert.match(shared, /GLOBAL_BOOSTER_DURATION_MS = 2 \* 60 \* 60 \* 1000/);
  assert.match(boosters, /Every activation adds 2 hours to its timer/);
  assert.match(boosters, /\+2h/);
  assert.match(main, /activated \{boosterAnnouncement\.name\} booster for 2 hours!/);
  assert.doesNotMatch(boosters, /adds 30 minutes|\+30m/);
});

test('Frenzy claim reserves claimant, owner, and post locks in a deterministic order', () => {
  const game = source('src/server/game.ts');
  const helperStart = game.indexOf('async function withPlayerMutationLocksFor');
  const helperEnd = game.indexOf('\nconst key =', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'multi-lock helper must exist');
  const helper = game.slice(helperStart, helperEnd);
  assert.match(helper, /\.sort\(\)/);

  const start = game.indexOf('export async function claimOrbFrenzy');
  const end = game.indexOf('\n\nfunction sampleBinomial', start);
  assert.ok(start >= 0 && end > start, 'claim function must exist');
  const claim = game.slice(start, end);
  assert.match(claim, /const postLockId =/);
  assert.match(claim, /__frenzy-post__/);
  assert.match(claim, /return withPlayerMutationLocksFor\(lockIds/);
  assert.match(claim, /if \(data\.consumedAt != null\)/);
  assert.match(claim, /expectedValue: raw,[\s\S]*?nextValue: consumedPostValue/);
  assert.match(claim, /if \(await redis\.get\(FRENZY_POST_PREFIX \+ postId\) !== consumedPostValue\)/);
});

test('missing-key initialization cannot overwrite a concurrent first write', () => {
  const game = source('src/server/game.ts');
  const social = source('src/server/social.ts');
  const mock = source('src/server/devvit-mock.ts');
  assert.match(game, /redis\.set\(keyName, fallback, \{ nx: true \}\)/);
  assert.match(social, /redis\.set\(keyName, fallback, \{ nx: true \}\)/);
  assert.match(mock, /options\?\.nx && readStore\(key\) !== undefined/);
  assert.match(mock, /options\?\.expiration instanceof Date/);
});

test('game ban mutations use WATCH/EXEC so concurrent admins cannot erase each other', () => {
  const game = source('src/server/game.ts');
  const start = game.indexOf('async function mutateGameBans');
  const end = game.indexOf('export async function getGameBanStatus', start);
  assert.ok(start >= 0 && end > start, 'atomic ban mutation helper must exist');
  const helper = game.slice(start, end);
  assert.match(helper, /redis\.watch\(GAME_BANS_KEY\)/);
  assert.match(helper, /await txn\.exec\(\)/);
  assert.match(game, /return mutateGameBans\(bans => \{/);
  assert.doesNotMatch(game, /async function writeGameBans/);
});

test('CCU peak recording uses a monotonic watched update', () => {
  const game = source('src/server/game.ts');
  const start = game.indexOf('async function updateCcuPeak');
  const end = game.indexOf('async function recordCcuPeak', start);
  assert.ok(start >= 0 && end > start, 'CCU peak helper must exist');
  const helper = game.slice(start, end);
  assert.match(helper, /redis\.watch\(keyName\)/);
  assert.match(helper, /candidate <= current/);
  assert.match(helper, /await txn\.exec\(\)/);
  assert.match(game, /await updateCcuPeak\(hourKey, ccu\)/);
  assert.match(game, /await updateCcuPeak\(CCU_ALL_TIME_KEY, ccu\)/);
});

 
test('roll tickets disclose no RNG seed and client never predicts authoritative rewards', () => {
  const game = source('src/server/game.ts');
  const client = source('src/client/main.tsx');
  const getTicketStart = game.indexOf('export async function getRollTicket');
  const getTicketEnd = game.indexOf('async function loadRollTicketForUse', getTicketStart);
  assert.ok(getTicketStart >= 0 && getTicketEnd > getTicketStart);
  const ticketApi = game.slice(getTicketStart, getTicketEnd);
  assert.doesNotMatch(ticketApi, /seed\s*:/);
  assert.doesNotMatch(ticketApi, /current\.seed|ticket\.seed/);
  assert.doesNotMatch(client, /predictRollActivation|rollTicketSeed/);
  const rollStart = game.indexOf('export async function roll(');
  const rollEnd = game.indexOf('export async function subscribeToSubredditForReward', rollStart);
  assert.ok(rollStart >= 0 && rollEnd > rollStart);
  const roll = game.slice(rollStart, rollEnd);
  assert.doesNotMatch(roll, /createSeededRandom|rollTicketSeed/);
  assert.match(roll, /await applyRolls\(s, 1, undefined, 'online'\)/);
  assert.match(game, /const rng = randomOverride \?\? serverRandom/);
});

test('player mutation lock renews its lease and releases only its own token', () => {
  const lock = source('src/server/player-lock.ts');
  assert.match(lock, /renewOwnedLock\(lockKey, token\)/);
  assert.match(lock, /PLAYER_MUTATION_LOCK_TTL_MS \/ 3/);
  const releaseStart = lock.indexOf('async function releaseOwnedLock');
  const releaseEnd = lock.indexOf('export async function withPlayerMutationLockFor', releaseStart);
  assert.ok(releaseStart >= 0 && releaseEnd > releaseStart);
  const release = lock.slice(releaseStart, releaseEnd);
  assert.match(release, /redis\.watch\(lockKey\)/);
  assert.match(release, /await txn\.del\(lockKey\)/);
  assert.doesNotMatch(release, /await redis\.del\(lockKey\)/);
});

test('mastery upgrades reject inherited property names and ban middleware fails closed', () => {
  const app = source('src/server/app.ts');
  const game = source('src/server/game.ts');
  const routeStart = app.indexOf("app.post('/api/mastery/upgrade'");
  const routeEnd = app.indexOf("app.post('/api/cosmetics/buy'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = app.slice(routeStart, routeEnd);
  assert.match(route, /hasOwnProperty\.call\(MASTERY_SKILLS, skillId\)/);
  assert.match(route, /status\(400\)/);
  const serviceStart = game.indexOf('export async function upgradeMasterySkill');
  const serviceEnd = game.indexOf('export async function synthesizeDust', serviceStart);
  assert.ok(serviceStart >= 0 && serviceEnd > serviceStart);
  assert.match(game.slice(serviceStart, serviceEnd), /hasOwnProperty\.call\(MASTERY_SKILLS, skillId\)/);
  const banStart = app.indexOf("// Game bans are enforced server-side.");
  const banEnd = app.indexOf("// Reddit's payment callback", banStart);
  assert.ok(banStart >= 0 && banEnd > banStart);
  assert.match(app.slice(banStart, banEnd), /status\(503\)/);
  assert.match(app.slice(banStart, banEnd), /return next\(\)/);
});

test('Prestige optimistic state preserves Shards just like the server', () => {
  const client = source('src/client/main.tsx');
  const start = client.indexOf('const handlePrestige');
  const end = client.indexOf('const handleBuyPrestigeUpgrade', start);
  assert.ok(start >= 0 && end > start);
  const prestige = client.slice(start, end);
  assert.match(prestige, /shards:\s*current\.shards \?\? 0/);
  assert.doesNotMatch(prestige, /shards:\s*keptShards/);
});

test('community event rejects infinite and non-terminating progression values', () => {
  const social = source('src/server/social.ts');
  assert.match(social, /function validateCommunityEventConfig/);
  assert.match(social, /Number\.isFinite\(config\.buffMultiplier\)/);
  assert.match(social, /Number\.isSafeInteger\(amount\)/);
  assert.match(social, /assertSafeProgressionNumbers\('Community event'/);
  const addStart = social.indexOf('export async function addCommunityRolls');
  const addEnd = social.indexOf('export async function setCommunityEventConfig', addStart);
  assert.ok(addStart >= 0 && addEnd > addStart);
  const add = social.slice(addStart, addEnd);
  assert.match(add, /await txn\.unwatch\(\)/);
  assert.match(add, /Number\.MAX_SAFE_INTEGER/);
});

test('chat side effects use per-user atomic cooldowns and real newlines', () => {
  const social = source('src/server/social.ts');
  assert.match(social, /function enforceChatCooldown/);
  assert.match(social, /nx:\s*true/);
  assert.match(social, /expiration:\s*new Date/);
  assert.match(social, /enforceChatCooldown\('global', 2_000\)/);
  assert.match(social, /enforceChatCooldown\('guild', 2_000\)/);
  assert.match(social, /enforceChatCooldown\('report', 5_000\)/);
  assert.ok(social.includes(".split(/\\r?\\n/)"));
  assert.ok(social.includes("].join('\\n');"));
  assert.doesNotMatch(social, /split\('\\\\n'\)/);
});

test('Global Booster debug updates validate and CAS the full snapshot', () => {
  const game = source('src/server/game.ts');
  const start = game.indexOf('export async function setGlobalBoosterDebugState');
  const end = game.indexOf('function playerKeyFor', start);
  assert.ok(start >= 0 && end > start);
  const setter = game.slice(start, end);
  assert.match(setter, /Number\.isSafeInteger\(tier\)/);
  assert.match(setter, /Number\.isSafeInteger\(minutes\)/);
  assert.match(setter, /hasOwnProperty\.call\(GLOBAL_BOOSTERS, id\)/);
  assert.match(setter, /redis\.watch\(GLOBAL_BOOSTERS_KEY\)/);
  assert.match(setter, /await txn\.exec\(\)/);
  assert.doesNotMatch(setter, /await redis\.set\(GLOBAL_BOOSTERS_KEY/);
  assert.match(setter, /refusing to overwrite it/);
});


test('wiped saves cannot return mutation success and offline reminder keys survive failed claims', () => {
  const game = source('src/server/game.ts');
  const saveStart = game.indexOf('export async function save(');
  const saveEnd = game.indexOf('export async function loadRaw', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  const save = game.slice(saveStart, saveEnd);
  const mismatch = save.indexOf('if (stateGeneration !== generation)');
  const mismatchEnd = save.indexOf('const latest =', mismatch);
  assert.ok(mismatch >= 0 && mismatchEnd > mismatch);
  assert.match(save.slice(mismatch, mismatchEnd), /PLAYER_STATE_INVALIDATED_BY_WIPE/);
  assert.doesNotMatch(save.slice(mismatch, mismatchEnd), /Object\.assign\(s, fresh\);\s*await txn\.unwatch\(\);\s*return;/);

  const claimStart = game.indexOf('export async function claimOffline');
  const claimEnd = game.indexOf('export async function buyUpgrade', claimStart);
  assert.ok(claimStart >= 0 && claimEnd > claimStart);
  const claim = game.slice(claimStart, claimEnd);
  assert.ok(claim.indexOf('await save(s)') < claim.indexOf('OFFLINE_FULL_NOTIFICATION_PREFIX'));
  assert.ok(claim.indexOf('await save(s)') < claim.indexOf('OFFLINE_FULL_JOB_PREFIX'));
});


test('Global Booster activation cannot replace corrupt data with defaults', () => {
  const game = source('src/server/game.ts');
  const start = game.indexOf('async function updateGlobalBooster');
  const end = game.indexOf('export async function setGlobalBoosterDebugState', start);
  assert.ok(start >= 0 && end > start);
  const updater = game.slice(start, end);
  assert.match(updater, /raw == null\s*\?\s*createInitialGlobalBoosters\(now\)/);
  assert.match(updater, /parseGlobalBoosterSnapshot\(raw, now\)/);
  assert.match(updater, /Global Booster data is corrupted; refusing to overwrite it/);
  assert.doesNotMatch(updater, /parseGlobalBoosterSnapshot\(raw, now\)\s*\?\?\s*createInitialGlobalBoosters/);
});


test('Daily Streak community progression rejects invalid loop state', () => {
  const social = source('src/server/social.ts');
  assert.match(social, /function validateDailyStreakCommunityEvent/);
  assert.match(social, /Daily Streak community data is corrupted/);
  assert.match(social, /Daily Streak contribution must be a finite safe integer/);
  const start = social.indexOf('export async function addDailyStreakCommunityProgress');
  const end = social.indexOf('function unlocked', start);
  assert.ok(start >= 0 && end > start);
  const add = social.slice(start, end);
  assert.match(add, /Number\.isSafeInteger\(contribution\)/);
  assert.match(add, /validateDailyStreakCommunityEvent\(event\)/);
  assert.match(add, /Number\.MAX_SAFE_INTEGER/);
  assert.doesNotMatch(add, /parseStoredJson<DailyStreakCommunityEvent>\(raw\) \?\? createInitialDailyStreakCommunity/);
});


test('Guild migration marker and transformed guild data commit atomically', () => {
  const social = source('src/server/social.ts');
  assert.match(social, /async function applyGuildMigration/);
  const start = social.indexOf('async function applyGuildMigration');
  const end = social.indexOf('async function ensureGuildMigrations', start);
  assert.ok(start >= 0 && end > start);
  const migration = social.slice(start, end);
  assert.match(migration, /redis\.watch\(GUILDS_KEY, markerKey\)/);
  assert.match(migration, /await txn\.set\(GUILDS_KEY, JSON\.stringify\(guilds\)\)/);
  assert.match(migration, /await txn\.set\(markerKey, '1'\)/);
  assert.match(migration, /await txn\.exec\(\)/);
  assert.match(migration, /if \(marker != null\)/);
  const writerStart = social.indexOf('async function updateGuilds<T>');
  const readerStart = social.indexOf('async function loadGuilds');
  assert.ok(writerStart >= 0 && readerStart > writerStart);
  assert.match(social.slice(writerStart, readerStart), /await ensureGuildMigrations\(\)/);
  assert.match(social.slice(readerStart), /await ensureGuildMigrations\(\)/);
  assert.match(social, /Guild data is corrupted; refusing to replace it/);
});


test('corrupted leaderboard rows cannot be overwritten as an empty board', () => {
  const social = source('src/server/social.ts');
  const parserStart = social.indexOf('function parseLeaderboardList');
  const parserEnd = social.indexOf('const COMMUNITY_EVENT_KEY', parserStart);
  assert.ok(parserStart >= 0 && parserEnd > parserStart);
  const parser = social.slice(parserStart, parserEnd);
  assert.match(parser, /Leaderboard data is corrupted; refusing to replace it/);
  assert.match(parser, /Leaderboard contains a malformed record/);
  const recordStart = social.indexOf('export async function recordLeaderboard');
  const recordEnd = social.indexOf('function validateDailyStreakCommunityEvent', recordStart);
  assert.ok(recordStart >= 0 && recordEnd > recordStart);
  assert.match(social.slice(recordStart, recordEnd), /parseLeaderboardList\(raw\)/);
  const boardsStart = social.indexOf('export async function leaderboards()');
  const boardsEnd = social.indexOf('\nexport async function ', boardsStart + 30);
  assert.ok(boardsStart >= 0 && boardsEnd > boardsStart);
  assert.match(social.slice(boardsStart, boardsEnd), /Ignoring corrupt legacy projection/);
});


test('Global Booster charge and stack share one atomic player save', () => {
  const game = source('src/server/game.ts');
  const prepareStart = game.indexOf('async function prepareGlobalBoosterActivation');
  const prepareEnd = game.indexOf('export async function setGlobalBoosterDebugState', prepareStart);
  assert.ok(prepareStart >= 0 && prepareEnd > prepareStart);
  assert.doesNotMatch(game.slice(prepareStart, prepareEnd), /await txn\.exec\(\)/);
  const claimStart = game.indexOf('async function claimWorldBoosterActivation');
  const claimEnd = game.indexOf('export async function activateGlobalBooster', claimStart);
  assert.ok(claimStart >= 0 && claimEnd > claimStart);
  const claim = game.slice(claimStart, claimEnd);
  assert.match(claim, /await save\(s, \{/);
  assert.match(claim, /key: GLOBAL_BOOSTERS_KEY/);
  assert.match(claim, /expectedValue: prepared\.expectedValue/);
  assert.match(claim, /nextValue: prepared\.nextValue/);
  assert.match(claim, /Activation committed, but announcement\/audit projection failed/);
});


test('malformed roll tickets are replaced or rejected before use', () => {
  const game = source('src/server/game.ts');
  const issueStart = game.indexOf('export async function getRollTicket');
  const issueEnd = game.indexOf('async function loadRollTicketForUse', issueStart);
  assert.ok(issueStart >= 0 && issueEnd > issueStart);
  const issue = game.slice(issueStart, issueEnd);
  assert.match(issue, /Number\.isSafeInteger\(current\.nextIndex\)/);
  assert.match(issue, /Number\.isSafeInteger\(current\.expiresAt\)/);
  assert.match(issue, /current\.id\.length <= 128/);
  const useEnd = game.indexOf('export async function save(', issueEnd);
  assert.ok(useEnd > issueEnd);
  const use = game.slice(issueEnd, useEnd);
  assert.match(use, /Number\.isSafeInteger\(ticket\.nextIndex\)/);
  assert.match(use, /Roll prediction ticket data is corrupted/);
});


test('Daily Streak reward and community tier commit atomically with player state', () => {
  const game = source('src/server/game.ts');
  const social = source('src/server/social.ts');
  assert.match(game, /const pendingSaveExtraWrites = new WeakMap<PlayerState, SaveExtraWrite\[\]>/);
  assert.match(game, /function stageSaveExtraWrite/);
  const saveStart = game.indexOf('export async function save(');
  const saveEnd = game.indexOf('function serverRandom', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  const save = game.slice(saveStart, saveEnd);
  assert.match(save, /Array\.isArray\(extraWrite\)/);
  assert.match(save, /redis\.watch\(\.\.\.watchedKeys\)/);
  assert.match(save, /for \(const write of extraWrites\)/);
  const claimStart = game.indexOf('async function claimDailyStreakFromState');
  const claimEnd = game.indexOf('async function claimCommunityRewardFromState', claimStart);
  assert.ok(claimStart >= 0 && claimEnd > claimStart);
  const claim = game.slice(claimStart, claimEnd);
  assert.match(claim, /prepareDailyStreakCommunityProgress/);
  assert.match(claim, /stageSaveExtraWrite\(s/);
  assert.doesNotMatch(claim, /await addDailyStreakCommunityProgress/);
  assert.match(social, /export async function prepareDailyStreakCommunityProgress/);
});


test('roll rewards commit atomically with Guild and community progress', () => {
  const game = source('src/server/game.ts');
  const social = source('src/server/social.ts');
  const rollStart = game.indexOf('export async function applyRolls');
  const rollEnd = game.indexOf('async function sendOfflineFullNotification', rollStart);
  assert.ok(rollStart >= 0 && rollEnd > rollStart);
  const roll = game.slice(rollStart, rollEnd);
  assert.match(roll, /prepareGuildRollEffects\(/);
  assert.match(roll, /stageSaveExtraWrite\(s, guildEffects\.extraWrite\)/);
  assert.match(roll, /prepareCommunityRolls\(rollCount, pendingCommunityWrite\)/);
  assert.match(roll, /stageSaveExtraWrite\(s, \{/);
  assert.doesNotMatch(roll, /await applyGuildTax\(/);
  assert.doesNotMatch(roll, /await contribute\(/);
  assert.doesNotMatch(roll, /await addCommunityRolls\(/);
  assert.match(social, /export async function prepareGuildRollEffects/);
  assert.match(social, /export async function prepareCommunityRolls/);
  assert.match(game, /function getPendingSaveExtraWrite/);
});


test('automatic offline claims only clear reminder keys after the player save commits', () => {
  const game = source('src/server/game.ts');
  const automationStart = game.indexOf('async function processAutomation');
  const automationEnd = game.indexOf('function flairTextColorForBackground', automationStart);
  assert.ok(automationStart >= 0 && automationEnd > automationStart);
  const automation = game.slice(automationStart, automationEnd);
  assert.match(automation, /stageSavePostCommitAction\(s, async \(\) =>/);
  assert.doesNotMatch(automation, /redis\.del\(OFFLINE_FULL_(?:NOTIFICATION|JOB)_PREFIX/);
  assert.match(automation, /clearOfflineReminderKeyIfUnchanged/);
  assert.match(automation, /scheduleOfflineFullNotification/);

  const saveStart = game.indexOf('export async function save(');
  const saveEnd = game.indexOf('function serverRandom', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  const save = game.slice(saveStart, saveEnd);
  const committedIndex = save.indexOf('if (committed !== null)');
  const playerStateIndex = save.indexOf('Object.assign(s, nextState)', committedIndex);
  const actionsIndex = save.indexOf('for (const action of postCommitActions)', committedIndex);
  assert.ok(committedIndex >= 0 && playerStateIndex > committedIndex);
  assert.ok(actionsIndex > playerStateIndex, 'reminder cleanup must run only after the saved state is durable');
});


test('game ban registry fails closed on malformed stored rows and unrepresentable duration inputs', () => {
  const game = source('src/server/game.ts');
  const parserStart = game.indexOf('function parseGameBanRegistry');
  const parserEnd = game.indexOf('async function readGameBans', parserStart);
  assert.ok(parserStart >= 0 && parserEnd > parserStart);
  const parser = game.slice(parserStart, parserEnd);
  assert.match(parser, /if \(raw == null\) return Object\.create\(null\)/);
  assert.match(parser, /bannedUntil.*=== null/);
  assert.match(parser, /Number\.isSafeInteger/);
  assert.match(parser, /malformed record/);

  const mutatorStart = game.indexOf('async function mutateGameBans');
  const mutatorEnd = game.indexOf('export async function getGameBanStatus', mutatorStart);
  const mutator = game.slice(mutatorStart, mutatorEnd);
  assert.match(mutator, /bans = parseGameBanRegistry\(raw\)/);
  assert.doesNotMatch(mutator, /raw !== ''/);

  const banStart = game.indexOf('export async function banGameUser');
  const banEnd = game.indexOf('export async function unbanGameUser', banStart);
  assert.ok(banStart >= 0 && banEnd > banStart);
  const ban = game.slice(banStart, banEnd);
  assert.match(ban, /Number\.isSafeInteger\(requestedDays\)/);
  assert.match(ban, /maximumDays/);
  assert.match(ban, /Number\.isSafeInteger\(bannedUntil\)/);
});

test('targeted wipes and Reset All write generation plus fresh save atomically', () => {
  const debug = source('src/server/debug.ts');
  const helperStart = debug.indexOf('async function resetPlayerGenerationAndSave');
  const helperEnd = debug.indexOf('async function wipeUser', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = debug.slice(helperStart, helperEnd);
  assert.match(helper, /redis\.watch\(generationKey, playerKey\)/);
  assert.match(helper, /await txn\.multi\(\)/);
  assert.match(helper, /txn\.set\(generationKey/);
  assert.match(helper, /txn\.set\(playerKey/);
  assert.match(helper, /await txn\.exec\(\)/);
  assert.doesNotMatch(helper, /await redis\.set\(generationKey/);
  assert.doesNotMatch(helper, /await redis\.set\(playerKey/);

  const wipeStart = debug.indexOf('async function wipeUser');
  const wipeEnd = debug.indexOf('function setMaxProgression', wipeStart);
  assert.ok(wipeStart >= 0 && wipeEnd > wipeStart);
  assert.match(debug.slice(wipeStart, wipeEnd), /resetPlayerGenerationAndSave\(userId, name\)/);

  const resetStart = debug.indexOf("debugRouter.post('/reset-all'");
  assert.ok(resetStart >= 0);
  assert.match(debug.slice(resetStart, resetStart + 2200), /resetPlayerGenerationAndSave\(/);
  assert.doesNotMatch(debug.slice(resetStart, resetStart + 2200), /await redis\.set\(generationKey/);
});

test('account cleanup never overwrites a concurrent leaderboard update or replaces corrupt data with an empty board', () => {
  const debug = source('src/server/debug.ts');
  const start = debug.indexOf('async function removeLeaderboardEntry');
  const end = debug.indexOf('async function resolveUserId', start);
  assert.ok(start >= 0 && end > start);
  const cleanup = debug.slice(start, end);
  assert.match(cleanup, /redis\.watch\(leaderboardKey\)/);
  assert.match(cleanup, /await txn\.exec\(\)/);
  assert.match(cleanup, /Leaderboard data is corrupted/);
  assert.match(cleanup, /Leaderboard data is malformed/);
  assert.doesNotMatch(cleanup, /catch \{\s*parsed = \[\]/);
});


test('Frenzy claim commits owner reward, Guild effects, community progress, and post consumption together', () => {
  const game = source('src/server/game.ts');
  const rewardStart = game.indexOf('async function prepareFrenzyOwnerRewardWrites');
  const rewardEnd = game.indexOf('function parseGlobalBoosterSnapshot', rewardStart);
  assert.ok(rewardStart >= 0 && rewardEnd > rewardStart);
  const reward = game.slice(rewardStart, rewardEnd);
  assert.match(reward, /ownerGenerationKey/);
  assert.match(reward, /key: ownerGenerationKey/);
  assert.match(reward, /key: ownerKey/);
  assert.match(reward, /Number\.isSafeInteger\(generation\)/);

  const claimStart = game.indexOf('export async function claimOrbFrenzy');
  const claimEnd = game.indexOf('function sampleBinomial', claimStart);
  assert.ok(claimStart >= 0 && claimEnd > claimStart);
  const claim = game.slice(claimStart, claimEnd);
  assert.match(claim, /prepareGuildRollEffects\(/);
  assert.match(claim, /prepareCommunityRolls\(/);
  assert.match(claim, /prepareFrenzyOwnerRewardWrites\(/);
  assert.match(claim, /await save\(s, \[[\s\S]*?FRENZY_POST_PREFIX \+ postId[\s\S]*?\.\.\.ownerRewardWrites/);
  assert.doesNotMatch(claim, /await applyGuildTax\(coinsGained\)/);
  assert.doesNotMatch(claim, /await contribute\(finalValue/);
  assert.doesNotMatch(claim, /await addCommunityRolls\(count\)/);
  assert.doesNotMatch(claim, /grantFrenzyOwnerReward/);
});


test('player saves watch and validate active distributed lease tokens before EXEC', () => {
  const game = source('src/server/game.ts');
  const lock = source('src/server/player-lock.ts');
  assert.match(lock, /const activeMutationTokens = new Map<string, string>/);
  assert.match(lock, /export function getActivePlayerMutationLock/);
  const start = game.indexOf('export async function save(');
  const end = game.indexOf('function serverRandom', start);
  assert.ok(start >= 0 && end > start);
  const save = game.slice(start, end);
  assert.match(save, /getActivePlayerMutationLock\(id\)/);
  assert.match(save, /activeLocks\.map\(item => item\.key\)/);
  assert.match(save, /redis\.watch\(\.\.\.watchedKeys\)/);
  assert.match(save, /actualToken !== activeLock\.token/);
  assert.match(save, /PLAYER_MUTATION_LEASE_LOST/);
  assert.ok(save.indexOf('actualToken !== activeLock.token') < save.indexOf('await txn.multi()'));
});


test('Guild migration markers must be exactly the completed marker before skipping or mutating', () => {
  const social = source('src/server/social.ts');
  const start = social.indexOf('async function applyGuildMigration');
  const end = social.indexOf('async function ensureGuildMigrations', start);
  assert.ok(start >= 0 && end > start);
  const migration = social.slice(start, end);
  assert.match(migration, /if \(marker === '1'\)/);
  assert.match(migration, /if \(marker != null\)[\s\S]*?txn\.unwatch\(\)[\s\S]*?throw new Error\('Guild migration marker is corrupted/);
  const malformedGuard = migration.indexOf("throw new Error('Guild migration marker is corrupted");
  const migrateIndex = migration.indexOf('migrate(guilds)');
  assert.ok(malformedGuard >= 0 && migrateIndex > malformedGuard);
  assert.doesNotMatch(migration, /if \(marker\) return/);
});
