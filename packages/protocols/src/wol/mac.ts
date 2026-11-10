/** A MAC address in any common notation, normalised to `aa:bb:cc:dd:ee:ff`; null when it isn't one. */
export function parseMac(input: string): string | null {
  const hex = input.trim().replace(/[:.\-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(hex)) return null;
  return hex.match(/../g)!.join(':');
}
