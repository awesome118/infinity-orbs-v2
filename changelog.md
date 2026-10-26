# Infinity Orbs Changelog

### Major New Features:

- Added Combat as a separate game mode, unlocked at Core Level 8, with a guided introduction and its own progression.
- Added three expeditions: Undercrypt, Cinder Vault, and Glass Labyrinth. Each dungeon tracks its own best depth and has a boss every tenth depth.
- Added automatic dungeon runs, selectable combat tactics, manual actions, persistent health between encounters, and new-run resets.
- Added seven gear slots, randomized gear stats and traits, quality rolls, nonlinear gear power, the Forge, Scrap, and 30 Gear Major Abilities.
- Added the Combat Skill Gacha with 35 active skills. Duplicate skills increase ranks, making repeated pulls useful.
- Added the Arena for asynchronous player-build battles against recently active players, with rating and win/loss records.
- Added seven Rune rarities, from Common through Cosmic. Monsters drop Runes; bosses always drop one and elites have improved drop odds.
- Added Rune loadouts that improve core-game Orb Luck, Coins, Shard chance, and XP. Unlock more Rune slots through Delver levels and dungeon depth, then strengthen Runes by sacrificing duplicates or enabling Auto Sacrifice.

### Combat Changes:

- New Delvers begin without gear, relying on modest base damage, health, and Speed until they earn equipment.
- Increased the base costs of permanent Combat upgrade ranks while preserving their scaling between ranks.
- Gear now displays its obtained level instead of a dropped-floor label.
- Higher gear qualities provide substantially more power; top quality grades are rarer, and 100% quality gear has five times the depth baseline stat budget.
- Scrap rewards scale with gear power and dungeon depth, making salvaging a useful path toward forging stronger equipment.
- Added Rune Major Abilities that can modify Rune effects or trigger bonus rolls, record rewards, Shards, and other effects in the main game.
- Boss clears across all three dungeons grant a permanent core-game Luck bonus of (1.01^n − 1); it self-stacks across total boss clears and adds to other Luck sources, with no fixed 25-boss cap (subject to maximum dungeon depth).
- Undercrypt, Cinder Vault, and Glass Labyrinth now have distinct combat profiles and reward bonuses.

### Core Game Changes:

- Added a one-time push notification opt-in prompt. Notifications remain off until enabled, and the prompt explains the limited alerts and how to change the setting later.
- Added a first-roll tutorial that introduces rolling an Orb, the result screen, Upgrades, and the Codex. It can be skipped at any time.
- Added Aftershock, a Mastery skill that provides Critical Luck based on the best dry interval between successive all-time rarity records.
- Added Unbroken Momentum, a Prestige upgrade that grants permanent roll Speed based on the longest uninterrupted online rolling session.
- Updated Codex Devotion to show its current Luck bonus and the bonus from the next level.
- Added Chain Patcher to the Codex. It guarantees the cheapest missing rarity adjacent to the longest consecutive Codex chain on the next accepted roll, for a Shard cost and with a 24-hour purchase cooldown.
- Shared Orb Frenzies can be claimed by multiple different players during the post's lifetime. Each player still has their own claim cooldown.
- Added Rune inventory search, equipped filters, level and XP progress, capacity warnings, and clearer Strengthen and Auto Sacrifice controls.
- Improved Global Chat status messaging when posting is unavailable and added active-session length to the player list.
- Updated the in-feed Game, shared-Orb, and Frenzy previews to fit Reddit's inline view; longer interactions open in Expanded Mode.
- Reworked Frenzy rewards into a full animated Orb reveal with orbiting effects, personal claim cooldowns, post-expiry timer, and a persistent Play button. Main-game and shared-Orb posts now feature animated Orb energy effects.
- Rolls whose calculated rarity exceeds JavaScript's largest finite number now display as **1/Infinity**. The finite `1.797693e308` rarity remains a numeric rarity.

### Balance Changes:

- Unlimited repeatable core-game upgrades cost 15% more; capped Roll Speed and Offline Generation Speed keep their existing cost curves.
- Supernova now multiplies the normal critical multiplier instead of replacing it, so it remains powerful as Critical upgrades grow.
- Removed Mastery Engine.

### Bug Fixes:

- Fixed Frenzy post claims bypassing the main-game reward animation and made expanded-game Frenzy lookups follow the armed handoff when post context changes.
- Centered Orb rings using their full transforms, restored smooth motion to all three main-game-post rings, and softened the shared-Orb glow.

- Fixed the one-time push notification prompt for returning players and added safe Frenzy and notification popup previews to the admin console.
- Fixed Silent Alert Mode's toggle becoming out of sync with the active sound mode.
- Fixed encounter effects carrying into a new run.
- Fixed shared Orb previews rejecting valid large rarity values.
- Kept older shared-Orb leaderboard entries visible when legacy records are missing account IDs.
- Fixed Rune controls so Equip, Strengthen, and Auto Sacrifice actions no longer conflict when used in quick succession.
