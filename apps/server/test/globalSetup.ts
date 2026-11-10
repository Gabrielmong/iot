import { execSync } from "node:child_process";
import { config } from "dotenv";

/** Applies migrations to home_test before the suite runs. */
export default function setup(): void {
  config({ quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url || new URL(url).pathname !== "/home_test") {
    throw new Error("DATABASE_URL_TEST must point at database home_test");
  }
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
