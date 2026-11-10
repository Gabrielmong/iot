import { EventEmitter } from 'node:events';
import type dgram from 'node:dgram';
import { describe, expect, it } from 'vitest';
import { ssdpSearch } from './search.js';

const CHROMECAST = [
  'HTTP/1.1 200 OK',
  'CACHE-CONTROL: max-age=1800',
  'LOCATION: http://192.168.0.163:8008/ssdp/device-desc.xml',
  'SERVER: Linux/5.15.180-android14-11, UPnP/1.0, Chromecast/1.6.18',
  'ST: urn:dial-multiscreen-org:service:dial:1',
  'USN: uuid:0f6e3cac-1111-2222-3333-444455556666::urn:dial-multiscreen-org:service:dial:1',
  '', '',
].join('\r\n');

const SAMSUNG = [
  'HTTP/1.1 200 OK',
  'location: http://192.168.0.235:9197/dmr',
  'server: Samsung-Linux/4.1, UPnP/1.0, Samsung_UPnP_SDK/1.0',
  'st: urn:dial-multiscreen-org:service:dial:1',
  'usn: uuid:abcd-ef01::urn:dial-multiscreen-org:service:dial:1',
  '', '',
].join('\r\n');

const HISENSE = [
  'HTTP/1.1 200 OK',
  'Location: http://192.168.0.170:3366/dd.xml',
  'Server: Linux/4.9 UPnP/1.0 HiSense/1.0',
  'St: upnp:rootdevice',
  'Usn: uuid:HISETV-1234::upnp:rootdevice',
  '', '',
].join('\r\n');

function fakeSocket(replies: { from: string; text: string }[]) {
  const sent: { text: string; port: number; address: string }[] = [];
  const state = { bound: undefined as string | undefined, closed: false };
  const socket = Object.assign(new EventEmitter(), {
    bind: (opts: { address?: string }, cb: () => void) => { state.bound = opts.address; cb(); },
    send: (msg: Buffer, port: number, address: string, cb?: (err: Error | null) => void) => {
      sent.push({ text: msg.toString(), port, address });
      cb?.(null);
      // Reply once per send, so each M-SEARCH sent twice produces duplicates.
      for (const r of replies) setImmediate(() => socket.emit('message', Buffer.from(r.text), { address: r.from, port: 1900 }));
    },
    close: () => { state.closed = true; },
  });
  return { sent, state, factory: () => socket as unknown as dgram.Socket };
}

describe('ssdpSearch', () => {
  it('sends each M-SEARCH twice to the SSDP group and parses replies, one per (ip, usn)', async () => {
    const f = fakeSocket([
      { from: '192.168.0.163', text: CHROMECAST },
      { from: '192.168.0.235', text: SAMSUNG },
      { from: '192.168.0.170', text: HISENSE },
    ]);
    const replies = await ssdpSearch({ st: ['urn:dial-multiscreen-org:service:dial:1', 'upnp:rootdevice'], timeoutMs: 50, bindAddress: '192.168.0.10', socket: f.factory });

    expect(f.sent).toHaveLength(4);
    for (const s of f.sent) {
      expect(s.address).toBe('239.255.255.250');
      expect(s.port).toBe(1900);
      expect(s.text).toMatch(/^M-SEARCH \* HTTP\/1\.1\r\n/);
      expect(s.text).toContain('MAN: "ssdp:discover"\r\n');
      expect(s.text).toContain('MX: 2\r\n');
      expect(s.text.endsWith('\r\n\r\n')).toBe(true);
    }
    expect(f.sent.map((s) => s.text.match(/\r\nST: (.*)\r\n/)![1])).toEqual([
      'urn:dial-multiscreen-org:service:dial:1', 'urn:dial-multiscreen-org:service:dial:1', 'upnp:rootdevice', 'upnp:rootdevice',
    ]);
    expect(f.state).toEqual({ bound: '192.168.0.10', closed: true });

    expect(replies).toEqual([
      { ip: '192.168.0.163', server: 'Linux/5.15.180-android14-11, UPnP/1.0, Chromecast/1.6.18', location: 'http://192.168.0.163:8008/ssdp/device-desc.xml', usn: 'uuid:0f6e3cac-1111-2222-3333-444455556666::urn:dial-multiscreen-org:service:dial:1', st: 'urn:dial-multiscreen-org:service:dial:1' },
      { ip: '192.168.0.235', server: 'Samsung-Linux/4.1, UPnP/1.0, Samsung_UPnP_SDK/1.0', location: 'http://192.168.0.235:9197/dmr', usn: 'uuid:abcd-ef01::urn:dial-multiscreen-org:service:dial:1', st: 'urn:dial-multiscreen-org:service:dial:1' },
      { ip: '192.168.0.170', server: 'Linux/4.9 UPnP/1.0 HiSense/1.0', location: 'http://192.168.0.170:3366/dd.xml', usn: 'uuid:HISETV-1234::upnp:rootdevice', st: 'upnp:rootdevice' },
    ]);
  });

  it('ignores datagrams that are not SSDP replies', async () => {
    const f = fakeSocket([{ from: '192.168.0.9', text: 'NOTIFY * HTTP/1.1\r\nUSN: x\r\n\r\n' }, { from: '192.168.0.8', text: 'garbage' }]);
    expect(await ssdpSearch({ st: ['ssdp:all'], timeoutMs: 30, socket: f.factory })).toEqual([]);
  });
});
