// Design tokens — mirrors apps/web/src/app/globals.css exactly

export const Colors = {
  lavender: {
    50: "#f7f5ff",
    100: "#eeebff",
    200: "#ddd8ff",
    300: "#c3baff",
    400: "#a697ff",
    500: "#8b71f5", // primary
    600: "#7558e0", // primary pressed
    700: "#5e42c0",
    800: "#4d36a0",
    950: "#25185c",
  },
  sage: {
    50: "#f3f7f1",
    100: "#e4efe0",
    400: "#7fae76", // action
    500: "#5e9254", // action pressed
    600: "#4a7742",
  },
  warm: {
    50: "#fafaf8", // background
    100: "#f5f4f1", // card bg
    200: "#eceae5", // divider
    300: "#d9d5ce", // border
    400: "#b8b3aa",
    500: "#928d84", // muted text
    600: "#706b62",
    700: "#574f45", // body text
    800: "#3d3730", // headings
    900: "#2a2420",
  },
  white: "#ffffff",
  error: "#e53e3e",
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;
