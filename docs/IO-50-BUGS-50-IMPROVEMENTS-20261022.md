# Infinity Orbs 1.2.45 — 50 bug fixes and 50 improvements

**Candidate branch:** `fix/io-1.2.45-50-bugs-50-improvements-20261022`  
**Scope:** gameplay state, requests/retries, moderation/reporting, admin analytics, inline post view-mode compliance, accessibility, and mobile interaction.

This is a source-audit ledger of the changes made for this candidate. Regression tests were added, but the repository test suite, TypeScript check, build, browser rendering, and Reddit-hosted device checks have not been executed in this session. Do not treat static assertions as a runtime pass.

## 50 bug and failure-path fixes

1. `src/server/combat.ts`: present blank or invalid combat saves fail closed instead of silently becoming a new starter save.
2. Combat-save JSON roots that are arrays, primitives, or otherwise non-records are rejected.
3. Unknown-only persisted objects are not accepted as valid Combat state.
4. An intentionally empty gear inventory stays empty after reload.
5. A present but malformed inventory field no longer looks like a legacy save with no inventory.
6. Explicitly empty equipment slots no longer silently re-equip starter weapon or armor.
7. Combat tutorial completion reads use the same fail-closed save parser as normal Combat reads.
8. Rune equip requests reject non-boolean toggle intent instead of converting malformed strings into unequip requests.
9. Skill equip requests reject non-boolean toggle intent for the same reason.
10. Non-finite Rune slot unlock inputs cannot unlock additional slots.
11. Unknown Rune rarity/stat inputs no longer propagate invalid or non-finite values into Rune bonuses.
12. Unknown Rune rarities cannot contaminate sacrifice XP calculations.
13. Run reset paths clear stale last-attack state used by delayed-damage/Afterimage effects.
14. Switching dungeons clears pending healing instead of carrying it into a fresh encounter.
15. Dungeon switches clear Burn and armor-break timers.
16. Dungeon switches clear shields and delayed-damage queues.
17. Dungeon switches clear execute marks, evasion flags, and Phoenix one-shot flags.
18. Dungeon switches clear queued kill rewards, Rune-drop modifiers, Royal Tithe counters, and bounty streaks.
19. `src/server/social.ts`: Guild identifiers no longer use predictable `Math.random` fallbacks.
20. Global Chat receipts no longer use weak pseudo-random tokens.
21. Chat-report reservation IDs no longer use weak pseudo-random tokens.
22. `src/server/app.ts`: mutation-lock owner IDs use cryptographic identifiers.
23. Feedback cooldown receipts use cryptographic identifiers.
24. Offline-job and notification reservations use cryptographic identifiers.
25. Follow-reward idempotency markers use cryptographic identifiers.
26. Frenzy comment/claim reservation tokens use cryptographic identifiers.
27. `src/client/main.tsx`: non-retryable HTTP responses are not retried as though they were transient network failures.
28. Rune UI mutations are serialized so an older response cannot overwrite a newer loadout.
29. Rune requests time out and report an actionable timeout message.
30. Combat Auto Scrap setting writes wait for an active beat before saving.
31. Individual upgrades, Upgrade All, and Turbo cannot overlap in the Upgrades panel.
32. Mastery upgrade clicks are serialized to prevent duplicate purchases.
33. Altar offerings and combined Altar/Mastery actions share an in-flight lock.
34. The Devotion Altar disables submit when selected offers exceed current balances.
35. The combined Altar checks the current Coin and Shard balances before a request.
36. Altar failures are caught and surfaced instead of becoming unhandled rejected submit promises.
37. Profile Auto Scrap saves now have a request timeout.
38. Auto Scrap cutoff values and returned settings are validated before updating local state.
39. Guild chat-report failures are shown to the player instead of being console-only.
40. Guild chat-report requests time out so the report button cannot stay in a sending state indefinitely.
41. Guild task progress handles malformed/non-positive targets and non-finite progress safely.
42. Codex collection responses are shape-checked before being written to UI state.
43. Codex pagination is clamped when refreshed data shrinks the available page count.
44. Reddit Share submission is locked against rapid duplicate clicks.
45. Share dialogs cannot be dismissed while Reddit is still confirming an external post.
46. Achievement reward claims are serialized and report failure to the player.
47. Feedback submission is guarded against duplicate clicks.
48. Feedback controls cannot change or close while a submission is in flight.
49. Daily, weekly, and Daily Streak claim actions share a lock and surface claim failures.
50. Global Booster activations are serialized and no longer fail silently in the Boosters UI.

## 50 player and admin experience improvements

1. Inline launch posts have an explicit inline-safe document/root class.
2. Inline document, body, root, and public-card surfaces allow native vertical panning.
3. Inline post surfaces allow pinch zoom without swallowing feed gestures.
4. Inline public shells use clipping rather than creating their own scroll container.
5. The full game is opened by a clear user click through `requestExpandedMode`.
6. The default post preview is constrained to a tall, bounded layout.
7. Shared-Orb previews use a compact side-by-side Orb-and-summary layout.
8. Shared-Orb stat cards fit into a short three-column row.
9. Public-post rarity text scales to the number of digits so large rarities fit.
10. The Frenzy Orb illustration is smaller in the inline view.
11. Frenzy instructional copy is shorter and more feed-friendly.
12. Frenzy status, metadata, and buttons use less vertical spacing.
13. Successful inline fallback claims show a compact receipt rather than a long modal.
14. The claim receipt gives a direct Continue in Infinity Orbs action.
15. The claim receipt includes a link back to the Reddit post for an upvote.
16. Scrollable Global Chat was removed from the inline Frenzy entrypoint.
17. The long fallback thank-you dialog was removed from the inline Frenzy path.
18. A release preflight guard checks inline HTML root markers.
19. Preflight scans inline TSX for wheel/touch/pointer event interception.
20. Preflight rejects inline TSX with nested `overflow:auto/scroll` panels.
21. Preflight scans public-card CSS for nested scroll containers.
22. Preflight rejects `touch-action:none` or non-vertical gesture rules in public cards.
23. Preflight rejects `overscroll-behavior:none/contain` on inline public surfaces.
24. Dedicated fixtures test root/document gesture locks and nested public-card scroll traps.
25. A reviewer QA document lists real-feed checks for web, Android, and iOS.
26. Rune inventory supports text search across name, rarity, stat, and Major Ability.
27. Rune inventory can show only equipped Runes.
28. Rune inventory can show only unequipped Runes.
29. Rune filters have a one-click clear action.
30. Rune inventory shows both owned count and filtered result count.
31. Full Rune capacity displays a warning before new loot is lost.
32. Auto Sacrifice explains when no equipped Rune is available as a target.
33. Rune XP displays a level-progress bar.
34. Manual Strengthen warns before consuming an equipped Rune.
35. Rune controls expose pressed/selected state to assistive technology.
36. Rune tooltips are linked to their triggering controls with stable IDs.
37. Rune refresh announces its loading state and disables duplicate refreshes.
38. Gear inspection on touch devices can reveal details before equipping.
39. Gear detail popovers expose accessible state and names.
40. Combat recovery uses alert roles and clearer retry labels.
41. Mastery and Altar visuals respect reduced-motion preferences.
42. Upgrades confetti respects reduced-motion preferences.
43. Mastery, Altar, and upgrade feedback timers are cleaned up or replaced instead of being left stale.
44. Daily Streak shows zero after a missed day rather than previewing an unbroken streak.
45. Quest progress calculations are clamped and exposed as accessible progress bars.
46. Guild task progress uses an accessible progressbar with a readable label.
47. Global Chat closes with Escape and exposes message history as a live log.
48. Global Chat network requests have a timeout and a labelled message input.
49. Admin impression analytics validate response shape, time out, and prevent overlapping refreshes.
50. The changelog and this audit ledger document the inline compliance work and the broader reliability/player-experience changes.

## Release readiness

- Version metadata is aligned to **1.2.45** in `package.json`, `package-lock.json`, and `src/shared/version.ts`.
- Regression coverage was added in `tests/audit-hardening-regressions.test.ts`, `tests/combat-security-regressions.test.ts`, `tests/combat-runes.test.ts`, and `tests/predeploy-check.test.ts`.
- The implementation is not deployed or published.
- The candidate still needs `npm run preflight` on Node.js 24+ and real-feed gesture checks in the Reddit web, Android, and iOS clients before resubmission. Scroll compliance must be verified in the actual Reddit host, not inferred solely from CSS or source tests.
