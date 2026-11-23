/* The boarding pass: a project as a pass. It is the share card (and, later, the share image). Label over value, in
   cells, borders shared; a torn stub with the city's code and page. Every field is the project's own: the name, the
   city, the builder, the minute it came in, its place and votes now, and its link. Nothing on it is made up to look
   like data: there is no barcode. */
import { EVENT } from '@/lib/day-data';

export type PassData = {
  project: string; pitch?: string; city: string; code: string; builder: string;
  entered: string; place: string; votes: string; link: string; date: string;
};

export function BoardingPass({ d, className }: { d: PassData; className?: string }) {
  return (
    <article className={'bp' + (className ? ' ' + className : '')} aria-label={'Boarding pass for ' + d.project}>
      <div className="bp-main">
        <div className="bp-top"><span className="bp-k">{EVENT.name}</span><span className="bp-k">{d.date}</span></div>
        <p className="bp-name">{d.project}</p>
        {d.pitch ? <p className="bp-pitch">{d.pitch}</p> : null}
        <dl className="bp-cells">
          <div><dt>City</dt><dd>{d.city}</dd></div>
          <div><dt>Builder</dt><dd>{d.builder}</dd></div>
          <div><dt>Entered</dt><dd>{d.entered}</dd></div>
          <div><dt>Place</dt><dd>{d.place}</dd></div>
          <div><dt>Votes</dt><dd>{d.votes}</dd></div>
          <div className="bp-wide"><dt>Link</dt><dd>{d.link}</dd></div>
        </dl>
      </div>
      <div className="bp-stub" aria-hidden="true">
        <span className="bp-code">{d.code}</span>
        <span className="bp-k">{d.city}</span>
        <span className="bp-k">{d.place}</span>
      </div>
    </article>
  );
}
