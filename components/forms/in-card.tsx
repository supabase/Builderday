'use client';
import type { ReactNode } from 'react';
import { FM_H, FM_P, StillSheet, useSheetId } from './sheet';
import { BuilderLogo } from '@/components/wheel/builder-logo';
import { CITY_WORD_CAP, DAY_SHORT, EVENT } from '@/lib/day-data';
import { at } from '@/lib/routes';
import './forms.css';
import './in-card.css';

/* The small pages around signing in (/in, /in/confirm): the sign-in sheet's own ticket, standing open on the preview's
   ground, with the mark at the top as the preview's header has it and the emails' foot under it. A link from an email
   lands on the same thing the site shows when it asks for a code. */


/* the heading names the ticket (the frame is labelled by it) */
function Body({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  const id = useSheetId();
  return (
    <>
      <h1 id={id ? id + '-h' : undefined} className={FM_H}>{title}</h1>
      <p className={FM_P}>{text}</p>
      {children ? <div className="mt-6 grid gap-y-4">{children}</div> : null}
    </>
  );
}

export function InCard({ title, text, word = 'Sign in', children }: { title: string; text: string; word?: string; children?: ReactNode }) {
  return (
    <main className="in-page">
      <a className="in-mark" href={at('/')}><BuilderLogo className="in-logo" /><span>{EVENT.short}</span></a>
      <div className="in-ticket">
        <StillSheet label={word} art={{ word, lines: [EVENT.short, DAY_SHORT, CITY_WORD_CAP + ' cities'] }}>
          <Body title={title} text={text}>{children}</Body>
        </StillSheet>
      </div>
      <p className="in-foot"><span aria-hidden="true">[+]</span> {EVENT.name}, {EVENT.date}</p>
    </main>
  );
}
