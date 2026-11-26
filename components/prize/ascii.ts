/* The prizes, drawn in characters. Each prize is a small solid (rounded boxes, a torus), lit from the upper left and
   printed on a grid of monospace cells: the brighter a cell's surface, the denser its character. The floor is the
   site's dotted grid, and the object's shadow falls on it as heavier dots. Parts that carry the prize's own light (a
   screen, the headset's sensors, the box's tape, the printed amount) come back as a second layer, drawn in green.

   A pure function of the look, the object, the grid size and the turn (yaw, in radians): the same numbers give the
   same picture, so a saved look draws the same prize every time. No DOM, no canvas. */
import { F as DOTS } from '@/lib/dot-font';

export const OBJECTS = ['pro', 'mini', 'neo', 'quest', 'credits', 'box'] as const;
export type Obj = (typeof OBJECTS)[number];
export const RAMPS = { site: ' .:|', fine: ' .·:;|', classic: ' .:-=+*#%@', blocks: ' ░▒▓█' } as const;
export type Ramp = keyof typeof RAMPS;

export type AsciiLook = {
  ramp: Ramp;
  /* the camera: how far it looks down (radians), how wide the view is (object units across the grid) */
  pitch: number; span: number;
  /* the light: its angle around (from the upper left), how much light the dark side keeps, how hard the falloff is */
  lightYaw: number; ambient: number; gamma: number;
  /* the floor: the dotted grid's spacing in cells (0 = no floor), and the shadow */
  floor: number; shadow: boolean;
  /* a dot round the object's edge, so a dark side still has an outline */
  rim: boolean;
  /* edges drawn by shape (| _ / \) instead of by light */
  edges: boolean;
  /* a character cell's height over its width (a mono font is about 2) */
  aspect: number;
};

export type Frame = { cols: number; rows: number; ink: string; accent: string };

type V = [number, number, number];
const len = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* signed distance to a box of half size (bx, by, bz) with rounded edges r */
function box(px: number, py: number, pz: number, bx: number, by: number, bz: number, r: number) {
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r, qz = Math.abs(pz) - bz + r;
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
/* a torus lying in the xz plane: ring radius R, tube radius r */
function torus(px: number, py: number, pz: number, R: number, r: number) {
  const q = Math.sqrt(px * px + pz * pz) - R;
  return Math.sqrt(q * q + py * py) - r;
}
/* the dot font's cell at (u, v) in 0..1 of a word's box, or false */
function dotAt(word: string, u: number, v: number): boolean {
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  const n = word.length, cw = 6, col = Math.floor(u * n * cw), ch = word[Math.floor(col / cw)], x = col % cw, y = Math.floor(v * 7);
  const g = DOTS[ch]; if (!g || x > 4) return false;
  return g.split(' ')[y]?.[x] === '1';
}

/* each object: its distance, and what a surface point is made of: 0 the body, 1 a part with its own light (the accent
   layer), 2 a dark part (a keyboard), drawn in the dimmest character, 3 dark glass (a screen between its lines), left
   empty. `mid` lifts the view (screen units) so a tall prize sits in the middle, `zoom` widens the view for a big
   one, and `turn` is how far round it rests from the look's own turn. */
type Mat = 0 | 1 | 2 | 3;
type Model = { sdf: (x: number, y: number, z: number) => number; mat: (x: number, y: number, z: number) => Mat; floor: number; mid: number; zoom?: number; turn?: number };
/* a screen's lines of code: row k of the screen is code from `indent` to `indent + length` (a fixed pseudo-random
   pattern, so a turn never changes what is written) */
const hash = (k: number) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function code(u: number, v: number, lines: number): boolean {
  const k = Math.floor(v * lines), f = v * lines - k;
  if (f > 0.55 || k < 1 || k >= lines - 1) return false;
  const indent = [0, 0.06, 0.12, 0.06][Math.floor(hash(k) * 4)], length = 0.18 + hash(k + 40) * 0.5;
  return u > 0.07 + indent && u < 0.07 + indent + length;
}

function laptop(w: number, d: number, open: number, thin: number, pro: boolean): Model {
  /* base: centred, top at y = 0; lid hinged on the back edge, opened `open` radians from shut */
  const bh = thin, lh = thin * 0.7, c = Math.cos(open), s = Math.sin(open);
  /* lid space: y runs up the lid from the hinge (the base's back edge), z out of the screen towards the viewer */
  const toLid = (x: number, y: number, z: number): V => { const zz = z + d; return [x, y * s + zz * c, -y * c + zz * s]; };
  return {
    floor: -bh, mid: d * 0.85, zoom: pro ? 1.14 : 1.02,
    sdf: (x, y, z) => {
      const base = box(x, y + bh / 2, z, w, bh / 2, d, bh * 0.45);
      const well = box(x, y - 0.004, z + d * 0.18, w * 0.86, 0.012, d * 0.42, 0.01); // the keyboard, pressed in
      const pad = box(x, y - 0.004, z - d * 0.62, w * 0.3, 0.008, d * 0.26, 0.01);
      const [lx, ly, lz] = toLid(x, y, z);
      const lid = box(lx, ly - d * 1.02, lz + lh / 2, w, d * 1.02, lh / 2, lh * 0.45);
      return Math.min(Math.max(base, -well, -pad), lid);
    },
    mat: (x, y, z) => {
      const [lx, ly, lz] = toLid(x, y, z);
      /* the screen: the lid's inner face, inside its bezel; the Pro's has the camera's notch at the top */
      if (lz > -0.01 && Math.abs(lx) < w * 0.9 && ly > d * 0.12 && ly < d * 1.9) {
        if (pro && Math.abs(lx) < w * 0.09 && ly > d * 1.8) return 2;
        return code((lx + w * 0.9) / (w * 1.8), (d * 1.9 - ly) / (d * 1.78), 9) ? 1 : 3;
      }
      /* the keyboard: dark keys on the Pro, keys a shade of the body on the Neo */
      if (y > -0.02 && y < 0.02 && Math.abs(x) < w * 0.84 && Math.abs(z + d * 0.18) < d * 0.4) return pro ? 2 : 0;
      return 0;
    },
  };
}

function modelOf(o: Obj, label: string): Model {
  if (o === 'pro') return laptop(1.0, 0.7, 1.86, 0.06, true);
  if (o === 'neo') return laptop(0.86, 0.6, 1.95, 0.05, false);
  if (o === 'mini') return {
    floor: -0.18, mid: 0.32, zoom: 0.85,
    sdf: (x, y, z) => Math.max(box(x, y, z, 0.62, 0.18, 0.62, 0.05), box(x, y, z, 0.62, 0.3, 0.62, 0.17)),
    /* the power light on the front, and the foot's dark ring under it */
    mat: (x, y, z) => (z > 0.58 && Math.abs(x - 0.42) < 0.035 && Math.abs(y + 0.02) < 0.035 ? 1 : y < -0.16 ? 2 : 0),
  };
  if (o === 'quest') return {
    floor: -0.55, mid: 0.12, zoom: 0.78, turn: 0.25,
    sdf: (x, y, z) => {
      const visor = box(x, y, z - 0.1, 0.78, 0.4, 0.34, 0.26);
      const strap = Math.max(torus(x, y - 0.02, z + 0.42, 0.72, 0.05), z - 0.05);
      const back = box(x, y + 0.02, z + 1.12, 0.18, 0.15, 0.06, 0.05);
      return Math.min(visor, strap, back);
    },
    /* the sensors: a triangle of three on each side of the front (the 3S's tell); the face pad behind is dark */
    mat: (x, y, z) => {
      if (z > 0.3 && [-0.48, 0.48].some((cx) => [[cx - 0.09, 0.1], [cx + 0.09, 0.1], [cx, -0.08]].some(([px, py]) => Math.hypot(x - px, y - py) < 0.065))) return 1;
      return z < -0.2 && z > -0.3 ? 2 : 0;
    },
  };
  if (o === 'credits') return {
    floor: -0.66, mid: 0.05, zoom: 0.9, turn: 0.3,
    /* a card standing on its edge, leaning back */
    sdf: (x, y, z) => { const c = Math.cos(0.28), s = Math.sin(0.28), yy = y * c - z * s, zz = y * s + z * c; return box(x, yy, zz, 0.98, 0.62, 0.025, 0.06); },
    mat: (x, y, z) => {
      const c = Math.cos(0.28), s = Math.sin(0.28), yy = y * c - z * s, zz = y * s + z * c;
      if (zz < 0.01) return 0;
      /* the amount in the dot font, across the card's face, and the chip */
      const n = label.length, wdt = Math.min(1.7, n * 0.3);
      if (dotAt(label, (x + wdt / 2) / wdt, (0.3 - yy) / ((wdt / n) * 7 / 6))) return 1;
      /* the face is dark so the amount reads; the chip and the card's rim keep the light */
      return Math.abs(x + 0.66) < 0.14 && Math.abs(yy + 0.34) < 0.1 ? 0 : Math.abs(x) < 0.9 && Math.abs(yy) < 0.54 ? 2 : 0;
    },
  };
  return {
    floor: -0.5, mid: 0.08, zoom: 0.82,
    sdf: (x, y, z) => Math.max(box(x, y, z, 0.62, 0.5, 0.62, 0.03), -box(x, y - 0.5, z, 0.7, 0.008, 0.7, 0)),
    /* the tape over the lid and down the front */
    mat: (x, y, z) => (Math.abs(x) < 0.13 && (y > 0.47 || z > 0.6) ? 1 : 0),
  };
}

const STEPS = 64, FAR = 9;
/* draw one frame; yaw turns the object, cols and rows are the grid */
export function renderAscii(look: AsciiLook, o: Obj, yaw: number, cols: number, rows: number, label = '$300'): Frame {
  const M = modelOf(o, label.toUpperCase()), ramp = RAMPS[look.ramp], turn = yaw + (M.turn ?? 0), cy = Math.cos(turn), sy = Math.sin(turn), cp = Math.cos(look.pitch), sp = Math.sin(look.pitch);
  /* object space from world: turn by -yaw about y */
  const obj = (x: number, y: number, z: number): V => [x * cy - z * sy, y, x * sy + z * cy];
  const sdf = (x: number, y: number, z: number) => { const [a, b, c] = obj(x, y, z); return M.sdf(a, b, c); };
  /* the light: from the upper left and a little in front, turned with lightYaw; fixed to the camera, so the object
     turns under it */
  const ly = look.lightYaw, L: V = [-Math.cos(ly) * 0.62, 0.7, Math.sin(ly) * 0.62 + 0.35], ll = len(...L), Lx = L[0] / ll, Ly = L[1] / ll, Lz = L[2] / ll;
  /* camera: orthographic, looking down by pitch; the ray's direction and the screen's axes */
  const D: V = [0, -sp, -cp], U: V = [0, cp, -sp], R: V = [1, 0, 0];
  const sx = (look.span * (M.zoom ?? 1)) / cols, syc = sx * look.aspect;
  /* pass 1: each cell's character, and for cells on the object its normal on the screen (for the edges) */
  const N = cols * rows, CH = new Array<string>(N).fill(' '), AC = new Array<string>(N).fill(' '), HIT = new Uint8Array(N), DEP = new Float32Array(N), SX = new Float32Array(N), SY = new Float32Array(N);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const u = (i + 0.5 - cols / 2) * sx, v = (rows / 2 - j - 0.5) * syc + M.mid, q = j * cols + i;
      const ox = R[0] * u + U[0] * v - D[0] * 4, oy = R[1] * u + U[1] * v - D[1] * 4, oz = R[2] * u + U[2] * v - D[2] * 4;
      let t = 0, hit = false, near = 9;
      for (let k = 0; k < STEPS && t < FAR; k++) {
        const d = sdf(ox + D[0] * t, oy + D[1] * t, oz + D[2] * t);
        near = Math.min(near, d);
        if (d < 0.002) { hit = true; break; }
        t += d * 0.9;
      }
      if (hit) {
        const px = ox + D[0] * t, py = oy + D[1] * t, pz = oz + D[2] * t, e = 0.004;
        let nx = sdf(px + e, py, pz) - sdf(px - e, py, pz), ny = sdf(px, py + e, pz) - sdf(px, py - e, pz), nz = sdf(px, py, pz + e) - sdf(px, py, pz - e);
        const nl = len(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const lit = clamp(nx * Lx + ny * Ly + nz * Lz, 0, 1), k = Math.pow(look.ambient + (1 - look.ambient) * lit, look.gamma);
        const [a, b, c] = obj(px, py, pz), m = M.mat(a, b, c);
        HIT[q] = 1; DEP[q] = t; SX[q] = nx * R[0] + nz * R[2]; SY[q] = nx * U[0] + ny * U[1] + nz * U[2];
        if (m === 1) AC[q] = k > 0.45 ? '|' : ':';
        else if (m === 2) CH[q] = '.';
        else if (m === 3) CH[q] = ' ';
        else CH[q] = ramp[clamp(1 + Math.floor(k * (ramp.length - 1)), 1, ramp.length - 1)];
      } else {
        /* the floor: where the ray meets the plane under the object */
        const fy = M.floor;
        if (D[1] < 0) {
          const tf = (fy - oy) / D[1], fx = ox + D[0] * tf, fz = oz + D[2] * tf;
          let shade = false;
          if (look.shadow) {
            let s2 = 0.02;
            for (let k = 0; k < 40 && s2 < 4; k++) { const d = sdf(fx + Lx * s2, fy + Ly * s2, fz + Lz * s2); if (d < 0.003) { shade = true; break; } s2 += Math.max(d, 0.01); }
          }
          const g = look.floor;
          if (shade) CH[q] = (i + j) % 2 === 0 ? ':' : '.';
          else if (g > 0 && i % g === 0 && j % Math.max(1, Math.round(g / look.aspect)) === 0 && Math.abs(fx) < look.span * 0.48 && Math.abs(fz) < look.span * 0.4) CH[q] = '·';
        }
        if (look.rim && near < sx * 0.7 && CH[q] === ' ') CH[q] = '.';
      }
    }
  }
  /* pass 2: the edges. A cell on the object next to empty space, or next to a cell much further away, is an edge; its
     character follows the edge's direction (across the normal on the screen), chosen by shape: | _ / \ */
  if (look.edges) {
    const gap = look.span * 0.12;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const q = j * cols + i; if (!HIT[q] || AC[q] !== ' ') continue;
      let edge = false;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= cols || b >= rows) { edge = true; break; }
        const r = b * cols + a; if (!HIT[r] || DEP[r] - DEP[q] > gap) { edge = true; break; }
      }
      if (!edge) continue;
      /* the normal on the screen, in cell units (a cell is taller than wide) */
      const ax = SX[q], ay = SY[q] / look.aspect, ang = Math.atan2(ay, ax), deg = ((ang * 180) / Math.PI + 360) % 180;
      CH[q] = deg < 22.5 || deg >= 157.5 ? '|' : deg < 67.5 ? '/' : deg < 112.5 ? (SY[q] > 0 ? '_' : '‾') : '\\';
    }
  }
  let ink = '', acc = '';
  for (let j = 0; j < rows; j++) { ink += CH.slice(j * cols, (j + 1) * cols).join('') + '\n'; acc += AC.slice(j * cols, (j + 1) * cols).join('') + '\n'; }
  return { cols, rows, ink, accent: acc };
}

export const ASCII_DEFAULT: AsciiLook = { ramp: 'fine', pitch: 0.62, span: 3.2, lightYaw: 0.6, ambient: 0.08, gamma: 1.7, floor: 6, shadow: true, rim: false, edges: true, aspect: 2 };
export const ASCII_BOUNDS: Record<string, [number, number, number]> = {
  pitch: [0.15, 1.1, 0.01], span: [2.2, 4.6, 0.05], lightYaw: [-1.5, 1.5, 0.05], ambient: [0, 0.5, 0.01], gamma: [0.5, 2.2, 0.05], floor: [0, 12, 1], aspect: [1.6, 2.4, 0.05],
};
