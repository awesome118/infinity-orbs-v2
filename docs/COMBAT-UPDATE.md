# Infinity Orbs Combat Expansion

## Product direction
Combat is a mode inside Infinity Orbs, not a separate app or a replacement for orb rolling. The menu-bar Combat control switches between the core menu and a combat menu. In combat mode the core Roll button is replaced by Fight, with Dungeons, Gear, Skills, and Arena navigation. The mode control glows chartreuse while active. Combat visuals use the Auto-Dungeons charcoal, bone, chartreuse, and copper palette.

## First playable slice
- Server-authoritative Undercrypt combat resolves in discrete one-second beats. Auto tactics (Balanced, Aggressive, Defensive, Recovery) choose commands from current health and energy on the server; a manually queued Strike, Heavy, Guard, or Mend overrides the next automatic beat once.
- Auto-run is the default; Pause, Auto toggle, manual Next Beat, and Strike / Heavy / Guard / Mend selection are available.
- Speed controls actions resolved per beat. Presentation timing is not a combat stat.
- Health persists between encounters. Death restarts the push at Depth 1, while best depth, gear, skill ranks, combat level, and Delver Coins persist.
- Three expedition choices: Undercrypt (balanced, Warden clears improve orb Luck), Cinder Vault (tougher enemies, +10% player damage, +40% coins, more gear drops), and Glass Labyrinth (lower enemy HP, faster/harder enemies, +35 Speed, +5 percentage points crit chance, +25% combat XP). Each dungeon stores its own best depth and has its own boss every tenth depth.
- Gear has weapon and armor slots, randomized names / quality / stat-bearing powers, and active traits: bleed, critical affinity, first strike, damage reduction, elite healing, and low-health Speed.
- Gear quality uses the Auto-Dungeons-style 0.00–100.00% fourth-power roll; 100% is intentionally extremely rare.
- Skill gacha has 25 passive skills: five per rarity. Duplicate copies rank skills up to Rank 5; every rank has an explicit numeric effect. Excess copies at rank cap convert into a partial Delver Coin refund.
- Combat state is separate from the main rolling save and uses Redis WATCH/MULTI/EXEC to reject concurrent stale writes. Auto-combat therefore doesn't rewrite Infinity Orbs player state every second. On entering combat, core-game level and highest-orb rarity are refreshed into the combat snapshot: every 10 core levels adds +2% combat damage and max HP (up to +20%), and each order of magnitude in highest orb rarity adds +0.3% (up to +5%).
- Every cleared Crypt Warden grants +1% effective Luck to core orb rolls, capped at +25% after 25 bosses. The bonus is derived from separate combat progress and does not rewrite the main rolling save.
- Arena supports asynchronous player-build challenges: opponents are real recently active players, battles resolve from server-saved gear and skills, and both players receive Elo-style rating / record updates. It never fills the board with fake accounts.

## Follow-up layers
This slice includes PvE and asynchronous player-build PvP with passive combat skills. Active skills and automatic trigger rules, live simultaneous PvP, additional dungeon choices, and the wider coin-upgrade rework remain future slices. Do not claim those are implemented until they exist. Keep all damage, rewards, drops, skill rolls, and gear generation server-owned.


## Gear Levels and Major Abilities

Gear cards now display the item's **Level** instead of "Dropped Floor". Existing saved gear still stores the same zero-based `sourceFloor` field internally; the UI presents it as a 1-based level so existing inventories remain compatible.

The Major Ability pool now contains 30 abilities. Alongside Second Dawn, Chrono Surge, Void Edge, Aegis Ward, Starfall, and Mark Harvest, gear can roll Titan's Heart (max HP), Blood Drinker (lifesteal), Executioner's Sigil (finisher damage), Emberwake (bonus burn hits), Mirrorplate (damage reflection), Last Bastion (low-health defense), Critical Mass (critical damage), Orb Conduit (Orb damage), Soul Harvest (kill healing), Salvager's Touch (Scrap gain), Rune Savant (Rune drops), Bossbreaker (boss damage), Echo Fang (bonus strikes), Phase Shift (evasion), Blood Moon (low-health damage), Deep Roots (level scaling), Frostbrand (damage reduction), Aegis Pulse (shield after hits), Glass Cannon (damage traded for vulnerability), Fortune Engine (Combat Marks on critical hits), Unending Ward (kill shields), Full Moon (full-health critical chance), Unstable Singularity (random burst damage), and Genesis Core (per-beat regeneration).

Major Ability effects are calculated from equipped gear and its current quality effectiveness. Existing saved item fields are retained for compatibility.
