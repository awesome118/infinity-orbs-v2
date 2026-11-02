# Infinity Orbs Changelog

### New in 2.2.22

- **Time Energy Live Progress:** Large Time Energy spends now show server-reported Orb counts and a Frenzy-style progress bar. The overlay remains through the durable reward save and reaches 100% only after the save commits.
- **Guild Collection Value Scaling:** Collection Value Guild Tasks now rise much more aggressively, reaching approximately 1.5e85 at Tier 100. Existing tasks migrate to the new target curve without discarding saved progress.
- **Mobile Combat Skill Details:** Tapping a Combat Skill Gacha icon on mobile opens a readable detail sheet with the full effect, rarity, rank, duplicate progress, and equip action.

### New in 2.2.12

- **Redis Storage Protection:** Leaderboard projections now refresh at most once per player per minute, and duplicate or stale callbacks are skipped. Retired shared large-value snapshots expire after 60 seconds instead of 10 minutes.
- **Guild Data Compatibility:** Fixed production Guild validation so current Guild records without the retired level and XP fields load correctly.


### New in 2.2.3

- **Auto Roll Cooldown Reliability:** Fixed Auto Roll occasionally retrying too early at very high speeds. It now waits for the server-reported remaining cooldown before trying again.
- **Sonar Ping Menu:** Removed the duplicate Record alerts summary. Near-best and new-record trigger settings remain in the Sonar Ping options.

### New in 2.2.2

- **Time Energy Generation:** Cooldown Reclaimer now earns 1% of your current roll cooldown per level with each normal manual or Auto Roll activation, including at the 300ms cooldown floor. Free Rolls, Chain Patcher rolls, and Time Energy-powered rolls do not generate more energy.

### New in 2.2.0

- **Celestial Alignments:** Unlock a rare event and choose one of three temporary effects within 60 seconds: Starseeker raises ordinary Luck, Golden Orbit grants +50% Coins, or Clockwork makes Auto Roll 20% faster. Each chosen effect lasts 2 hours and stacks independently with earlier activations, with its own countdown.
- **Time Energy Bank:** Time Energy banks recovered roll cooldown and can fund multiple complete manual or Auto Rolls. Unused partial energy carries forward.
- **Sonar Ping Controls:** Choose whether Sonar pings on non-record Orbs within 10% of your current best or only on a new record. You can also allow Celestial Alignment sounds while Sonar is blocking other sounds.
- **Three New Rune Rarities:** Astral, Celestial, and Transcendent Runes now extend the Rune rarity ladder beyond Cosmic.
- **Rarity-Scaled Rune Abilities:** Higher-rarity Runes now grant stronger Rune Major Abilities, and Rune details show the rarity-scaled effect strength.
- **Guild Task and Combo Progress:** Rare-Orb Guild tasks count every qualifying Orb earned, including rewards from large Multi Rolls. Guild Combos show the time remaining compared with the total time you earned.
- **Rarity Milestone Orbs:** Collection milestones and the rarity table now use recognizable, rarity-colored Orb icons, with a glow for tiers you have discovered.
- **Responsive Orb Results:** Orb results now fit the screen: fullscreen displays use 9 Orbs per row, while mobile displays use 3 across. Game and Combat screens also adapt more cleanly to phones, tablets, and desktop.
- **Faster Mobile Gear Equipping:** Unequipped Gear items on mobile now have an Equip button right on the inventory card, so you do not need to open the item inspector first. Desktop Gear tiles are more compact.
- **Upgraded Main-Game Post:** The in-feed game preview has a larger animated infinity-orb energy field, with Continue playing anchored at the bottom of the card.
- **Frenzy Claim Activity:** Embedded Frenzy posts now show the claim count and the five most recent players who claimed that Frenzy.

### New in 2.0.0

- **Major feature — Combat Mode:** Added Combat as a separate game mode, unlocked at Core Level 8, with a guided introduction and its own progression.
- **Major feature — Three Expeditions:** Added Undercrypt, Cinder Vault, and Glass Labyrinth. Each dungeon tracks its own best depth and has a boss every tenth depth.
- **Major feature — Dungeon Runs:** Added automatic dungeon runs, selectable combat tactics, manual actions, persistent health between encounters, and new-run resets.
- **Major feature — Gear, Forge & Abilities:** Added seven gear slots, randomized gear stats and traits, quality rolls, nonlinear gear power, the Forge, Scrap, and 30 Gear Major Abilities.
- **Major feature — Combat Skill Gacha:** Added 35 active skills. Duplicate skills increase ranks, making repeated pulls useful.
- **Major feature — Arena:** Added asynchronous player-build battles against recently active players, with rating and win/loss records.
- **Major feature — Rune System:** Added seven Rune rarities, from Common through Cosmic. Monsters drop Runes; bosses always drop one and elites have improved drop odds.
- **Major feature — Rune Loadouts:** Rune loadouts improve core-game Orb Luck, Coins, Shard chance, and XP. Unlock more Rune slots through Delver levels and dungeon depth, then strengthen Runes by sacrificing duplicates or enabling Auto Sacrifice.
- **Core game — Push Notification Opt-In:** Added a one-time push notification prompt. Notifications stay off unless enabled, and the prompt explains the limited alerts and the bell control for changing the setting later.
- **Core game — First-Roll Tutorial:** Added a first-roll tutorial that introduces rolling an Orb, the result screen, Upgrades, and the Codex. It can be skipped at any time.
- **Core game — Aftershock:** Added Aftershock, a Mastery skill that provides Critical Luck based on the best dry interval between successive all-time rarity records.
- **Core game — Unbroken Momentum:** Added Unbroken Momentum, a Prestige upgrade that grants permanent roll Speed based on the longest uninterrupted online rolling session.
- **Core game — Codex Devotion:** Updated Codex Devotion to show its current Luck bonus and the bonus from the next level.
- **Core game — Chain Patcher:** Added Chain Patcher to the Codex. It guarantees the cheapest missing rarity adjacent to the longest consecutive Codex chain on the next accepted roll, for a Shard cost and with a 24-hour purchase cooldown.
- **Core game — Shared Orb Frenzies:** Shared Orb Frenzies can be claimed by multiple different players during the post’s lifetime. Each player still has their own claim cooldown.
- **Core game — Rune Inventory Improvements:** Added Rune inventory search, equipped filters, level and XP progress, capacity warnings, and clearer Strengthen and Auto Sacrifice controls.
- **Core game — Global Chat & Player Sessions:** Improved Global Chat status messaging when posting is unavailable and added active-session length to the player list.
- **Core game — Main-Game Visual Feedback:** Made the first dozen rolls easier to spot with a brighter Orb stage, a clear first-roll action, and a restrained pulsing Roll button. Newly discovered Orbs receive a short visual highlight; reduced-motion preferences are respected.
- **Core game — Post Previews & Play CTA:** Revamped main-game, shared-Orb, and Frenzy previews with animated Orb visuals and a glowing, pulsing Play button that makes starting the game unmistakable.
- **Core game — Frenzy Reward Reveal:** Reworked Frenzy rewards into a full animated Orb reveal with orbiting effects, visible personal claim cooldowns, post-expiry timer, and a persistent Play button. Main-game and shared-Orb posts now feature animated Orb energy effects.
- **Core game — Frenzy Roll Payouts:** Frenzies now grant ordinary random Orb rolls instead of guaranteeing the posted Orb rarity. Payouts use the full Multiball multiplier, with Frenzy Volley adding a separate +20% bonus; the post shows your exact personal roll count.
- **Core game — Infinity Overflow:** Rolls whose calculated rarity exceeds JavaScript’s largest finite number now display as 1/Infinity. The finite 1.797693e308 rarity remains a numeric rarity.
- **Balance change — Repeatable Upgrade Costs:** Unlimited repeatable core-game upgrades cost 15% more; capped Roll Speed and Offline Generation Speed keep their existing cost curves.
- **Balance change — Supernova Critical Scaling:** Supernova now multiplies the normal critical multiplier instead of replacing it, so it remains powerful as Critical upgrades grow.
- **Balance change — Mastery Engine Removed:** Mastery Engine has been removed for balancing purposes.
- **Bug fix — Notification Prompt:** Fixed the one-time push notification prompt for returning players.
- **Bug fix — Silent Alert Mode:** Fixed Silent Alert Mode’s toggle becoming out of sync with the active sound mode.
- **Bug fix — Combat Encounter Effects:** Fixed encounter effects carrying into a new run.
- **Bug fix — Shared Orb Previews:** Fixed shared Orb previews rejecting valid large rarity values.
- **Bug fix — Leaderboard Recovery:** Kept older shared-Orb leaderboard entries visible when legacy records are missing account IDs.
- **Bug fix — Frenzy Claims & Post Performance:** Fixed Frenzy claims so the main game consumes the armed handoff and plays the reward-batch reveal; centered orbit rings, smoothed their rotation, reduced shared-Orb glow, and kept skill details open long enough to equip abilities.
- **Bug fix — Rune Controls:** Fixed Rune controls so Equip, Strengthen, and Auto Sacrifice actions no longer conflict when used in quick succession.
