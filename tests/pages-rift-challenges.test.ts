import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('GitHub Pages boots the actual game with persistent isolated Rift progression', () => {
  const build = read('vite.pages.config.ts');
  const api = read('src/pages/api.ts');
  const mock = read('src/server/devvit-mock.ts');
  const client = read('src/client/main.tsx');
  const challengeUi = read('src/client/components/RiftChallengesSection.tsx');
  const shared = read('src/shared/rift-challenges.ts');
  const sharedGame = read('src/shared/game.ts');
  const server = read('src/server/rift-challenges.ts');
  const game = read('src/server/game.ts');

  assert.match(build, /root: clientRoot/);
  assert.match(build, /main\.tsx/);
  assert.match(build, /dist-pages/);
  assert.match(api, /getRiftChallengeStatus/);
  assert.match(api, /startRiftChallenge\(body\.challengeId\)/);
  assert.match(api, /rollRiftChallenge/);
  assert.match(api, /buyRiftChallengeUpgrade/);
  assert.match(api, /buyRiftPerk\(body\.perkId\)/);
  assert.match(api, /abandonRiftChallenge/);
  assert.match(mock, /BROWSER_STORAGE_PREFIX/);
  assert.match(mock, /localStorage/);

  // The real game's ordinary /api/me and mutation paths resolve to the active
  // challenge PlayerState while the main account save remains a separate key.
  assert.match(game, /async function readActiveRiftRun/);
  assert.match(game, /options\.source === 'main' \? null : await readActiveRiftRun/);
  assert.match(game, /async function saveActiveRiftPlayerState/);
  assert.match(game, /if \(s\.riftSession\) \{/);
  assert.match(game, /run\.gameState = storedState/);
  assert.match(server, /const mainProgress = storedRun\?\.gameState/);
  assert.match(server, /const mainProgress = archive\.activeRun\?\.gameState/);
  assert.match(game, /state\.riftRunComplete = true/);
  assert.match(game, /riftCodexOwnerId\(userId, session\.runId\)/);
  assert.match(game, /rollTicketKey\(currentUserId\(\), s\.riftSession\?\.runId\)/);
  assert.match(game, /challengeCoinMultiplier/);
  assert.match(game, /Auto Roll is disabled in The First Spark/);
  assert.match(game, /Offline rolls are disabled in The First Spark/);
  assert.match(game, /Automation is disabled in The First Spark/);
  assert.match(game, /Global Boosters are outside this isolated Rift run/);
  assert.match(game, /const luckCcu = s\.riftSession/);

  assert.match(sharedGame, /interface RiftPlayerSession/);
  assert.match(sharedGame, /riftSaveContext\?/);
  assert.match(client, /riftChallengesMode = tab === 'challenges' && !state\?\.riftSession/);
  assert.match(client, /tab === 'challenges' && !riftChallengesMode/);
  assert.match(client, /state\?\.riftRunComplete/);
  assert.match(client, /currentState\?\.riftSaveContext/);
  assert.match(client, /onEnterGame=\{\(\) =>/);
  assert.match(client, /renderNavItem\('reddit-simulator', 'Reddit Simulator', MessageSquare\)/);
  assert.match(client, /renderNavItem\('challenges', 'Rift Progression', Compass\)/);
  assert.doesNotMatch(client, /renderNavItem\('challenges', 'Challenges', Compass\)/);

  assert.match(challengeUi, /Rift game active/);
  assert.match(challengeUi, /ENTER RIFT GAME/);
  assert.doesNotMatch(challengeUi, /\/api\/rift-challenges\/roll/);
  assert.match(challengeUi, /\/api\/rift-challenges\/perk/);
  assert.match(shared, /RIFT_BASE_RATE_PER_HOUR = 1/);
  assert.match(shared, /fractured-tempo/);
  assert.match(shared, /hollow-economy/);
  assert.match(server, /accrueRiftProgress/);
  assert.match(server, /progressFromGameState\(archive\.activeRun\.gameState\)/);

  // Rift presentation is active-save scoped and never replaces the real game UI.
  const rollUi = read('src/client/components/RollSection.tsx');
  const riftTheme = read('src/client/rift-theme.css');
  assert.match(client, /const riftActive = Boolean/);
  assert.match(client, /newBestModalData && !riftActive/);
  assert.match(client, /current\.riftSession \|\| current\.riftSaveContext/);
  assert.match(client, /if \(loadedState\.riftSession\) throw new Error\('Frenzy publishing is unavailable inside an isolated Rift run/);
  assert.match(rollUi, /const isRiftSave = Boolean\(state\.riftSession/);
  assert.match(rollUi, /const frenzyArmedForRoll = frenzyArmed && !isRiftSave/);
  assert.match(rollUi, /!isRiftSave && \(/);
  assert.match(rollUi, /busy \? 'Rolling…' : canRoll \? 'Ready to roll'/);
  assert.match(rollUi, /!busy && displayOrb\?\.isCrit/);
  assert.match(rollUi, /!busy && displayOrb\?\.isNew/);
  assert.doesNotMatch(client, /if \(canShowPrediction && prediction\) \{\s*setLastOrb\(prediction\.orb\);\s*setLastBatch\(\[prediction\.orb\]\);\s*setBatchSummary\(null\);/);

  // The Rift uses a layered, animated purple portal and respects reduced motion.
  assert.match(client, /io-rift-vortex__ring--outer/);
  assert.match(riftTheme, /io-rift-vortex__ring--outer/);
  assert.match(riftTheme, /io-rift-energy-stream/);
  assert.match(riftTheme, /io-rift-particles/);
  assert.match(riftTheme, /prefers-reduced-motion: reduce/);
});
