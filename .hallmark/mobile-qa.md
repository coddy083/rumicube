# Mobile adaptation verification — 2026-10-20

Existing Workbench layout, Cobalt tokens, Pretendard and Space Grotesk preserved.
Scope: responsive layout and touch interaction; no rules or server changes.
Audience: existing players. Primary use: portrait touch play. Tone: calm and tactile.
User confirmed this direction during implementation.

## Verification

- Chrome browser: 320, 375, 414, 768 and 1280 CSS px.
- Home, rules dialog, three-player table, lobby, result and long names.
- Thirty-tile hand in two compact rows and thirteen-tile meld; no root horizontal overflow.
- At least fourteen complete hand tiles visible at all four mobile widths.
- Native horizontal touch scroll and vertical touch drag to a new meld.
- Selecting tiles preserves hand scroll; reset restores a dragged tile.
- Hand tiles deliberately reduced to 36–44 × 52 px at user request for greater density.
- Mobile controls outside deliberate scrolling regions: at least 44 × 44 px.
- Inputs: 16 px to prevent iOS automatic input zoom.
- Short landscape 812 × 375: hand is not sticky.
- Existing client and server regression suites pass.
- Screenshots inspected at 320, 375 and 1280 px.

Hallmark applicable responsive gates 34, 49–56 checked; existing root clipping,
font/color tokens, instant focus ring and reduced-motion handling retained.
Full marketing structure/theme rotation gates are outside this responsive patch.
Self-critique: Philosophy 4, Hierarchy 5, Execution 4, Specificity 5, Restraint 5,
Variety 4 (brand continuity is intentional).

Run `php -S 127.0.0.1:8765 -t .` and, with Playwright available to Node,
`node tests/mobile.cjs`. Screenshot output defaults to `/tmp/tile-mobile`.
Browser emulation was used; physical iOS/Android devices were not tested.

## Compact play faces — 2026-10-21

User requested smaller cubes using color and number for an at-a-glance mobile view.
Game tiles now use 36 × 44px on desktop and a 28px minimum width × 38px on mobile,
with bold 26px / 23px numbers. Secondary symbols, sparkle decorations and deep
shadows are removed from game faces. Joker hearts and accessible names remain.
The mobile hand now fills rows from left to right with 4px gaps; all thirty fixture
tiles fit without horizontal scrolling at 320, 375, 414 and 768px. Oversized hands
remain bounded to 192px with vertical overflow; other controls retain their sizes.

Verified `tests/mobile.cjs` at 320, 375, 414, 768 and 1280px plus 812 × 375 landscape:
all pass, including horizontal long-meld scrolling, selection persistence and
vertical touch drag/reset. Inspected 320 and 375px game viewport screenshots.
`node tests/client.cjs`, `php -l index.php` and the strict premium UI audit pass.
The updated design context is recorded in root DESIGN.md; runtime CSS is canonical.
