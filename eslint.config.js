const { createRequire } = require("node:module");

const configPackageRequire = createRequire(
  require.resolve("./packages/config-eslint/package.json")
);
const tsParser = configPackageRequire("@typescript-eslint/parser");
const tsPlugin = configPackageRequire("@typescript-eslint/eslint-plugin");
const importPlugin = configPackageRequire("eslint-plugin-import");

module.exports = [
  {
    ignores: ["node_modules", ".pnpm-store", ".turbo", ".next", "dist", "build", "coverage"],
  },
  {
    files: ["**/*.{js,cjs,mjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "import/order": [
        "error",
        {
          alphabetize: {
            caseInsensitive: true,
            order: "asc",
          },
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          "newlines-between": "always",
        },
      ],
      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],
    },
  },
];
