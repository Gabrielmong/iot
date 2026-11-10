import { describe, expect, it } from 'vitest';
import { opSecrets } from '../src/op-context.js';

describe('opSecrets', () => {
  it('is the tokens plus every app env value of 4+ chars', () => {
    const env = () => ({ DATABASE_URL: 'postgresql://u:pw@h/db', PORT: '4000', DEBUG: '1', EMPTY: '' });
    expect(opSecrets(['ghp_x', 'api'], env)).toEqual(['ghp_x', 'api', 'postgresql://u:pw@h/db', '4000']);
  });

  it('is just the tokens when the .env file is missing', () => {
    const env = () => {
      throw new Error('Cannot read app env file');
    };
    expect(opSecrets(['ghp_x', 'api'], env)).toEqual(['ghp_x', 'api']);
  });
});
