# Infinity Orbs MVP

## Included

- Server-authoritative 10-second rolling loop.
- Weighted Orb rarity table from 1/2 through 1/1,000,000.
- Coins and XP progression.
- Speed, Multi Roll, Luck, and Auto Roll upgrades.
- Auto Roll unlock requirement: 10 total rolls, designed for the first few minutes.
- Persistent collection counts and Collection Value.
- Guild creation/joining with contribution, XP, levels, and Guild Tokens.
- Player leaderboard and top-guild leaderboard.
- Achievement tracking.
- Manual Reddit share draft for notable Orb drops.

## Deliberate MVP constraints

- Player identity uses a stable Reddit user ID-derived display name until the Reddit username API is wired in.
- Leaderboards and guilds are stored as JSON documents in Redis for the first prototype. A later scale pass should migrate leaderboard ranking to Redis sorted sets and introduce atomic updates.
- Guild departure, officer management, guild challenges, cosmetics, premium currency, and automated Reddit event posts are reserved for the next passes.
