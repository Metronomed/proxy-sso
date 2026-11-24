/**
 * @file Oxfmt configuration for the package
 */
import { defineConfig } from "oxfmt";

export default defineConfig({
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  tabWidth: 2,
  printWidth: 100,
  sortPackageJson: false,
  sortImports: {
    groups: [
      "builtin",
      { newlinesBetween: false },
      "external",
      { newlinesBetween: true },
      ["parent", "sibling", "index"],
      "unknown",
    ],
  },
  ignorePatterns: ["dist", "node_modules", "bun.lock", "coverage"],
});
