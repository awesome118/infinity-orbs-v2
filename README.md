# Infinity Orbs

Reddit-native incremental RNG game built with Devvit Web.

## Play loop

Roll for Orbs whose number represents rarity (for example, 1 / 100,000). Spend Coins on upgrades, unlock Mastery and Prestige, complete quests, join guilds, and share discoveries through Reddit.

## Architecture

- React + Vite + Tailwind webview
- Devvit Web custom posts
- Reddit identity from Devvit context
- Persistent player state in Devvit Redis
- Server-authoritative rolls, rewards, upgrades, prestige, quests, and sharing
- Secure server-side RNG for game rolls
- Reddit custom-post sharing
- Standalone local mock harness remains available for UI work

## Reddit development

The Reddit version is the primary development target.

Prerequisite: a Reddit account with access to Reddit for Developers and Node.js 24+.

1. `npm install`
2. `npm run login`
3. `npm run dev`

`npm run dev` starts a Devvit playtest. Reddit creates or reuses a private playtest subreddit and installs the current app there. Open the URL printed by the CLI.

The playtest includes a moderator menu action named **Create a new post**. The app-install trigger can also create an initial game post.

## Local-only UI development

`npm run dev:local` starts the existing in-memory Express/Vite harness at `http://localhost:3000`.

The local harness is useful for UI work, but it is not a substitute for Reddit playtesting because Devvit backend behavior and Reddit identity only exist in the playtest environment.

## Build and release

- `npm run type-check` checks TypeScript.
- `npm run build` creates the Devvit client and server bundles.
- `npm run deploy` builds and uploads the app.
- `npm run launch` builds, uploads, and submits the app for publishing/review.

## Reddit post behavior

The `default` entrypoint is a lightweight inline splash. Clicking **Play Infinity Orbs** switches to the `game` entrypoint. Moderator-created and user-shared posts use the same custom-post system.

## Security

Browser requests identify actions only. The server calculates costs, rewards, rolls, progression, and state changes before writing them to Redis. The client never gets to decide how many Coins or Orbs it owns.

Devvit Web endpoints are serverless, so the game uses ordinary request/response APIs rather than WebSockets. Reddit's current Devvit Web environment supports this client/server split and Redis persistence.
