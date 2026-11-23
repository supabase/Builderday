/* globe-score.ts: how close the generated text globe comes to the motion study's frames.
   It draws each of the 100 frames from public/wheel/land.png by the rules in components/wheel/text-globe.ts and
   compares it with the study's frame cell by cell: the kind of cell (empty, grid or land) and the exact character.
   With --sweep it tries thresholds and prints the best. With --show k it prints frame k both ways.

   Run from the repo root:
     JITI_ALIAS='{"@":"'$PWD'"}' node_modules/.bin/jiti tools/globe-score.ts [--threshold 0.5] [--sweep] [--show 0] */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { STUDY, genFrame, type LandMap } from '../components/wheel/text-globe';

/* a grey, 8-bit, non-interlaced PNG: enough for the land map */
function readPng(path: string): LandMap {
  const b = readFileSync(path); let p = 8, w = 0, h = 0; const idat: Buffer[] = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), body = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); if (body[8] !== 8 || body[9] !== 0) throw new Error('not 8-bit grey'); }
    if (type === 'IDAT') idat.push(body);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)], row = raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1));
    for (let x = 0; x < w; x++) {
      const a = x ? data[y * w + x - 1] : 0, up = y ? data[(y - 1) * w + x] : 0, c = x && y ? data[(y - 1) * w + x - 1] : 0;
      const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      data[y * w + x] = (row[x] + pred) & 255;
    }
  }
  return { w, h, data };
}

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const land = readPng('public/wheel/land.png');
const text = readFileSync('public/wheel/ascii-globe.txt', 'utf8').split('\n');
const study = (k: number) => Array.from({ length: STUDY.rows }, (_, r) => text[k].slice(r * STUDY.cols, (r + 1) * STUDY.cols).replace(/o/g, ':'));
const kind = (ch: string) => (ch === ':' || ch === '|' ? 2 : ch === '.' ? 1 : 0);

function score(threshold: number) {
  let cells = 0, kinds = 0, exact = 0, landBoth = 0, landEither = 0;
  for (let k = 0; k < STUDY.frames; k++) {
    const s = study(k), g = genFrame(land, STUDY.first + STUDY.step * k, STUDY.rows, { threshold });
    for (let r = 0; r < STUDY.rows; r++) for (let c = 0; c < STUDY.cols; c++) {
      const a = s[r][c], b = g[r][c]; cells++;
      if (kind(a) === kind(b)) kinds++; if (a === b) exact++;
      if (kind(a) === 2 || kind(b) === 2) { landEither++; if (kind(a) === 2 && kind(b) === 2) landBoth++; }
    }
  }
  return { threshold, kinds: kinds / cells, exact: exact / cells, landIoU: landBoth / landEither };
}

const pct = (v: number) => (v * 100).toFixed(1) + '%';
if (process.argv.includes('--sweep')) {
  const all = [0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7].map(score).sort((a, b) => b.landIoU - a.landIoU);
  for (const s of all) console.log(`threshold ${s.threshold}: same kind ${pct(s.kinds)}, same character ${pct(s.exact)}, land overlap ${pct(s.landIoU)}`);
} else {
  const s = score(Number(arg('--threshold') ?? 0.5));
  console.log(`threshold ${s.threshold}: same kind of cell ${pct(s.kinds)}, same character ${pct(s.exact)}, land overlap (both land / either land) ${pct(s.landIoU)}`);
}
const show = arg('--show');
if (show !== undefined) {
  const k = Number(show), s = study(k), g = genFrame(land, STUDY.first + STUDY.step * k, STUDY.rows, { threshold: Number(arg('--threshold') ?? 0.5) });
  for (let r = 0; r < STUDY.rows; r++) console.log(s[r].slice(20, 80) + '   ' + g[r].slice(20, 80));
}
