import { describe, expect, it } from 'vitest';
import { macFromNeighborTable } from './neighbor-mac.js';

const WINDOWS = `
Interface: 192.168.0.100 --- 0x7
  Internet Address      Physical Address      Type
  192.168.0.1           a4-2b-b0-11-22-33     dynamic
  192.168.0.139         3C-01-EF-AA-BB-CC     dynamic
  192.168.0.255         ff-ff-ff-ff-ff-ff     static
`;

const LINUX = `IP address       HW type     Flags       HW address            Mask     Device
192.168.0.139    0x1         0x2         3c:01:ef:aa:bb:cc     *        eth0
192.168.0.50     0x1         0x0         00:00:00:00:00:00     *        eth0
`;

const MAC_OS = '? (192.168.0.139) at 3c:01:ef:aa:bb:cc on en0 ifscope [ethernet]\n';

describe('macFromNeighborTable', () => {
  it('reads the Windows arp -a format', () => {
    expect(macFromNeighborTable(WINDOWS, '192.168.0.139')).toBe('3c:01:ef:aa:bb:cc');
  });

  it('reads /proc/net/arp and skips incomplete entries', () => {
    expect(macFromNeighborTable(LINUX, '192.168.0.139')).toBe('3c:01:ef:aa:bb:cc');
    expect(macFromNeighborTable(LINUX, '192.168.0.50')).toBeNull();
  });

  it('reads the macOS arp -n format', () => {
    expect(macFromNeighborTable(MAC_OS, '192.168.0.139')).toBe('3c:01:ef:aa:bb:cc');
  });

  it('matches the whole IP only and ignores broadcast entries', () => {
    expect(macFromNeighborTable(WINDOWS, '192.168.0.13')).toBeNull();
    expect(macFromNeighborTable(WINDOWS, '192.168.0.255')).toBeNull();
  });
});
