# Infinity Orbs Deployment Readiness

**Purpose:** repeatable checklist for preparing, uploading, installing, and (separately) submitting Infinity Orbs for Reddit review. This document does not authorize a release.

## Readiness snapshot: 2026-10-11

- Observed package version: `1.2.2`; observed main commit before preparation: `5c08bb81c7e0ad3787be572135cf16c82864f9f0`.
- Required runtime: Node.js 24 or newer.
- Release status at this snapshot: **NOT CLEARED TO SHIP**. The available evidence contains no successful current-main preflight/build/playtest result. Failed Actions runs visible at the time are older push-triggered runs with no step-level diagnostics, so they do not prove the current main build fails.
- Known open release-review items: #54/#55 address a reported World Event goal-ceiling mismatch against persisted validation; #53 changes the offline-notification reservation/sending lifecycle. Review them against current `main` and test them before considering the relevant risks resolved. Other open PRs are not automatically required for release; triage each by whether the defect is present on current main.
- This snapshot is historical context. Re-check main, PRs, runs, and live playtest immediately before any release.

## 1. Run the local preflight

Use a clean checkout of the exact commit intended for release. Do not use a stale release branch by accident.

```sh
node --version
# Must report v24.x or newer.
npm ci
npm run preflight
```

The preflight is intended to stop before upload if the Node version is too old, package/lockfile/app names or versions disagree, a forbidden Devvit transaction-read pattern is found, TypeScript checking fails, tests fail, or the Vite/Devvit build fails. A static guard is not a substitute for the actual type-check, test, and build commands passing.

Then verify authentication if a CLI upload/install is expressly authorized:

```sh
npx devvit whoami
```

## 2. Upload and install (separate from publishing)

The CLI deployment path is deliberately explicit. **Do not run it until preflight passes and an authorized release decision has been made.** `npm run deploy` performs preflight and then uploads the app version to Devvit; it does not by itself submit the app for Reddit review.

```sh
npm run preflight
npx devvit whoami
npx devvit upload

EXPECTED_VERSION="$(node -p "require('./package.json').version")"
UPLOADED_VERSION="$(npx devvit view infinity-orbs version)"
test "$UPLOADED_VERSION" = "$EXPECTED_VERSION"

npx devvit install r/infinityorbs "infinity-orbs@$EXPECTED_VERSION"
npx devvit list installs r/infinityorbs

npx devvit install r/infinity_orbs_dev "infinity-orbs@$EXPECTED_VERSION"
npx devvit list installs r/infinity_orbs_dev
```

Record the exact source commit, package version, uploaded version, and the version reported by `npx devvit list installs` for **both** subreddits. Stop if a command reports a different version or partial failure; do not blindly retry an ambiguous install.

The GitHub Actions workflow **Deploy Devvit** has the same two-subreddit side effects. It is manual, refuses non-`main` refs, requests the intended version, and requires `confirm_install=true`. It also requires the `DEVVIT_TOKEN` secret to contain the complete JSON blob from `~/.devvit/token`. Do not dispatch that workflow unless both subreddit installations are intended.

## 3. Submit for Reddit review only when separately authorized

Publishing for review is not the same as uploading a version or installing it on the two subreddits. Use the explicit `Release Infinity Orbs` manual workflow only when review submission is approved. It also refuses non-`main` refs. Enter the exact `package.json` version and set `confirm_publish=true`. The workflow checks version equality, runs preflight, verifies Devvit authentication, submits the requested version, and installs it to both subreddits.

Required GitHub Actions secrets for this workflow:
- `DEVVIT_TOKEN`: complete Devvit token JSON.
- `DEVVIT_SESSION_ID`: corresponding Devvit session ID.

The CLI shortcut `npm run launch` runs `npm run deploy` and then `devvit publish`. Treat it as a release/publish action, not as a harmless build check.

## 4. Minimum checks in a Reddit playtest

Complete these against the candidate version in the development subreddit before treating a source build as release-ready:

- [ ] Splash/inline post opens and **Play** reaches the game entrypoint.
- [ ] A roll returns a server-calculated result; balances and roll counters persist after refresh/reopen.
- [ ] Upgrades, multi-roll, quests/rewards, level progression, mastery/prestige, and shard daily-cap behavior remain valid.
- [ ] Repeated requests, refreshes and reconnects do not duplicate rewards, shares, or claims.
- [ ] Community/World Event progress works near a goal boundary and after the event state is re-read.
- [ ] Offline notification/full-vault scheduled flow handles retry and ambiguous failures without duplicate/stuck notifications.
- [ ] Share/discovery and Frenzy flows show correct actor, cooldown, claim limits, flair, and expiry behavior.
- [ ] Guild actions and leaderboard projections display other players and respect role/permission boundaries.
- [ ] Admin/debug actions reject non-admin users server-side; report action reaches the intended admin flow.
- [ ] Desktop and narrow/mobile layouts have no blocking overflow, blank entrypoints, or stuck overlays.
- [ ] Payments remain disabled (`devvit.json` has `payments: false`); no payment path is enabled as part of deployment prep.
- [ ] `r/infinityorbs` and `r/infinity_orbs_dev` both report the intended installed version after any authorized installation.

For each failure, record a reproducible sequence, current version/commit, expected versus actual behavior, and logs with tokens/player-private data removed.

## 5. Release gate

Do not call the release ready until all of the following are true:

1. The exact target commit passes `npm run preflight` under Node 24+.
2. The P1 current-main release risks have been resolved or explicitly assessed as non-blocking with evidence, especially the World Event goal ceiling and offline-notification lifecycle.
3. A Reddit Devvit playtest passes the relevant smoke checks above.
4. Version/name/lockfile/manifest consistency is confirmed and the uploaded version is checked against the intended package version.
5. The person authorizing release explicitly chooses whether to upload/install both subreddit copies and whether to submit for Reddit review. Those are separate actions.

Never publish or install merely because a checklist was added or a draft PR exists.
