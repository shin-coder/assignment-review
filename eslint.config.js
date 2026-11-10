import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    // tests/fixtures は生徒サイトを模したサンプルで、期待値の基準なので lint で書き換えさせない
    ignores: ["dist", "coverage", "playwright-report", "test-results", "tests/fixtures"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // ブラウザで動くコード。テストや設定ファイルのために Node.js の型が全体に入っているため、
    // 型チェックでは防げない Node.js 専用のグローバル変数を lint で禁止する
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["process", "Buffer", "global", "__dirname", "__filename", "require", "module"].map(
          (name) => ({
            name,
            message: "ブラウザで動くコードでは Node.js のグローバル変数を使わない",
          }),
        ),
      ],
    },
  },
  {
    files: ["src/sw/**/*.ts"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["*.config.{ts,js}", "e2e/**/*.ts", ".claude/hooks/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
