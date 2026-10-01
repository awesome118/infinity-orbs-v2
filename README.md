# Infinity Orbs

Reddit-native incremental RNG game built with Devvit Web.

## Core loop
- Roll every 10 seconds at base speed.
- Collect Orbs whose number represents rarity (for example, 1 / 100,000).
- Spend Coins on Speed, Multi Roll, Auto Roll, and Luck.
- Auto Roll is intentionally an early milestone and unlocks after 10 total rolls.

## Current systems
- Server-authoritative player state in Redis on Reddit, in-memory mock locally
- Continuous rarity RNG with named Orb tiers
- Coins, Shards, Cosmic Dust, prestige, prestige upgrades
- Daily/weekly quests and streak rewards
- Collections, achievements, cosmetics, Turbo Roll
- Guilds, guild perks, guild challenges, chat, leaderboards
- Explicit Reddit sharing through the Reddit API
- React + Vite + Tailwind webview

## Development

```bash
npm install
npm run type-check
npm test
npm run build
npm run dev
```

`npm run dev` starts the local Express/Vite harness at `http://localhost:3000` using the in-memory Devvit mock.

## Reddit playtesting and deployment

The production build uses the Devvit Vite plugin and emits the client to `dist/client` and the server bundle to `dist/server/index.cjs`.

```bash
npx devvit login
npm run dev:reddit
npm run upload
```

`npm run deploy` runs type-checking, the production build, and `devvit upload` in one command. `npm run publish` builds and submits the app to Reddit for publishing/review.
