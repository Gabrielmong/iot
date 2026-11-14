import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApi } from './api.js';
import { loadConfig, pathsFor } from './config.js';
import { Deployer } from './deployer.js';
import { GitHub } from './github.js';
import { realContext } from './real-context.js';
import { recoverOnStart } from './recover.js';

// Installed as <root>\deployer\app\dist\main.js, so the default config is <root>\deployer\deployer.json.
const here = path.dirname(fileURLToPath(import.meta.url));
const configFile = process.argv[2] ?? path.resolve(here, '..', '..', 'deployer.json');

const readToken = (file: string) => readFileSync(file, 'utf8').trim();

async function main(): Promise<void> {
  const config = loadConfig(configFile);
  const paths = pathsFor(config.root);
  const tokens = { github: readToken(config.tokenFile), api: readToken(config.apiTokenFile) };
  const ctx = realContext(config, paths, tokens);
  await recoverOnStart(ctx);

  const deployer = new Deployer(ctx, new GitHub(config.githubRepo, tokens.github, undefined, config.ciWorkflowName));
  const server: Server = await startApi(deployer, { token: tokens.api, logsDir: paths.eventLogs, port: config.apiPort });
  deployer.start();
  console.log(`HomeDeployer listening on 127.0.0.1:${config.apiPort}`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('HomeDeployer stopping; waiting for the current operation');
    server.close();
    await deployer.stop(); // never mid-operation: waits up to 10 min
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((e: unknown) => {
  console.error('HomeDeployer failed to start:', e);
  process.exit(1);
});
