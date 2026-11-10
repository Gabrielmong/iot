import { describe, expect, it } from 'vitest';
import { passwordDigest, wsSecurityHeader } from './wsse.js';

describe('passwordDigest', () => {
  it('matches the ONVIF Application Programmer\'s Guide example', () => {
    const nonce = Buffer.from('LKqI6G/AikKCQrN0zqZFlg==', 'base64');
    expect(passwordDigest(nonce, '2010-09-16T07:50:45Z', 'userpassword')).toBe('tuOSpGlFlIXsozq4HFNeeGeFLEI=');
  });
});

describe('wsSecurityHeader', () => {
  const nonce = Buffer.from('LKqI6G/AikKCQrN0zqZFlg==', 'base64');
  const created = new Date('2010-09-16T07:50:45.123Z');

  it('sends a PasswordDigest UsernameToken with the nonce in Base64 and Created without milliseconds', () => {
    const header = wsSecurityHeader({ username: 'user', password: 'userpassword' }, created, nonce);
    expect(header).toContain('#PasswordDigest">');
    expect(header).toContain('tuOSpGlFlIXsozq4HFNeeGeFLEI=</wsse:Password>');
    expect(header).toContain('>LKqI6G/AikKCQrN0zqZFlg==</wsse:Nonce>');
    expect(header).toContain('>2010-09-16T07:50:45Z</wsu:Created>');
    expect(header).toContain('<wsse:Username>user</wsse:Username>');
  });

  it('never carries the password itself or PasswordText', () => {
    const header = wsSecurityHeader({ username: 'user', password: 'userpassword' }, created, nonce);
    expect(header).not.toContain('userpassword');
    expect(header).not.toContain('PasswordText');
  });

  it('escapes the username and uses 16 fresh random bytes by default', () => {
    const header = wsSecurityHeader({ username: 'a<b>&"c', password: 'p' }, created);
    expect(header).toContain('<wsse:Username>a&lt;b&gt;&amp;&quot;c</wsse:Username>');
    const sent = /<wsse:Nonce[^>]*>([^<]*)</.exec(header)?.[1] ?? '';
    expect(Buffer.from(sent, 'base64')).toHaveLength(16);
    expect(wsSecurityHeader({ username: 'u', password: 'p' }, created)).not.toBe(wsSecurityHeader({ username: 'u', password: 'p' }, created));
  });
});
