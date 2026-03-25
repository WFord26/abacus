import type { Config } from "tailwindcss";

import tailwindPreset from "@wford26/design-tokens/tailwind-preset";

const config: Config = {
  presets: [tailwindPreset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
