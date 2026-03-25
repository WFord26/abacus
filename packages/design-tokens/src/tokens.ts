export const colors = {
  primary: {
    50: "#eef6ff",
    100: "#d9e9ff",
    200: "#bcd8ff",
    300: "#8fc0ff",
    400: "#5ca0ff",
    500: "#2563eb",
    600: "#1d4fd7",
    700: "#1d3faa",
    800: "#1e3a82",
    900: "#1d3268",
  },
  neutral: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
  },
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
  surface: "#ffffff",
  foreground: "#0f172a",
} as const;

export const spacing = {
  0: "0px",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
} as const;

export const typography = {
  fontFamily: {
    sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
    mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
  },
  fontSize: {
    xs: ["0.75rem", { lineHeight: "1rem" }],
    sm: ["0.875rem", { lineHeight: "1.25rem" }],
    base: ["1rem", { lineHeight: "1.5rem" }],
    lg: ["1.125rem", { lineHeight: "1.75rem" }],
    xl: ["1.25rem", { lineHeight: "1.75rem" }],
    "2xl": ["1.5rem", { lineHeight: "2rem" }],
    "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;
