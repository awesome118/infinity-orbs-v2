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

- Gear now displays its obtained level instead of a dropped-floor label.
- Higher gear qualities provide substantially more power; top quality grades are rarer, and 100% quality gear has five times the depth baseline stat budget.
- Scrap rewards scale with gear power and dungeon depth, making salvaging a useful path toward forging stronger equipment.
- Added Rune Major Abilities that can modify Rune effects or trigger bonus rolls, record rewards, Shards, and other effects in the main game.
- Clearing a Crypt Warden permanently adds 1% effective Luck to core Orb rolls, up to 25%.
- Undercrypt, Cinder Vault, and Glass Labyrinth now have distinct combat profiles and reward bonuses.

### Core Game Changes:

- Added a first-roll tutorial that introduces rolling an Orb, the result screen, Upgrades, and the Codex. It can be skipped at any time.
- Added Aftershock, a Mastery skill that provides Critical Luck based on the best dry interval between successive all-time rarity records.
- Added Unbroken Momentum, a Prestige upgrade that grants permanent roll Speed based on the longest uninterrupted online rolling session.
- Updated Codex Devotion to show its current Luck bonus and the bonus from the next level.
- Added Chain Patcher to the Codex. It guarantees the cheapest missing rarity adjacent to the longest consecutive Codex chain on the next accepted roll, for a Shard cost and with a 24-hour purchase cooldown.
- Shared Orb Frenzies can be claimed by multiple different players during the post's lifetime. Each player still has their own claim cooldown.
- Added Rune inventory search, equipped filters, level and XP progress, capacity warnings, and clearer Strengthen and Auto Sacrifice controls.
- Improved Global Chat status messaging when posting is unavailable and added active-session length to the player list.
- Updated the in-feed Game, shared-Orb, and Frenzy previews to fit Reddit's inline view; longer interactions open in Expanded Mode.
- Extended the rarity ceiling to the largest finite number JavaScript can represent. The cap is displayed as **Infinity**.

### Balance Changes:

- Supernova now multiplies the normal critical multiplier instead of replacing it, so it remains powerful as Critical upgrades grow.
- Removed Mastery Engine.

### Bug Fixes:

- Fixed encounter effects carrying into a new run.
- Fixed Rune inventory actions so overlapping Equip, Strengthen, and Auto Sacrifice requests do not race each other.
- Fixed shared Orb previews rejecting valid large rarity values.
- Fixed Rune controls so Equip, Strengthen, and Auto Sacrifice actions no longer conflict when used in quick succession.
