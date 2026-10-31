# Infinity Orbs Changelog

### Frenzy 503 Request-Load Reduction (2.1.24)

- Process up to 2.5 million effective Frenzy Orbs in one weighted roll pass, capped at 25,000 representative samples per pass.
- Preserve the full effective roll count and weighted rewards while avoiding five separate 500,000-Orb roll setups for a 2.5 million claim.
- Add a regression test verifying the 2.5 million sample plan conserves every effective Orb.


### Large Frenzy Stack-Safety Fix (2.1.23)

- Replace spread-based minimum/maximum calculations over rarity samples with an iterative scan, preventing call-stack errors on large Frenzy claims.
- Add regression coverage for 100,000 rarity samples and empty input.


### Weighted Large-Batch Rolling (2.1.21)

- Compress large online Multi Roll and Frenzy batches to at most 50,000 weighted representative samples per 500,000 effective Orbs, plus up to three exact starter-guarantee Orbs.
- Apply the squared sample-weight Luck factor (10× fewer representatives use 100× base Luck), while accounting for the critical/Supernova mix in the group maximum and weighting Coin, XP, collection, lifetime roll, and progress totals across every effective Orb.
- Keep offline-vault batches on their existing exact processing path and preserve the first three guaranteed new-player Orbs.
- Report Frenzy progress from effective Orbs processed; smooth the calculating popup's count between authoritative updates without exceeding the server-calculated target.
- Add regression coverage for weighted sample plans, batch caps, and live Frenzy progress.

### Guild Polling Regression Coverage (2.1.20)

- Align background-polling regression checks with independent Guild and world-event request locks.
- Keep regression coverage for conservative Guild data recovery and retryable load errors.

### Guild Recovery and Polling Reliability (2.1.19)

- Recover malformed non-authoritative Guild task, perk, combo, challenge, chat, and temporary boss data before strict validation. Guild IDs, member IDs, and member roles remain strict.
- Poll Guild data independently from world-event requests so a slow or unavailable event endpoint cannot block Guild refreshes.
- Preserve the last valid Guild snapshot on load failures and expose retry diagnostics.

### Finite-Range Coins and Live Frenzy Progress (2.1.18)

- Removed the safe-integer ceiling from Coin balances, lifetime Coins, Coin rewards, and collection value; these values now use the full finite JavaScript Number range through approximately 1.7977e308.
- Kept safe-integer protections for Shards, timestamps, roll counts, and other discrete counters.
- Updated roll aggregation, Guild tax, achievement rewards, and Altar spending to preserve large Coin balances.
- Replaced the Frenzy popup's vague spawning message with a live progress bar backed by server updates after each 5,000-roll batch.

### Combat Turn Timer Upgrade (2.1.17)

- Removed the Chrono Surge base-timer explanation from the turn-order panel.
- Added a 10-rank Turn Timer Combat Shop upgrade that reduces the global 30-second beat interval by one second per rank.
- Turn Timer reductions stack with equipped Chrono Surge; server cooldown validation and the client countdown share the same interval.
- Added tests for timer reductions, Chrono Surge stacking, and exponential pricing across every Combat Shop upgrade.

### Frenzy Calculating Overlay (2.1.16)

- Slow Frenzy claims show a full-screen calculating popup after a brief delay, avoiding a flash for normal fast claims.
- Animate Orbs spawning in rapid bursts during processing, keep the popup visible briefly after a slow response, and respect reduced-motion preferences.
- Add regression coverage for the delayed popup, rapid Orb animation, and cleanup path.

### Coin Display, Guild Loading, and Chrono Surge (2.1.15)

- Display large Coin balances and rewards in exponential notation using the shared number formatter; the stored Coin balance and economy rules are unchanged.
- Fix Guild data refresh so it runs independently of the world-event request, preserves the last successful snapshot on failures, and offers an explicit retry with the server error visible.
- Make Chrono Surge shorten the actual combat beat timer consistently in the server cooldown check, visible countdown, and Auto Fight scheduler.

### Frenzy Poster Reward (2.1.14)

- Increased the Frenzy poster reward from 5 to 100 Shards for each successful claim.
- The reward is credited to the player who posted the Frenzy, not the claimant, in the same atomic claim settlement.
- Added regression coverage for the payout amount and the owner-directed reward path.

### Uncapped Luck-to-Rarity Scaling (2.1.13)

- Replaced the 25× capped Luck factor with square-root scaling, so extremely high displayed Luck continues to affect every roll with diminishing returns.
- Added a dedicated Rarity Scaling readout that shows the effective Luck curve and combined level scaling.
- Added regression tests for the reported 5.3027e21 Luck range and removal of the hard cap.

### Rarity Release Corrections (2.1.12)

- Updated continuum regression checks for the explicit linear-level argument.
- Expanded the nine new rarity name pools to fourteen unique names each.
- Made endgame threshold-ratio tests tolerant of floating-point representation.


### Level-Scaled Rarity Update (2.1.11)

- Made player level a direct linear multiplier on Orb rarity; Luck remains a separate diminishing-return factor, without counting the old +1% per-level base twice.
- Added nine endgame rarity tiers from Empyrean through Omega. New tier thresholds jump by 100×, beginning at 1e19.
- Staged the Codex rarity list: tiers 10–18 appear after discovering a 1/1,000,000 Orb, and the nine new tiers appear after discovering a 1e15 Orb.
- Added explicit unlock hints and brighter rarity-table/level-scaling UI treatments.


### Major New Features:

- Added a Level 5 subreddit invitation with a one-time reward of 100 stored Free Rolls.
- Added admin popup toggles and analytics for notification, Frenzy, and subreddit-invite displays, acceptances, dismissals, and acceptance rate.
- Fixed popup analytics to refresh while the Admin Console is open, expose tracking/load errors, and exclude u/shadow_fen from player-facing metrics.


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
- Added a restrained early-game spotlight: a brighter Orb stage, a clear first-roll action, a gently pulsing Roll button, and a brief highlight when a new Orb is discovered. Reduced-motion settings are respected.
- Reworked Frenzy rewards into a full animated Orb reveal with orbiting effects, personal claim cooldowns, post-expiry timer, and a persistent Play button. Main-game and shared-Orb posts now feature animated Orb energy effects.
- Frenzies now grant a viewer-specific batch of ordinary random Orb rolls. Payouts use the full Multiball multiplier, with Frenzy Volley adding a separate +20% bonus; the post shows the exact personal payout count without the former 50,000-roll cap.
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
