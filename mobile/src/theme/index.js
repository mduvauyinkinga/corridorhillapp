/**
 * theme/index.js — The mobile design system (delegates to shared tokens).
 *
 * Historically this file kept its own copies of the brand/spacing/radius
 * values. Those duplicates drifted, so we now import the canonical values
 * from ../theme/tokens.js and only add the mobile-specific pieces here
 * (spacing in "8px units", a few derived helpers, mobile-specific shadow).
 *
 * Web consumers keep css/style.css :root as the single source. When the
 * web CSS is updated, tokens.js is updated once, and this file picks it
 * up automatically.
 */

import tokens from "./tokens";

// Brand palette — exact mirror of css/style.css :root
export const colors = {
  ...tokens.colors,
  overlay: "rgba(13, 42, 66, 0.55)",
  borderStrong: tokens.colors.borderStrong,
};

// Status badges — exact mirror of css/management.css badge classes
export const status = {
  ...tokens.status,
};

// Priority badges — exact mirror of js/utils.js priorityBadge()
export const priority = {
  ...tokens.priority,
};

export const overdue = {
  ...tokens.overdue,
};

export const occupiedChip = {
  ...tokens.occupiedChip,
};

export const availableChip = {
  ...tokens.availableChip,
};

// Dark mode overrides (applied via a ThemeProvider in App.js)
export const dark = {
  ...tokens.dark,
};

// Spacing — mobile-friendly scale that maps 1:1 to css --space-*
// --space-1 = 0.5rem = 8px  => xs
// --space-2 = 1rem     = 16px => sm
// --space-3 = 1.5rem   = 24px => md
// --space-4 = 2rem     = 32px => lg
// --space-5 = 3rem     = 48px => xl
export const spacing = {
  xs: tokens.spacing.xs,
  sm: tokens.spacing.sm,
  md: tokens.spacing.md,
  lg: tokens.spacing.lg,
  xl: tokens.spacing.xl,
  xxl: tokens.spacing.xxl,
};

// Radius — maps to css --radius
// --radius: 0.5rem   = 8px  => 8dp
// --radius-sm: 0.25rem = 4px => 4dp
// --radius-lg: 0.75rem = 12px => 12dp
export const radius = {
  ...tokens.radius,
};

export const typography = {
  ...tokens.typography,
};

// Layout
export const layout = {
  ...tokens.layout,
};

// Shadow — mobile elevation
export const shadow = {
  ...tokens.shadow,
};

