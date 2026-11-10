import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Applies the server's migrations to home_test before the suite runs. */
export default function setup(): void {
  const envFile = path.join(root, '.env');
  if (!process.env.DATABASE_URL_TEST && existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL_TEST;
  if (!url || new URL(url).pathname !== '/home_test') {
    throw new Error('DATABASE_URL_TEST must point at database home_test');
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.join(root, 'apps', 'server'),
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
