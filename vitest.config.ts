import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    globalSetup: "./tests/global-setup.ts",
    // testy e2e (Playwright) mają własny runner — nie mieszamy runnerów.
    // `.next` musi być wykluczony, bo build standalone kopiuje tam całe repo
    // razem z testami — bez tego po `npm run build` vitest uruchamia je drugi
    // raz, z innym katalogiem bazowym, i te kopie failują.
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
  },
});
