# Inline scroll-trap compliance follow-up

**Candidate:** Infinity Orbs v1.2.45  
**Branch:** `fix/io-50-bugs-50-improvements-20261022`

## Inline entrypoints in this app

Custom game posts use the `default` entrypoint (`splash.html` / `splash.tsx`), shared-Orb discovery posts use that same bounded public preview, and Orb Frenzy posts use `frenzy.html` / `frenzy.tsx`. The full game (`game.html`) is launched from an explicit button with `requestExpandedMode(..., 'game')`; the manifest no longer relies on the deprecated `entrypoint.inline` property.

## Changes made

- Removed the floating Global Chat window from the inline Frenzy post. Its message history was an independently scrollable panel. Global Chat remains part of the full game.
- Removed the long fallback thank-you dialog from the inline Frenzy claim path. A successful inline fallback now displays a compact receipt and a button to retry opening the full game.
- Shortened Frenzy copy, reduced the Orb illustration and spacing, and made the rarity number scale with its digit count so the card fits the fixed-height preview on both narrow and wide screens.
- Added compact side-by-side Orb, summary, and stat layouts for shared-Orb posts instead of a tall stacked card.
- Bounded inline document/root/public-shell layout with `overflow: clip`; `html`, `body`, the root, and public card explicitly use `touch-action: pan-y pinch-zoom` and `overscroll-behavior: auto`. No inline content panel uses `overflow: auto` or `overflow: scroll`.
- Added preflight checks for inline HTML roots, scroll/gesture handlers, nested public-card scrollers, touch-action locks, and overscroll locks. Regression tests include fixtures that intentionally introduce forbidden CSS.

## Required real-feed QA before resubmission

Static source checks cannot prove the Reddit host's actual gesture behavior. After building and installing the candidate into the development subreddit, verify these in the real Reddit feed:

1. On web, hover over the brand, card body, Orb art, rarity number, and each button; use mouse wheel and trackpad to scroll the feed past the post without an internal scrollbar or a stuck wheel.
2. On Android and iOS, swipe vertically starting on the same parts of both a normal launch post and a Frenzy post. Scrolling must continue the feed; taps should only activate the tapped control.
3. Test shared-Orb discovery posts at narrow and wide widths. Important text and the launch button must remain visible without scrolling inside the post.
4. Tap the launch/claim/continue buttons. The full game should open only after that user action, and its longer game panels may use their normal expanded-mode layout.

Do not resubmit based only on a successful TypeScript build: confirm the feed gesture behavior on the actual Reddit client and device classes.
