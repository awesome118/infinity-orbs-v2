# Infinity Orbs: GitHub Pages testing build

This branch contains a standalone browser build of Infinity Orbs for testing before changes are uploaded to Reddit.

## What it runs

The Pages build reuses the current client UI and the same game, progression, guild, and combat modules from the Reddit version. It replaces the Devvit runtime with browser adapters and a local Redis-compatible store. Saves persist in the browser's local storage.

Each tester profile is selected by the `player` query parameter. For example:

- `https://awesome118.github.io/infinity-orbs-v2/?player=TesterOne`
- `https://awesome118.github.io/infinity-orbs-v2/?player=TesterTwo`

Those profiles use separate player saves in the same browser. They are not separate online users and cannot interact across browsers.

## Limits of the Pages version

GitHub Pages is static hosting. This build does not provide a shared backend, server-side authority, or real Reddit services. Reddit identity, post publishing, comments, Modmail, notification delivery, payments, and cross-player features are mocked or unavailable. The browser-side RNG and save storage are for development and balance testing only. Do not use Pages test saves as production data.

Combat and other server logic are executed in the browser against the local mock store. This keeps the gameplay rules close to the Reddit build, but it is not a security or concurrency test of the Devvit server.

A small test badge appears in the game. Selecting it lets you clear the local test data and restart with a fresh save.

## Build locally

Use Node.js 24 or newer:

```bash
npm ci
npm run build:pages
```

The output is written to `dist-pages/`. To preview it locally, run:

```bash
npx vite preview --config vite.pages.config.ts
```

## Publish the test site

1. In the repository settings, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Push commits to the `github-pages-test` branch, or manually run **Deploy Infinity Orbs Pages test build** from the Actions tab.
4. GitHub Actions builds `dist-pages/` and deploys that folder to Pages.

The Pages workflow only runs for the `github-pages-test` branch. It does not run the Devvit upload or publish commands. The normal Reddit build and deployment path remains separate.
