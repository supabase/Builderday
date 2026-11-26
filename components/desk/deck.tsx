'use client';
/* Stage: the city's deck as a list. Add a slide (a speaker, words, a link, or a product), move one up or down, hide or show it,
   delete one of your own. The event's own scenes can be hidden, never deleted. */
import { useState, type FormEvent } from 'react';
import type { DeskAct, DeskCity, DeskScene, DeskState } from '@/lib/event/desk';
import { Sec, Status, usePress, type Ask } from './parts';
import { at } from '@/lib/routes';

const KIND: Record<string, string> = { speaker: 'Speaker', words: 'Words', link: 'Link', product: 'Product' };
type Kind = 'speaker' | 'words' | 'link' | 'product';
const KINDS: Kind[] = ['speaker', 'words', 'link', 'product'];
function sub(sc: DeskScene): string {
  const d = sc.data as Record<string, string | string[]>;
  if (sc.kind === 'speaker') return String(d.role || (d.name && d.name !== sc.title ? d.name : ''));
  if (sc.kind === 'words') return (Array.isArray(d.lines) ? d.lines : []).join(' · ') || String(d.heading || '');
  if (sc.kind === 'link') return String(d.url || '');
  if (sc.kind === 'product') return String(d.line || d.url || '');
  return '';
}

export function Deck({ s, c, act, ask }: { s: DeskState; c: DeskCity; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run, say } = usePress(act);
  const [kind, setKind] = useState<Kind>('speaker');
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setF((o) => ({ ...o, [k]: e.target.value }));
  const order = s.scenes.map((x) => x.id);
  const move = (id: string, by: -1 | 1) => {
    const i = order.indexOf(id), j = i + by; if (j < 0 || j >= order.length) return;
    const next = order.slice(); next[i] = order[j]; next[j] = id;
    /* focus stays on the slide that moved: on the same key, or the other one once it reaches an end */
    run('s:' + id, 'scene.move', { city: c.id, order: next }).then(() => requestAnimationFrame(() => {
      const same = document.querySelector<HTMLButtonElement>('[data-mv="' + id + ':' + by + '"]');
      (same && !same.disabled ? same : document.querySelector<HTMLButtonElement>('[data-mv="' + id + ':' + -by + '"]'))?.focus();
    }));
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const data = kind === 'speaker' ? { name: f.name || '', role: f.role || '', line: f.line || '', picture: f.picture || '' }
      : kind === 'words' ? { heading: f.heading || '', lines: [f.l1, f.l2, f.l3].filter((x): x is string => !!x && !!x.trim()) }
        : kind === 'product' ? { heading: f.heading || '', line: f.line || '', picture: f.picture || '', url: f.url || '' }
          : { url: f.url || '', label: f.label || '' };
    const title = kind === 'speaker' ? f.name : kind === 'words' || kind === 'product' ? f.heading : f.label;
    if (kind === 'link' && !/^https?:\/\//.test(f.url || '')) return say('add', 'Use the full address, starting https://.', true);
    if (kind === 'product' && f.url && !/^https?:\/\//.test(f.url)) return say('add', 'Use the full address for the link, starting https://.', true);
    run('add', 'scene.add', { city: c.id, kind, title, data }, () => { setF({}); return 'Added at the end of the deck. Move it where it goes.'; });
  };
  return (
    <>
      <Sec title={c.name + '’s deck'} id="dk-deck" aside={s.scenes.length + (s.scenes.length === 1 ? ' slide' : ' slides')}>
        <p className="dk-note">The stage shows these in order. Drive it from <a className="dk-t" href={at('/desk/' + c.id + '/remote')}>the remote</a>.</p>
        <ol className="dk-list">
          {s.scenes.map((sc, i) => {
            const k = 's:' + sc.id;
            return (
              <li key={sc.id} className={'dk-row' + (sc.hidden ? ' is-off' : '')}>
                <div className="dk-who">
                  <b><span className="dk-deck-no">{String(i + 1).padStart(2, '0')}</span>{sc.title}</b>
                  {sc.event ? null : <span>{KIND[sc.kind] || sc.kind}{sub(sc) ? ' · ' + sub(sc) : ''}</span>}
                  {sc.hidden ? <div className="dk-marks"><span className="dk-mark-box">Hidden</span></div> : null}
                  <Status said={said} k={k} />
                </div>
                <div className="dk-acts">
                  <button type="button" className="dk-t" disabled={busy === k || i === 0} data-mv={sc.id + ':-1'} onClick={() => move(sc.id, -1)} aria-label={'Move ' + sc.title + ' up'}>Up</button>
                  <button type="button" className="dk-t" disabled={busy === k || i === s.scenes.length - 1} data-mv={sc.id + ':1'} onClick={() => move(sc.id, 1)} aria-label={'Move ' + sc.title + ' down'}>Down</button>
                  <button type="button" className="dk-t" disabled={busy === k} aria-label={(sc.hidden ? 'Show ' : 'Hide ') + sc.title} onClick={() => run(k, 'scene.update', { city: c.id, id: sc.id, hidden: !sc.hidden })}>{sc.hidden ? 'Show' : 'Hide'}</button>
                  {!sc.event ? <button type="button" className="dk-t" disabled={busy === k} aria-label={'Delete ' + sc.title} onClick={() => ask({ title: 'Delete “' + sc.title + '”?', text: 'It comes off the deck for good.', yes: 'Delete', danger: true, run: () => run(k, 'scene.remove', { city: c.id, id: sc.id }) })}>Delete</button> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </Sec>
      <Sec title="Add a slide" id="dk-add-slide">
        <form className="dk-form" onSubmit={add}>
          <fieldset className="dk-seg">
            <legend className="sr-only">Kind of slide</legend>
            {KINDS.map((k) => <label key={k}><input type="radio" name="dk-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />{KIND[k]}</label>)}
          </fieldset>
          {kind === 'speaker' ? (
            <>
              <div className="dk-two">
                <div className="dk-f"><label className="dk-l" htmlFor="dk-sp-n">Name</label><input id="dk-sp-n" className="fm-i" required maxLength={80} autoComplete="off" value={f.name || ''} onChange={set('name')} /></div>
                <div className="dk-f"><label className="dk-l" htmlFor="dk-sp-r">Title{' '}<small>Optional</small></label><input id="dk-sp-r" className="fm-i" maxLength={120} autoComplete="off" value={f.role || ''} onChange={set('role')} /></div>
              </div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-sp-l">One line{' '}<small>Optional</small></label><input id="dk-sp-l" className="fm-i" maxLength={120} autoComplete="off" value={f.line || ''} onChange={set('line')} /></div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-sp-p">Picture address{' '}<small>Optional</small></label><input id="dk-sp-p" className="fm-i" type="url" placeholder="https://" autoComplete="off" spellCheck={false} value={f.picture || ''} onChange={set('picture')} /></div>
            </>
          ) : kind === 'product' ? (
            <>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-pr-h">Product</label><input id="dk-pr-h" className="fm-i" required maxLength={80} autoComplete="off" placeholder="Edge Functions" value={f.heading || ''} onChange={set('heading')} /></div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-pr-l">One line{' '}<small>Optional</small></label><input id="dk-pr-l" className="fm-i" maxLength={120} autoComplete="off" value={f.line || ''} onChange={set('line')} /></div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-pr-p">Picture address{' '}<small>Optional</small></label><input id="dk-pr-p" className="fm-i" type="url" placeholder="https://" autoComplete="off" spellCheck={false} value={f.picture || ''} onChange={set('picture')} /></div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-pr-u">Link{' '}<small>Optional</small></label><input id="dk-pr-u" className="fm-i" type="url" placeholder="https://" autoComplete="off" spellCheck={false} value={f.url || ''} onChange={set('url')} /></div>
              <p className="dk-note" style={{ margin: 0 }}>The stage shows the link as a QR code the room can scan.</p>
            </>
          ) : kind === 'words' ? (
            <>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-w-h">Heading</label><input id="dk-w-h" className="fm-i" required maxLength={80} autoComplete="off" value={f.heading || ''} onChange={set('heading')} /></div>
              {(['l1', 'l2', 'l3'] as const).map((k, n) => <div key={k} className="dk-f"><label className="dk-l" htmlFor={'dk-w-' + k}>Line {n + 1}{' '}<small>Optional</small></label><input id={'dk-w-' + k} className="fm-i" maxLength={120} autoComplete="off" value={f[k] || ''} onChange={set(k)} /></div>)}
            </>
          ) : (
            <>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-ln-u">Address</label><input id="dk-ln-u" className="fm-i" type="url" required placeholder="https://" autoComplete="off" spellCheck={false} value={f.url || ''} onChange={set('url')} /></div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-ln-l">What it is</label><input id="dk-ln-l" className="fm-i" required maxLength={80} autoComplete="off" value={f.label || ''} onChange={set('label')} /></div>
              <p className="dk-note" style={{ margin: 0 }}>It opens in a new tab on the stage laptop while the stage holds a card with its name.</p>
            </>
          )}
          <div className="dk-acts-row"><button type="submit" className="fm-b" disabled={busy === 'add'} aria-busy={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Add the slide'}</button></div>
          <Status said={said} k="add" />
        </form>
      </Sec>
    </>
  );
}
