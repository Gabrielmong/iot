import { OpError } from './op-error.js';

export type Command =
  | { type: 'deployNow' | 'restartApp' | 'pause' | 'resume'; by: string }
  | { type: 'rollback'; sha: string; by: string };

const SIMPLE = new Set(['deployNow', 'restartApp', 'pause', 'resume']);

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The only commands the helper accepts; anything else is a 400. Unknown fields are dropped. */
export function parseCommand(body: unknown): Command {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!isText(b.by)) throw new OpError('Command needs a "by"', 400);
  if (b.type === 'rollback') {
    if (!isText(b.sha)) throw new OpError('Rollback needs a "sha"', 400);
    return { type: 'rollback', sha: b.sha, by: b.by };
  }
  if (typeof b.type !== 'string' || !SIMPLE.has(b.type)) throw new OpError('Unknown command', 400);
  return { type: b.type as 'deployNow' | 'restartApp' | 'pause' | 'resume', by: b.by };
}
