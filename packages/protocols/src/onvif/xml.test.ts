import { describe, expect, it } from 'vitest';
import { MAX_XML_ELEMENTS, xmlElements, xmlText } from './xml.js';

describe('xmlElements', () => {
  it('matches by local name whatever the prefix, with attributes and inner XML', () => {
    const xml = '<a:Root><trt:Profiles token="p0" fixed="true"><tt:Name>Main</tt:Name></trt:Profiles><Profiles token=\'p1\'/><x:ProfilesExtra/></a:Root>';
    const found = xmlElements(xml, 'Profiles');
    expect(found.map((e) => e.attrs.token)).toEqual(['p0', 'p1']);
    expect(found[0]!.inner).toBe('<tt:Name>Main</tt:Name>');
    expect(found[1]!.inner).toBe('');
  });

  it('stays linear on 256 KB of unclosed tags', () => {
    const unclosed = '<tt:Uri a="1">'.repeat(Math.floor((256 * 1024) / 14));
    const t0 = performance.now();
    expect(xmlElements(unclosed, 'Uri')).toEqual([]);
    expect(xmlElements(`${'<Uri>'.repeat(50_000)}</Uri>`, 'Uri')).toHaveLength(1);
    // A quadratic scan takes many seconds here; 1 s leaves room for a busy CI runner (100 ms flaked at 112 ms).
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('caps how many elements it returns', () => {
    expect(xmlElements('<P/>'.repeat(MAX_XML_ELEMENTS + 50), 'P')).toHaveLength(MAX_XML_ELEMENTS);
  });

  it('does not match same-named elements inside a match', () => {
    expect(xmlElements('<A><A>x</A></A><A>y</A>', 'A').map((e) => e.inner)).toEqual(['<A>x', 'y']);
  });

  it('skips declarations and ignores unclosed elements', () => {
    expect(xmlElements('<?xml version="1.0"?><!-- c --><Uri>x', 'Uri')).toEqual([]);
  });
});

describe('xmlText', () => {
  it('returns the first element\'s trimmed text with entities decoded', () => {
    expect(xmlText('<tt:Uri> rtsp://h/x?a=1&amp;b=&lt;2&gt;&quot;&apos;&#65;&#x42; </tt:Uri><Uri>no</Uri>', 'Uri')).toBe('rtsp://h/x?a=1&b=<2>"\'AB');
  });

  it('keeps out-of-range numeric references as written instead of throwing', () => {
    expect(xmlText('<Uri>a&#1114112;b&#x110000;c&#65;</Uri>', 'Uri')).toBe('a&#1114112;b&#x110000;cA');
  });

  it('is undefined when the element is missing', () => {
    expect(xmlText('<Other>1</Other>', 'Uri')).toBeUndefined();
  });
});
