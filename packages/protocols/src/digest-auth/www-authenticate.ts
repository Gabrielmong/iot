export interface AuthChallenge {
  /** Lower-cased scheme, e.g. `digest` or `basic`. */
  scheme: string;
  /** Parameters by lower-cased name, unquoted. */
  params: Record<string, string>;
}

const ITEM = /([!#$%&'*+.^_`|~0-9A-Za-z-]+)(?:\s*=\s*("(?:[^"\\]|\\.)*"|[^,\s]*))?/g;

/** Parses WWW-Authenticate header values (several headers, or several challenges in one) into challenges. */
export function parseWwwAuthenticate(values: readonly string[]): AuthChallenge[] {
  const challenges: AuthChallenge[] = [];
  for (const value of values) {
    let current: AuthChallenge | undefined;
    for (const [, name = '', raw] of value.matchAll(ITEM)) {
      if (raw === undefined) {
        current = { scheme: name.toLowerCase(), params: {} };
        challenges.push(current);
      } else if (current) {
        current.params[name.toLowerCase()] = unquote(raw);
      }
    }
  }
  return challenges;
}

function unquote(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  return raw.slice(1, -1).replace(/\\(.)/g, '$1');
}
