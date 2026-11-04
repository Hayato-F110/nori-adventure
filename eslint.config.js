import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "coverage/", "test-results/", "playwright-report/", ".claude/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // ルールの数値は src/config/ に集める（7-4）。ゲームロジックへの直書きは review で確認する
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
);
