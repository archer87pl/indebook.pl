import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DB = join(__dirname, "..", "prisma", "test.db");

export default function setup() {
  rmSync(TEST_DB, { force: true });
  execSync("npx prisma db push --skip-generate", {
    cwd: join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  return () => {
    rmSync(TEST_DB, { force: true });
  };
}
