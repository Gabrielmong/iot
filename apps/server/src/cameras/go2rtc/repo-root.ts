import { fileURLToPath } from "node:url";

/** Repo root: this file is apps/server/{src,dist}/cameras/go2rtc/repo-root.{ts,js}. */
export const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
