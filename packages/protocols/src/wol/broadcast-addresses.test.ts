import { describe, expect, it } from 'vitest';
import { broadcastAddresses } from './broadcast-addresses.js';

describe('broadcastAddresses', () => {
  it('lists the global broadcast, then each external IPv4 directed broadcast', () => {
    const v4 = (address: string, netmask: string, internal: boolean) =>
      ({ family: 'IPv4', address, netmask, internal, mac: '00:00:00:00:00:00', cidr: null }) as const;
    expect(
      broadcastAddresses({
        eth: [v4('192.168.0.10', '255.255.255.0', false)],
        lo: [v4('127.0.0.1', '255.0.0.0', true)],
        vpn: [v4('10.8.0.2', '255.255.0.0', false)],
        dup: [v4('192.168.0.11', '255.255.255.0', false)],
      }),
    ).toEqual(['255.255.255.255', '192.168.0.255', '10.8.255.255']);
  });
});
