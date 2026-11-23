/* The globe as text: a world turning in 100 frames of characters, from the motion study in the LW17 x Hackathon 26
   file ("157 / spinning world"). public/wheel/ascii-globe.txt holds the frames, one frame per line: its 25 rows of 100
   characters run on, row after row: '.' is the dim grid, ':' '|' and 'o' (a bright '.') are land. The study's green AWS marks are land
   here, since the city mark is ours.

   Frame k faces longitude FIRST + STEP * k, east of Greenwich positive. A place at (lat, lon) sits at column
   CX + RX cos(lat) sin(lon - facing) and line CY - RY sin(lat). These numbers were fitted against the land map
   (public/wheel/land.png) over every frame, so the city mark falls on its own land. */

export const ASCII = { url: '/wheel/ascii-globe.txt', frames: 100, rows: 25, cols: 100, first: -100, step: 3.6, cx: 50, cy: 12, rx: 24, ry: 11.3 };
const INK = { grid: '#797b72', land: '#f2f3ef', city: '#3ecf8e' };
const rad = (d: number) => (d * Math.PI) / 180;

export type AsciiFrames = string[][];

let loading: Promise<AsciiFrames | null> | null = null;
export function loadAscii(): Promise<AsciiFrames | null> {
  loading ??= fetch(ASCII.url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))).then((t) => {
    const lines = t.split('\n'), frames: AsciiFrames = [];
    for (let k = 0; k < ASCII.frames; k++) {
      const f = lines[k] ?? '', rows: string[] = [];
      for (let r = 0; r < ASCII.rows; r++) rows.push(f.slice(r * ASCII.cols, (r + 1) * ASCII.cols));
      frames.push(rows);
    }
    return frames;
  }).catch(() => { console.warn('The text globe did not load.'); loading = null; return null; });
  return loading;
}

/* the frame that faces a longitude, in degrees */
export function asciiFrame(facing: number): number {
  const k = Math.round((facing - ASCII.first) / ASCII.step);
  return ((k % ASCII.frames) + ASCII.frames) % ASCII.frames;
}

/* the city's cell on frame k, or null on the far side */
export function asciiCell(k: number, lat: number, lon: number): [row: number, col: number] | null {
  const away = rad(lon - (ASCII.first + ASCII.step * k)), up = rad(lat);
  if (Math.cos(up) * Math.cos(away) <= 0.05) return null;
  return [Math.round(ASCII.cy - ASCII.ry * Math.sin(up)), Math.round(ASCII.cx + ASCII.rx * Math.cos(up) * Math.sin(away))];
}

/* Frame k on a 2D canvas, centred on (x, y) with radius r. The city is a green + on its cell; with `bracket` it
   is [+], which the wheel blinks while it rests on the city. */
export function drawAscii(ctx: CanvasRenderingContext2D, frames: AsciiFrames, k: number, x: number, y: number, r: number, font: string,
  city: { lat: number; lon: number; bracket: boolean } | null) {
  const lines = frames[k]; if (!lines) return;
  const colW = r / ASCII.rx, lineH = r / ASCII.ry;
  ctx.save();
  ctx.font = `500 100px ${font}`; ctx.letterSpacing = '0px';
  const size = (100 * colW) / ctx.measureText('0').width;
  ctx.font = `500 ${size}px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const left = x - (ASCII.cx + 0.5) * colW;
  const cell = city ? asciiCell(k, city.lat, city.lon) : null;
  const mark = cell ? (city!.bracket ? ['[', '+', ']'] : [' ', '+', ' ']) : null;
  lines.forEach((line, row) => {
    let grid = '', land = '';
    for (let c = 0; c < line.length; c++) {
      const ch = mark && row === cell![0] && Math.abs(c - cell![1]) <= 1 ? ' ' : line[c];
      grid += ch === '.' ? '.' : ' ';
      land += ch === ':' || ch === '|' ? ch : ch === 'o' ? '.' : ' ';
    }
    const at = y + (row - ASCII.cy) * lineH;
    ctx.fillStyle = INK.grid; ctx.fillText(grid, left, at);
    ctx.fillStyle = INK.land; ctx.fillText(land, left, at);
  });
  if (cell && mark) {
    ctx.fillStyle = INK.city;
    mark.forEach((ch, i) => { if (ch !== ' ') ctx.fillText(ch, left + (cell[1] - 1 + i) * colW, y + (cell[0] - ASCII.cy) * lineH); });
  }
  ctx.restore();
}
