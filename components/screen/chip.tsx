/* A state is one chip from six words, never free text, and each has a shape as well as a fill, so it reads without
   colour. The fills are the wheel's: the light green cell for live (green's job: now), the light orange for the last
   minutes, plain bordered cells for the rest, and ink for the pick.
   - Opens: an empty ring          - Closed: a small square, muted
   - Building: a half-filled ring  - Finalists: three bars
   - Last votes: an hourglass      - Picked: a diamond, on ink */

export type StateWord = 'opens' | 'building' | 'last' | 'closed' | 'finalists' | 'picked';
export const STATE_WORD: Record<StateWord, string> = { opens: 'Opens', building: 'Building', last: 'Last votes', closed: 'Closed', finalists: 'Finalists', picked: 'Picked' };

function Shape({ s }: { s: StateWord }) {
  const p = { width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': true as const, className: 'ch-shape' };
  if (s === 'opens') return <svg {...p}><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
  if (s === 'building') return <svg {...p}><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M5 1a4 4 0 0 1 0 8z" fill="currentColor" /></svg>;
  if (s === 'last') return <svg {...p}><path d="M1.5 1h7L5 5l3.5 4h-7L5 5z" fill="currentColor" /></svg>;
  if (s === 'closed') return <svg {...p}><rect x="2" y="2" width="6" height="6" fill="currentColor" /></svg>;
  if (s === 'finalists') return <svg {...p}><path d="M1 2h2v6H1zM4 2h2v6H4zM7 2h2v6H7z" fill="currentColor" /></svg>;
  return <svg {...p}><path d="M5 .5 9.5 5 5 9.5.5 5z" fill="currentColor" /></svg>;
}

export function StateChip({ s, className }: { s: StateWord; className?: string }) {
  return <span className={'ch ch-' + s + (className ? ' ' + className : '')}><Shape s={s} />{STATE_WORD[s]}</span>;
}
