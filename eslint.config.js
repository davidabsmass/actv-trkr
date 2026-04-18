import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      // Vendored plugin tracker (ships as-is to WordPress; not part of app source)
      "mission-metrics-wp-plugin/**",
      "supabase/functions/serve-plugin-zip/plugin-template/**",
      // Generated Supabase types
      "src/integrations/supabase/types.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // ── Phase 1 hardening ──────────────────────────────────────────────
      // Surface legacy code-quality issues as warnings so they're visible in CI
      // without blocking PRs. Tighten to "error" once the codebase is clean.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "no-constant-binary-expression": "warn",
      "prefer-const": "warn",
    },
  },
);
