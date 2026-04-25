// ARIA palette + typography tokens. Source : ARIA/DESIGN.md.
// Used across all scenes — never hard-code a color in a scene file.

export const COLORS = {
  cream: "#f3f0ee",
  liftedCream: "#fcfbfa",
  ink: "#141413",
  charcoal: "#262627",
  signalOrange: "#cf4500",
  lightOrange: "#f37338",
  clayBrown: "#9a3a0a",
  slate: "#696969",
  granite: "#555555",
  dustTaupe: "#d1cdc7",
  linkBlue: "#3860be",
  sandboxCyan: "#06b6d4",
  destructiveRed: "#dc2626",
} as const;

export const FONTS = {
  display: '"Sofia Sans", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

// Reusable type ramp matching DESIGN.md hierarchy.
export const TYPE = {
  hero: {
    fontFamily: FONTS.display,
    fontSize: 128,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1,
  },
  display: {
    fontFamily: FONTS.display,
    fontSize: 96,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1.05,
  },
  h1: {
    fontFamily: FONTS.display,
    fontSize: 64,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
  },
  h2: {
    fontFamily: FONTS.display,
    fontSize: 36,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  body: {
    fontFamily: FONTS.display,
    fontSize: 22,
    fontWeight: 450,
    lineHeight: 1.4,
  },
  eyebrow: {
    fontFamily: FONTS.display,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
  },
  mono: {
    fontFamily: FONTS.mono,
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 1.5,
  },
} as const;
