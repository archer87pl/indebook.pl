import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    globalSetup: "./tests/global-setup.ts",
    // testowa baza — osobny plik, żeby nie ruszać dev.db
    env: { DATABASE_URL: "file:./test.db" },
  },
});
