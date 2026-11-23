/* The BUILD mark: a globe of thin smooth lines with the word BUILD over it in pixel letters. The numbers are in cells
   of the letters, and the mark is 45 by 21 cells. Each letter is 7 cells high; the I is two cells wide and the rest
   seven, so the five letters take about the room the old four did. The globe's lines stop one cell short of each
   letter's box, so no line runs through a letter's open side (a line across the U or the L would make another
   letter), and the word reads at the header's smallest size. */

const SIZE = { w: 45, h: 21 }, CENTER = { x: 22.5, y: 10.5 };
const OVALS = [22, 14.5, 7], HALF_HEIGHT = 10, PARALLELS = [5, 16], LINE_WIDTH = 0.5;
/* upright strokes are two cells wide; corners are cut where a letter turns, so B and D read apart */
const LETTERS = [
  '1111110 1100011 1100011 1111110 1100011 1100011 1111110',
  '1100011 1100011 1100011 1100011 1100011 1100011 0111110',
  '11 11 11 11 11 11 11',
  '1100000 1100000 1100000 1100000 1100000 1100000 1111111',
  '1111100 1100110 1100011 1100011 1100011 1100110 1111100',
].map((l) => l.split(' '));
const GAP = 1, LEAN_ROWS = 3, ROWS = 7;
const WIDTHS = LETTERS.map((l) => l[0].length);
const SPAN = WIDTHS.reduce((a, b) => a + b, 0) + GAP * (LETTERS.length - 1) + 1;
const WORD = { x: Math.floor((SIZE.w - SPAN) / 2), y: 7 };

const word: string[] = [];
const boxes: { x: number; w: number }[] = [];
let at = WORD.x;
LETTERS.forEach((letter, index) => {
  boxes.push({ x: at, w: WIDTHS[index] + 1 });
  letter.forEach((bits, row) => {
    /* the top three rows sit one cell to the right, so the word leans */
    const left = at + (row < LEAN_ROWS ? 1 : 0);
    for (let col = 0; col < bits.length; col++) {
      if (bits[col] !== '1') continue;
      const from = col;
      while (bits[col + 1] === '1') col++;
      word.push(`M${left + from} ${WORD.y + row}h${col - from + 1}v1h${from - col - 1}z`);
    }
  });
  at += WIDTHS[index] + GAP;
});
const WORD_D = word.join('');
const reachAt = (y: number) => OVALS[0] * Math.sqrt(1 - ((y - CENTER.y) / HALF_HEIGHT) ** 2);
const ACROSS = [CENTER.y, ...PARALLELS].map((y) => ({ y, r: reachAt(y) }));

export function HackMark({ id = 'wh-mark', label = 'Builder Day', className }: { id?: string; label?: string; className?: string }) {
  const mask = id + '-gap';
  return (
    <svg className={className} viewBox={`0 0 ${SIZE.w} ${SIZE.h}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <mask id={mask}>
        <rect width={SIZE.w} height={SIZE.h} fill="#fff" />
        <g fill="#000" stroke="#000" strokeWidth={2}>
          <path d={WORD_D} />
          {boxes.map((b) => <rect key={b.x} x={b.x} y={WORD.y} width={b.w} height={ROWS} />)}
        </g>
      </mask>
      <g className="wh-mark-lines" mask={`url(#${mask})`} strokeWidth={LINE_WIDTH}>
        {OVALS.map((rx) => <ellipse key={rx} cx={CENTER.x} cy={CENTER.y} rx={rx} ry={HALF_HEIGHT} />)}
        <line x1={CENTER.x} y1={CENTER.y - HALF_HEIGHT} x2={CENTER.x} y2={CENTER.y + HALF_HEIGHT} />
        {ACROSS.map((a) => <line key={a.y} x1={CENTER.x - a.r} y1={a.y} x2={CENTER.x + a.r} y2={a.y} />)}
      </g>
      <path className="wh-mark-word" d={WORD_D} />
    </svg>
  );
}
