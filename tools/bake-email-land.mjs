// bake-email-land.mjs [in.png] [out.ts]
// Bakes the wheel's land map (public/wheel/land.png, 512 by 256) into a 256 by 128 bitmap of one bit a cell, as a
// TypeScript module, so the emails can draw the text globe on the server, where there is no canvas to read a picture.
import sharp from 'sharp'; import { writeFileSync } from 'node:fs';
const [src = 'public/wheel/land.png', out = 'lib/email/land.ts'] = process.argv.slice(2);
const W = 256, H = 128;
const { data } = await sharp(src).resize(W, H).greyscale().raw().toBuffer({ resolveWithObject: true });
const bits = new Uint8Array((W * H) / 8);
for (let i = 0; i < W * H; i++) if (data[i] > 127) bits[i >> 3] |= 1 << (i & 7);
writeFileSync(out, `/* land.ts: the land map for the emails, baked from public/wheel/land.png by tools/bake-email-land.mjs. ${W} by ${H}, one
   bit a cell (longitude across from -180, latitude down from 90). Do not edit by hand. */
export const LAND_W = ${W}, LAND_H = ${H};
export const LAND_BITS = '${Buffer.from(bits).toString('base64')}';
`);
console.log('wrote', out, bits.length, 'bytes');
