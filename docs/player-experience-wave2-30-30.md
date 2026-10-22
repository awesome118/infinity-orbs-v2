# Infinity Orbs — Wave 2: 30 additional fixes + 30 additional player-experience improvements

Candidate: `v1.2.44`  
Branch: `fix/player-experience-30-bugs-30-improvements-20261020`  
PR: [#107](https://github.com/awesome1184/infinity-orbs-v2/pull/107)

This is a second checklist. It does not repeat the first wave's core tutorial/presence fix or its Rune search work. Several items share an implementation because one robustness change can address multiple related failure modes.

## 30 additional bug fixes and reliability hardening

1. **Combat Energy exceeded its own cap:** normalize Max Energy first, then clamp saved Energy to that normalized maximum.
2. **Combat HP exceeded recalculated Max HP:** clamp saved health after recalculating gear-derived stats, covering legacy gear changes and malformed saves.
3. **Future combat timestamps stalled pacing:** clamp a saved last-accepted beat timestamp to the current server time.
4. **Unbounded combat XP input:** sanitize XP grants to finite, non-negative safe integers.
5. **Combat level requirement overflow:** cap the scaling requirement so repeated level growth cannot overflow safe arithmetic.
6. **Rune XP saturation implied impossible levels:** cap the highest distinguishable Rune level when accumulated XP reaches the safe-integer ceiling.
7. **Invalid daily timestamps crashed date formatting:** `todayKey` now substitutes a safe current timestamp when the supplied time is invalid or outside JavaScript's date range.
8. **Invalid weekly timestamps returned NaN:** `weekStartMs` applies the same valid-date bound.
9. **Partially numeric analytics values were accepted:** impression counters now reject strings such as `12visits` rather than parsing the leading digits.
10. **Unsafe analytics counters leaked through:** malformed, negative, and unsafe-integer counter strings normalize to zero.
11. **Oversized post IDs expanded Redis fields:** impressions with identifiers longer than 200 characters are ignored.
12. **Control characters in post IDs were accepted:** impression recording ignores IDs containing ASCII control characters.
13. **Invalid dashboard time corrupted history buckets:** dashboard generation uses a validated timestamp for every hourly and daily bucket.
14. **Impression index grew without a retention policy:** the index is pruned toward a maximum of 2,000 tracked post records.
15. **Legacy oversized impression indexes could trigger long request stalls:** a pruning sweep deletes at most 250 stale index records; later sweeps continue the cleanup.
16. **Combat requests could hang indefinitely:** client Combat requests now abort after 12 seconds and provide an explicit timeout recovery message.
17. **Malformed successful Combat responses looked like valid empty results:** non-JSON or non-object success responses are rejected with a refresh/retry message.
18. **Frenzy status requests could hang a public post:** reading Frenzy info uses a bounded request.
19. **Frenzy arming could hang the claim flow:** arming has a timeout, and the client does not automatically repeat the mutation.
20. **Frenzy claim responses could hang:** the claim request is bounded and is never automatically replayed after a network error.
21. **A successful-but-unreadable claim response could look like a definite failure:** the UI reloads read-only status and warns that the reward may already have been granted.
22. **Thank-you comment submission could wait forever:** the request is bounded and is not automatically replayed.
23. **Frenzy countdown kept ticking in a hidden view:** its one-second timer pauses when the webview is hidden and resumes on return.
24. **Global and premium booster activations could race:** a synchronous action lock serializes booster activations across both categories.
25. **Premium activation buttons stayed enabled during another booster action:** they now disable for either activation category, closing a rapid double-submit window.
26. **Profile Auto Scrap settings could be submitted twice:** a ref-backed lock prevents overlapping saves.
27. **Generic Combat mutations silently disabled Auto Fight:** action failure still reports the error but no longer overwrites the player's Auto Fight preference.
28. **Gear hover movement caused excess renders:** tooltip position only updates when the pointer has moved a meaningful distance.
29. **Auto Scrap cutoff could change while a save was in flight:** the slider is disabled during save and the save action is disabled when no cutoff change is pending.
30. **Level 1000 UI suggested a nonexistent next level:** the profile now shows a maximum-level state and caps the displayed progress.

## 30 additional player-experience improvements

1. **Armory gear search:** find items without scrolling the full inventory.
2. **Richer gear search:** match names, slots, traits, effects, and Major Ability names/descriptions.
3. **Slot filtering:** narrow gear to Weapon, Chest, Helmet, Gloves, Boots, Ring, or Amulet.
4. **Equipped-only view:** focus on current loadout pieces.
5. **Spare-only view:** find gear that can be equipped or scrapped.
6. **Power sorting:** compare gear by power first.
7. **Quality sorting:** identify the best quality rolls quickly.
8. **Level sorting:** inspect gear from the deepest source floor first.
9. **Newest-first sorting:** keep the inventory's acquisition order available.
10. **Filter result count:** show how many items match and how many are displayed.
11. **Gear no-match state:** explain that filters/search can be cleared when nothing matches.
12. **One-step filter reset:** return search, slot, ownership, and sort controls to defaults.
13. **Filtered pagination:** “Show more” uses the filtered result count instead of the whole inventory count.
14. **Gear inspect-first interaction:** tapping an item opens its details instead of immediately changing equipment.
15. **Dedicated close control:** gear details have a labelled close button.
16. **Escape closes gear details:** keyboard users can dismiss an open gear panel without tabbing through it.
17. **Interactive tooltip semantics:** gear details are exposed as a group because they contain Equip and Scrap buttons.
18. **Less jittery gear details:** pointer position updates are reduced to avoid a constant stream of tiny re-renders.
19. **Arena opponent search:** find an opponent by username or build.
20. **Arena stats search:** numeric rating, level, or best-depth text can help locate an opponent.
21. **Live-player-only roster:** hide synthetic practice bots when looking for real opponents.
22. **Practice-only roster:** isolate the practice bot options for low-risk matches.
23. **Arena rating sort:** order opponents by rating.
24. **Arena level sort:** compare by Delver level.
25. **Arena depth sort:** compare best dungeon depth.
26. **Arena result count:** see how many opponents remain after filters.
27. **Arena reset control:** restore the full roster and default sort in one action.
28. **Arena empty-state guidance:** distinguish an empty roster from a search/filter that matches nothing.
29. **Clearer Auto Scrap saving state:** show “Unsaved quality change” until the selected cutoff matches the saved cutoff.
30. **Accessible progress/controls:** profile XP exposes progress-bar values; Roll toggles expose pressed states; batch breakdown and share actions have clearer accessible labels; motion-sensitive icon/animation classes respect reduced-motion preferences.

## Tests added in Wave 2

- `tests/gameplay-hardening-wave2.test.ts`: combat action scheduling, beat-delay boundaries, gear-quality bounds, Rune XP saturation, invalid calendar timestamps, and deterministic day/week calculations.
- `tests/impressions.test.ts`: invalid impression aggregate counters, out-of-range dashboard times, and excessive post identifiers.

## Validation status

The code and tests have been committed to the candidate branch, but the full test suite and production build have **not** been run locally in this connector session. GitHub Actions has reported the Node 24 preflight as failed; its logs and step details have not been retrievable through the available GitHub API responses. Treat this as an unverified draft candidate until `npm ci && npm run preflight` passes in the Codespace and the updated armory/Arena/Frenzy flows have been playtested.

Nothing in this branch has been merged or deployed.
