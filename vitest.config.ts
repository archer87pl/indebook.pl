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
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      // Logika (lib/, app/api/, i18n/, proxy.ts) plus komponenty klienckie,
      // które mają własną logikę — te testujemy w jsdom (@vitest-environment
      // w nagłówku pliku). Strony i layouty App Routera zostają poza pomiarem:
      // to serwerowe komponenty renderowane przez Next, sprawdzane e2e.
      include: [
        "lib/**/*.ts",
        "app/api/**/*.ts",
        "i18n/**/*.ts",
        "proxy.ts",
        "components/**/*.tsx",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "lib/db.ts", "lib/generated/**"],
    },
  },
});
