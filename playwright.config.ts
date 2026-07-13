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
    // dedykowany port — 3000 bywa zajęty przez inne projekty dev
    baseURL: "http://localhost:3100",
    locale: "pl-PL",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
