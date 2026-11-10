import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// DOTENV_CONFIG_PATH (the deployed shared .env) is read first when set. Otherwise the repo-root .env is the
// source of truth; an apps/server/.env (dev setups) is read first and wins. dotenv never overrides set variables.
config({ path: [...(process.env.DOTENV_CONFIG_PATH ? [process.env.DOTENV_CONFIG_PATH] : []),fileURLToPath(new URL(".env", import.meta.url)), fileURLToPath(new URL("../../.env", import.meta.url))], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
