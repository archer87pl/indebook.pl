import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    globalSetup: "./tests/global-setup.ts",
    // testy e2e (Playwright) mają własny runner — nie mieszamy runnerów
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});
