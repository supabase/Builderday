'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import saved from '@/saved/team.config.json';
import { clampTeam, type TeamLook } from './team-config';
import { teamArt, type Seat, type TeamInk } from './team-art';

/* The team's picture in the account sheet: characters in a <pre>, one span for each run of one ink, sized so the whole
   row of seats fits the sheet (a container query; at most the look's size). Decoration only: the names, the code and
   the count are real text beside it. The lab hands its knobs down through TeamLookProvider. */

const SAVED = clampTeam(saved as Partial<TeamLook>);
const LookCtx = createContext<TeamLook | null>(null);
export const TeamLookProvider = ({ value, children }: { value: TeamLook; children: ReactNode }) => <LookCtx.Provider value={value}>{children}</LookCtx.Provider>;
export const useTeamLook = () => useContext(LookCtx) || SAVED;

const CLS: Record<TeamInk, string | undefined> = { 0: undefined, 1: undefined, 2: 'tm-2', 3: 'tm-3', 4: 'tm-4' };

export function TeamPicture({ seats, code }: { seats: Seat[]; code: string }) {
  const look = useTeamLook();
  const art = useMemo(() => (look.mode === 'none' ? null : teamArt(look, seats, code)), [look, seats, code]);
  if (!art) return null;
  return (
    <div className="tm-wrap" aria-hidden="true">
      <pre className="tm-art" style={{ ['--cols' as string]: art.cols, ['--max' as string]: look.size + 'px' }}>
        {art.rows.map((row, r) => {
          const out: ReactNode[] = []; let from = 0;
          for (let c = 1; c <= row.length; c++) {
            if (c === row.length || art.inks[r][c] !== art.inks[r][from]) {
              const k = art.inks[r][from], text = row.slice(from, c);
              out.push(CLS[k] ? <span key={from} className={CLS[k]}>{text}</span> : text);
              from = c;
            }
          }
          return <span key={r} className="tm-row">{out}{'\n'}</span>;
        })}
      </pre>
    </div>
  );
}
