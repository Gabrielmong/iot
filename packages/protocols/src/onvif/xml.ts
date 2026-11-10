/** One element found by xmlElements: its attributes (by local name) and its raw inner XML. */
export interface XmlElement {
  attrs: Record<string, string>;
  inner: string;
}

/** At most this many elements are returned (ONVIF replies here hold a handful). */
export const MAX_XML_ELEMENTS = 1000;

/**
 * Every element whose local name (the part after any `prefix:`) is `localName`, in document order, up
 * to MAX_XML_ELEMENTS. A tiny, tolerant scanner for ONVIF's small replies, not a parser: it does not
 * nest same-named elements, and an element without its closing tag is skipped. Linear in the input:
 * one pass over the tags, then each opening tag is paired with the next closing tag of the same name
 * through a per-name cursor that only moves forward.
 */
export function xmlElements(xml: string, localName: string): XmlElement[] {
  const { opens, closes } = scanTags(xml, localName);
  const cursors = new Map<string, number>();
  const found: XmlElement[] = [];
  let skipUntil = 0;
  for (const open of opens) {
    if (found.length >= MAX_XML_ELEMENTS) break;
    if (open.start < skipUntil) continue; // inside the previous match
    if (open.selfClosing) {
      found.push({ attrs: parseAttrs(open.attrText), inner: '' });
      continue;
    }
    const list = closes.get(open.qname) ?? [];
    let i = cursors.get(open.qname) ?? 0;
    while (i < list.length && list[i]! < open.end) i++;
    cursors.set(open.qname, i);
    if (i === list.length) continue;
    const close = list[i]!;
    found.push({ attrs: parseAttrs(open.attrText), inner: xml.slice(open.end, close) });
    skipUntil = close;
  }
  return found;
}

/** The trimmed, entity-decoded text of the first `localName` element; undefined when there is none. */
export function xmlText(xml: string, localName: string): string | undefined {
  const first = xmlElements(xml, localName)[0];
  return first && decodeEntities(first.inner.trim());
}

type OpenTag = { qname: string; start: number; end: number; selfClosing: boolean; attrText: string };

/** One forward pass: the opening tags named `localName`, and the start offsets of their closing tags by qname. */
function scanTags(xml: string, localName: string): { opens: OpenTag[]; closes: Map<string, number[]> } {
  const opens: OpenTag[] = [];
  const closes = new Map<string, number[]>();
  let at = 0;
  while ((at = xml.indexOf('<', at)) >= 0) {
    const tagEnd = xml.indexOf('>', at);
    if (tagEnd < 0) break;
    const start = at;
    const tag = xml.slice(at + 1, tagEnd);
    at = tagEnd + 1;
    if (tag.startsWith('?') || tag.startsWith('!')) continue;
    if (tag.startsWith('/')) {
      const qname = tag.slice(1).trim();
      if (localOf(qname) !== localName) continue;
      const list = closes.get(qname) ?? [];
      list.push(start);
      closes.set(qname, list);
      continue;
    }
    const selfClosing = tag.endsWith('/');
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const qname = body.split(/\s/, 1)[0] ?? '';
    if (localOf(qname) !== localName) continue;
    opens.push({ qname, start, end: at, selfClosing, attrText: body.slice(qname.length) });
  }
  return { opens, closes };
}

function localOf(qname: string): string {
  return qname.slice(qname.indexOf(':') + 1);
}

/** `name="v"` / `name='v'` pairs, keyed by local name; one pass over the tag text. */
function parseAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let at = 0;
  for (;;) {
    const eq = text.indexOf('=', at);
    if (eq < 0) return attrs;
    let q = eq + 1;
    while (q < text.length && /\s/.test(text[q]!)) q++;
    const quote = text[q];
    if (quote !== '"' && quote !== "'") return attrs;
    const end = text.indexOf(quote, q + 1);
    if (end < 0) return attrs;
    attrs[localOf(text.slice(at, eq).trim())] = decodeEntities(text.slice(q + 1, end));
    at = end + 1;
  }
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, ref: string) => {
    if (ref.startsWith('#')) return codePoint(ref.startsWith('#x') ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)) ?? whole;
    return NAMED[ref] ?? whole;
  });
}

/** The character for a numeric reference; undefined when it is out of Unicode's range. */
function codePoint(n: number): string | undefined {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : undefined;
}

/** Escapes text for an element body or a quoted attribute. */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
