import { defineConfig } from "@playwright/test";

// Testy e2e chodzą po realnej aplikacji (dev server + baza z .env).
// Dane testowe są znakowane unikalnym sufiksem czasu — patrz tests/e2e/helpers.ts.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // baza jest współdzielona (pula połączeń = 1) — bez równoległości
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "pl-PL",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
