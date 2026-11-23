import type { ArriveOpts } from '@/components/wheel/engine';
import type { Arrival, FoldCfg } from './config';

/* The first screen's arrivals. Every one holds to two rules: the first paint is the final ground (the canvas fades
   in over its own empty frame drawn in CSS), and the words never wait for script (they arrive by CSS from the first
   paint, fold.css). What differs is the idea: how the wheel, the globe, the cells, the link and the peek come in once
   the page has the wheel's first frame and the visitor's city (t0). The CSS for each is keyed on .pf[data-arrival].

   1 tune: the names turn in from a little back as their ink comes up, the globe prints in rows in the same time,
     then the cells are written, the link rises, the peek last.
   2 scan: one scanline passes down the screen once from the first paint, the screen landing row by row behind it.
   3 flap: the names fade in with no turn, the globe prints, the mono line and the link's date settle on flaps.
   4 print: the globe prints first, alone; then the names are dealt in from further back, then the rest.
   5 mask: the headline's lines rise from behind a clip at full ink; the rest as tune.
   6 register: everything is there from the first frame, split red and blue, and closes.
   7 dial: the wheel and the globe turn in together from a few cities back (dialSweep) and slow; then the cells are
     written, the link rises and the peek comes last, as in tune.
   8 east: the wheel and the globe turn from the day's first city (furthest east) to the visitor's.
   9 quiet: the canvas fades in and the words come in; nothing else moves. The arrival on Back or Forward.
   10 sweep: before (the line swept over the globe, everything fading up), for comparison. */

export type ArrivePlan = {
  /* how many cities back the names start (east: back to the first city), and their ink's time (0: at once) */
  sweep: number | 'east'; ink: number;
  /* the globe's arrival and its time; turnGlobe: the globe turns with the names */
  globe: ArriveOpts['globe']; globeMs: number; turnGlobe?: boolean;
  /* print: the names wait for the globe */
  namesAfter: number;
  /* when the arrival is over, after t0 */
  end: number;
};

export function arrivePlan(a: Arrival, c: FoldCfg): ArrivePlan {
  const tail = Math.max(c.peekAt + c.peekMs, c.linkAt + c.linkMs + c.wordsStep, c.cellsAt + 4 * c.writeStep) + 60;
  switch (a) {
    case 'tune': case 'mask': return { sweep: c.introSweep, ink: c.introMs, globe: 'print', globeMs: c.printMs, namesAfter: 0, end: tail };
    case 'flap': return { sweep: 0, ink: c.introMs, globe: 'print', globeMs: c.printMs, namesAfter: 0, end: tail + 200 };
    case 'print': return { sweep: c.introSweep * 2, ink: c.introMs, globe: 'print', globeMs: c.printMs, namesAfter: c.printMs, end: c.printMs + tail };
    case 'dial': return { sweep: c.dialSweep, ink: c.introMs, globe: 'none', globeMs: 0, turnGlobe: true, namesAfter: 0, end: Math.max(tail, 900) };
    case 'east': return { sweep: 'east', ink: c.introMs, globe: 'none', globeMs: 0, turnGlobe: true, namesAfter: 0, end: Math.max(tail, 1100) };
    case 'sweep': return { sweep: 1.5, ink: 420, globe: 'sweep', globeMs: 750, namesAfter: 0, end: 900 };
    case 'scan': case 'register': case 'quiet': return { sweep: 0, ink: 0, globe: 'none', globeMs: 0, namesAfter: 0, end: Math.max(700, c.wordsMs * 1.4 + 2 * c.wordsStep, c.canvasIn) + 60 };
  }
  return { sweep: 0, ink: 0, globe: 'none', globeMs: 0, namesAfter: 0, end: 0 };
}

/* coming back to the page with the browser's Back or Forward (from the Luma page, say) plays quiet: the visitor was
   just here. A first open, a reload and a new visit in the same tab all play the arrival. Set on <html> by the head
   line in the page (BACK_SCRIPT) before the first paint, so the CSS knows too. */
export const BACK_ATTR = 'data-pf-back';
export const BACK_SCRIPT = `try{var n=performance.getEntriesByType('navigation')[0],h=document.documentElement;if(n&&n.type==='back_forward')h.setAttribute('${BACK_ATTR}','');else h.removeAttribute('${BACK_ATTR}')}catch(e){}`;
