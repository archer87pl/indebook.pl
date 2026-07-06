import { execSync } from "node:child_process";
import { join } from "node:path";

// Testy jednostkowe (np. lib/dates.test.ts) nie potrzebują bazy. Aby uruchomić
// testy dotykające Prismy, ustaw TEST_DATABASE_URL na osobną, jednorazową bazę
// Postgres — wtedy przepchniemy do niej schemat (z --force-reset).
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;

  execSync("npx prisma db push --skip-generate --force-reset", {
    cwd: join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "pipe",
  });
}
