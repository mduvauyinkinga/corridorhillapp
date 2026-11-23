/**
 * tokens.js — Shared design tokens (single source of truth).
 *
 * Every value here is a direct translation of the CSS custom properties
 * declared in css/style.css :root, plus the spacing/radius/radius/font
 * helpers the React Native theme already uses.
 *
 * The two clients now reference THIS file instead of maintaining their own
 * copies, so a brand/spacing/radius change anywhere updates both.
 *
 * Web consumers import this file and inject the values into :root via JS
 * (or keep css/style.css as the single source and read from it).
 * Mobile consumers import { tokens } and drive StyleSheet / components.
 *
 * Conventions:
 *   - Hex colour values are EXACTLY the same as css/style.css :root vars.
 *   - Spacing is expressed in px * 4 (i.e. 1rem = 16px = 16 'px4' units),
 *     matching the css --space-* scale:
 *       --space-1 = 0.5rem = 8px  => 'px4: 8'
 *       --space-2 = 1rem     = 16px  => 'px4: 16'
 *       --space-3 = 1.5rem   = 24px  => 'px4: 24'
 *       --space-4 = 2rem     = 32px  => 'px4: 32'
 *       --space-5 = 3rem     = 48px  => 'px4: 48'
 *   - Radius in DPs matches css --radius variables scaled to a 16dp base:
 *       --radius: 0.5rem   = 8px  => 8dp
 *       --radius-sm: 0.25rem = 4px => 4dp
 *       --radius-lg: 0.75rem = 12px => 12dp
 *   - Typography follows the existing src/theme/index.js scale.
 */

export const tokens = {
  // Brand palette (exact mirror of css/style.css :root)
  colors: {
    primary: "#143c5c",
    primaryDark: "#0d2a42",
    accent: "#e8a33d",
    accentDark: "#c9871f",

    bg: "#ffffff",
    surface: "#ffffff",
    text: "#22303c",
    textMuted: "#5c6b7a",
    border: "#dde3ea",
    borderStrong: "#c6d0da",

    success: "#2e9e5b",
    warning: "#e0a024",
    info: "#2f7fd6",
    danger: "#d64545",
    white: "#ffffff",
  },

  // Status palette (mirrors css/management.css badge classes)
  status: {
    Submitted: { bg: "#fdeeca", fg: "#8a5a00" },
    Received: { bg: "#fef3c7", fg: "#92400e" },
    Assigned: { bg: "#e0e7ff", fg: "#3730a3" },
    "In Progress": { bg: "#dbeafe", fg: "#1d4ed8" },
    "Waiting for Parts": { bg: "#ffe4e6", fg: "#9f1239" },
    Completed: { bg: "#d1fae5", fg: "#065f46" },
    Cancelled: { bg: "#e5e7eb", fg: "#4b5563" },
  },

  priority: {
    Low: { bg: "#e2e8f0", fg: "#475569" },
    Medium: { bg: "#fef3c7", fg: "#92400e" },
    High: { bg: "#ffe4e6", fg: "#9f1239" },
    Emergency: { bg: "#7f1d1d", fg: "#ffffff" },
  },

  overdue: { bg: "#fde8e8", fg: "#9b1c1c" },

  occupiedChip: { bg: "#ffe4e6", fg: "#9f1239" },
  availableChip: { bg: "#d1fae5", fg: "#065f46" },

  // Dark mode (mirror of src/theme/index.js dark block)
  dark: {
    bg: "#1a202c",
    surface: "#2d3748",
    text: "#e2e8f0",
    textMuted: "#a0aec0",
    border: "#4a5568",
  },

  // Spacing — maps 1:1 to css/style.css --space-*
  // --space-1 = 0.5rem = 8px
  // --space-2 = 1rem     = 16px
  // --space-3 = 1.5rem   = 24px
  // --space-4 = 2rem     = 32px
  // --space-5 = 3rem     = 48px
  // The public api exposes these as getters so components can use
  // tokens.spacing.md, tokens.spacing.lg, etc.
  spacing: {
    _raw: {
      1: 8,    // 0.5rem
      2: 16,   // 1rem
      3: 24,   // 1.5rem
      4: 32,   // 2rem
      5: 48,   // 3rem
    },
    get xs() { return this._raw[1]; },
    get sm() { return this._raw[2]; },
    get md() { return this._raw[3]; },
    get lg() { return this._raw[4]; },
    get xl() { return this._raw[5]; },
    get xxl() { return this._raw[5] * 1.5; },
  },

  // Radius — maps 1:1 to css/style.css --radius
  // --radius: 0.5rem   = 8px  => 8dp
  // --radius-sm: 0.25rem = 4px => 4dp
  // --radius-lg: 0.75rem = 12px => 12dp
  radius: {
    xs: 4,
    sm: 6,
    md: 10,
    lg: 12,
    pill: 999,
  },

  // Typography — mirrors src/theme/index.js scale
  typography: {
    h1: 24,
    h2: 19,
    h3: 16,
    body: 15,
    small: 13,
    tiny: 11.5,
  },

  // Layout
  layout: {
    minTouch: 44,
    screenPadding: 24,
  },

  // Shadow (elevations)
  shadow: {
    card: {
      elevation: 2,
      shadowColor: "#143c5c",
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
  },
};

export default tokens;
