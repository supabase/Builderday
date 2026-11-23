/* The bar's dot row: its own words as a teletext line sends them. Each line starts with the clock run-in (1010…,
   sixteen bits) and the framing code (11100100); each character is seven bits of ASCII with an eighth for odd
   parity, sent least significant bit first. A dot is a 1. Characters outside seven-bit ASCII are sent as a space.
   Pure. */

export function oddParity(code: number): number[] {
  const bits: number[] = [];
  for (let b = 0; b < 7; b++) bits.push((code >> b) & 1);
  bits.push(bits.reduce((a, x) => a + x, 0) % 2 === 0 ? 1 : 0);
  return bits;
}

export function teletextBits(text: string): number[] {
  const out: number[] = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 0];
  for (const ch of text) { const c = ch.charCodeAt(0); out.push(...oddParity(c < 128 ? c : 32)); }
  return out;
}
