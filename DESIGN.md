---
version: alpha
name: "타일클럽"
description: "색과 숫자를 빠르게 읽고 조합하는 한국어 숫자 타일 게임."
colors:
  primary: "oklch(49% .19 263)"
  background: "oklch(97.5% .006 260)"
  surface: "oklch(99.5% .002 260)"
  ink: "oklch(24% .033 260)"
typography:
  body:
    fontFamily: "Pretendard, Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, sans-serif"
  display:
    fontFamily: "Space Grotesk, Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
rounded:
  sm: "5px"
  md: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
components:
  tile: {}
  button: {}
  rack: {}
---

# 타일클럽 Design System

## Overview

Korean web game for friends and solo practice. The play surface prioritizes reading
colors, numbers and combinations quickly on a phone. Existing Cobalt workbench
identity is retained; small play tiles replace oversized physical-cube styling.

## Colors

`assets/css/tokens.css` is canonical for all colors, spacing, fonts and radii.
This document mirrors that source (ownership model B); it generates no CSS.
Number colors follow the supplied palette: red `#D62828`, black `#1F2937`,
green `#16A34A`, and blue `#2563EB`. Shared `.tile` color rules consume
`--color-red`, `--color-black`, `--color-green`, and `--color-blue` respectively.
The persisted `orange` suit key and `.tile.orange` class now display green;
the Korean accessible name is 초록. Keeping that key preserves existing games.

## Typography

Pretendard supplies Korean UI text; Space Grotesk supplies game numerals.
Play numerals use weight 700 and line-height 1. Desktop numerals are 26px;
at widths up to 48rem they are 23px. Accessible names retain the color and number.

## Layout

`assets/css/app.css` owns component geometry. Play tiles are 36 × 44px;
at widths up to 48rem they become 28 × 38px. Mobile hand columns share available
width with a 28px minimum and 4px gaps, in row order. The hand is bounded at
192px and scrolls vertically for unusually large hands. Ordinary 14-tile hands
fit within two rows on supported phones. Long board runs retain horizontal scroll.
Short landscape screens use a non-sticky hand.

## Elevation & Depth

Play tiles use a thin border and 2px bottom edge without a shadow.
Existing panels, overlays and decorative examples retain their styling.

## Shapes

Tiles use the existing 5px radius; panel corners use the existing 10px radius.

## Components

`views.js:tile` owns tile markup, names, selected order and joker identity;
`.game-wrap .tile` owns compact appearance. Game faces show colored numbers;
secondary color symbols remain available in decorative examples. Jokers retain
an identifiable heart and small label. Selection uses an outline, background,
3px lift and order badge. New-tile and disabled states remain distinct.
Buttons, dialogs and turn actions retain the shared controls and sizing.

## Iconography

The joker heart remains distinct from numbered tiles. Decorative sparkles are
hidden on play tiles to keep small faces legible.

## Motion

Existing reduced-motion rules apply; selection uses the shared fast transition.
Tap/keyboard selection and action buttons remain alternatives to dragging.

## Verification

`tests/mobile.cjs` checks narrow layouts, complete thirty-tile visibility,
readable compact faces, horizontal meld scrolling, touch selection and dragging.
Existing client regression checks cover refresh, recovery and pending actions.
