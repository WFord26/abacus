import { colors, spacing, typography } from "./tokens";

const tailwindPreset = {
  theme: {
    extend: {
      colors,
      spacing,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
    },
  },
};

export default tailwindPreset;
