// bake-land-dots.mjs: the land as sparse points for the How it works globe (components/day/line.ts), from the baked
// land map (public/wheel/land.png): rows every STEP degrees of latitude, points along each row every STEP degrees of
// arc (fewer toward the poles), kept where the map says land. Writes components/day/land-dots.ts.
// Run: node tools/bake-land-dots.mjs [step]
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const STEP = Number(process.argv[2] ?? 6);
const { data, info } = await sharp('public/wheel/land.png').greyscale().raw().toBuffer({ resolveWithObject: true });
const land = (lat, lon) => {
  const x = Math.floor((((lon + 180) % 360) + 360) % 360 / 360 * info.width), y = Math.min(info.height - 1, Math.max(0, Math.floor((90 - lat) / 180 * info.height)));
  return data[y * info.width + x] > 127;
};
const pts = [];
for (let lat = -84 + STEP / 2; lat < 84; lat += STEP) {
  const m = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / STEP));
  for (let k = 0; k < m; k++) { const lon = -180 + ((k + 0.5) * 360) / m; if (land(lat, lon)) pts.push(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10); }
}
writeFileSync('components/day/land-dots.ts', `/* The land as ${pts.length / 2} points about ${STEP} degrees apart, latitude then longitude, from public/wheel/land.png.
   Written by tools/bake-land-dots.mjs; run it again rather than editing this file. */
export const LAND_DOTS = new Float32Array([${pts.join(',')}]);
`);
console.log(pts.length / 2, 'points');
