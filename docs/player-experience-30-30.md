# Infinity Orbs — 30 bug fixes + 30 player-experience improvements

Candidate branch: `fix/player-experience-30-bugs-30-improvements-20261020`  
Candidate version: `1.2.44`

This checklist describes implemented changes in this branch. Several improvements also prevent correctness problems, so there is intentional overlap between the two lists.

## 30 bug fixes and reliability hardening

1. **Preview CCU inflation:** `GET /api/me` no longer calls the presence-touch path that counted a viewer as an online player.
2. **Preview activity registration:** state reads now call `loadRaw({ registerActivity: false })`, so splash rendering does not create activity registrations.
3. **Banned-account preview registration:** the game-ban read path also avoids registering activity.
4. **Pre-Play heartbeat:** the client heartbeat starts only after the player enters the actual game.
5. **Pre-Play presence polling:** the online counter is not polled while the splash is still showing.
6. **Tutorial lost across sessions:** first-roll tutorial completion is stored in Redis per Reddit account.
7. **Tutorial flash on reload:** the tutorial UI waits until its persistent completion status is checked.
8. **Tutorial request can hang:** first-roll and combat tutorial status requests are bounded by a timeout.
9. **Incorrect GET retries:** generic request handling no longer treats every HTTP response failure as a retryable network failure.
10. **Stale state overwrites:** equal-revision response protection now compares several player-progress and wallet fields, not only Shards.
11. **Toast races:** each new toast clears the previous hide timer, so an older timer cannot prematurely dismiss it.
12. **Toast timer cleanup:** the outstanding toast timer is cleared when the app unmounts.
13. **Wrong Turbo duration copy:** the success toast reports 60 minutes when Chrono Overdrive grants the longer duration.
14. **Stale world-event banner:** a valid `null` response clears a previously displayed event.
15. **Stale developer announcement:** an empty announcement clears old text instead of leaving it visible.
16. **Hidden-tab polling churn:** community, booster, and online-presence polls pause while the webview is hidden and refresh when it becomes visible.
17. **Excess global-booster polling:** the global booster refresh interval is reduced from 1.5 seconds to 5 seconds.
18. **Free-roll/Frenzy conflict:** Free Rolls no longer bypass the intentional wait needed to release an armed Frenzy.
19. **Cooldown progress edge cases:** roll progress math guards a zero-length denominator and clamps values to 0–100%.
20. **Cooldown notice timer race:** repeated cooldown notices replace their prior hide timer.
21. **Repeated roll submissions:** the roll button is disabled and the handler returns while a roll is already in progress.
22. **Stale booster countdown after backgrounding:** booster timers re-sync when the page becomes visible.
23. **Premature ability requests:** active combat abilities are disabled until the next accepted beat is ready.
24. **Unneeded off-screen combat renders:** the per-second beat countdown runs only on the Fight page.
25. **Invalid combat readiness width:** the combat beat progress value is clamped to a valid percentage.
26. **Invalid quest progress width:** daily and weekly progress calculations handle negative values and non-positive targets safely.
27. **Misleading zero-day streak:** a new player is shown a 0-day streak rather than a fabricated 1-day streak.
28. **Conflicting rune mutations:** a shared client action lock prevents equip, sacrifice, and Auto Sacrifice requests racing and applying stale snapshots.
29. **Rune request never returns:** rune API requests have a timeout and a recovery message that tells players to refresh to verify an uncertain write.
30. **Confusing/blocked inventory interactions:** full Rune slots no longer disable the inventory icon itself, so the Rune can still be inspected; only the Equip action is blocked.

## 30 player-experience improvements

1. **Persistent onboarding:** tutorial completion follows the account across sessions and devices.
2. **Calmer first load:** the first-roll tutorial cannot flash briefly before saved status arrives.
3. **Bounded loading:** tutorial status checks have a visible timeout/fallback rather than waiting forever.
4. **Trustworthy online count:** only post-launch heartbeats count as active play; preview reads no longer inflate the counter.
5. **Responsive presence:** online presence refreshes on return to the game, while background tabs stop wasting requests.
6. **Clear cooldown feedback:** the roll cooldown meter exposes its value to assistive technology.
7. **Smoother timers:** the roll timer samples once per second normally and more frequently only during the final three seconds.
8. **Clear busy state:** the Roll button announces an in-progress roll and prevents double taps.
9. **Safer Frenzy release:** Free Rolls cannot accidentally bypass the deliberate Frenzy release interaction.
10. **Accurate booster confirmation:** Turbo success text reflects the actual boost duration.
11. **Fresh community events:** expired world events and cleared announcements disappear instead of lingering.
12. **Less background noise:** hidden webviews stop needless community/booster/presence polling.
13. **Remembered combat controls:** Auto Fight and Pause preferences persist in local storage.
14. **Lower distraction in combat:** the beat countdown stops re-rendering unrelated combat pages.
15. **Readable turn readiness:** combat progress has a stable, bounded progress-bar value.
16. **Selected command visibility:** Strike/Heavy/Guard/Mend commands expose the selected state with `aria-pressed`.
17. **Touch-friendly Skill Codex:** tapping a skill opens details rather than immediately equipping or unequipping it.
18. **Skill search:** players can filter the Skill Codex by name, rarity, or stat/effect.
19. **Skill result count:** the search shows how many skills remain in the filtered view.
20. **Accessible skill details:** interactive skill details use group semantics and action buttons remain clearly separate.
21. **Skill copy progression:** duplicate-copy progress has a clamped, screen-reader-readable percentage.
22. **Touch-friendly Rune inventory:** tapping a Rune opens details instead of immediately changing the loadout.
23. **Rune level progression:** each Rune tooltip now shows a level XP progress meter.
24. **Searchable Runes:** filter the inventory by Rune name, rarity, stat, or Major Ability.
25. **Useful Rune filters:** switch between All, Equipped, and Spare Runes.
26. **Visible filter count:** Rune search shows how many Runes match the current filter, and displays a no-match message.
27. **Keyboard-friendly details:** Escape closes inspected Skill details and Rune details; for Runes it also cancels Strengthen selection.
28. **Rune recovery control:** the Rune error notice includes an explicit Retry action.
29. **Safer Rune controls:** Equip, Strengthen, refresh, and Auto Sacrifice controls are disabled appropriately during mutations.
30. **Reduced-motion support:** upgrade milestone confetti is skipped when the player requests reduced motion.

## Validation

- Added `tests/player-experience.test.ts` regression tests for preview-read presence isolation and per-account tutorial persistence.
- Updated the candidate package and shared app versions to `1.2.44`.
- The changes still need the repository preflight (`npm run preflight`) and a Devvit playtest before release. Do not consider this candidate deployed or verified until those checks pass.
