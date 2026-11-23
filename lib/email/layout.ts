/* layout.ts: a letter (the words of one email, lib/event/mail.ts) set in the look (look.ts) as HTML and plain text.
   Pure. Built for mail clients, not browsers: tables, inline styles, hex colours; the <style> block only adds to what
   the inline styles already do (a larger picture past 620 px, Outlook.com's dark mode, Apple's data detectors).

   What the clients do with it (checked 2026-11-23 against caniemail.com and Litmus's dark mode guide):
   - the picture is one <div> a row with &nbsp; for every space, because Gmail's apps and Outlook.com drop
     `white-space: pre`; the font stack ends in a generic family so Outlook never falls back to Times;
   - it is drawn for a phone first (at most about 340 px wide) and only grows where the media query is read;
   - Gmail iOS and Outlook for Windows invert a dark email to light: the ground is also a one-colour gradient (Gmail
     leaves background images alone), and the paper ground exists for whoever would rather not risk it;
   - the code is real, selectable digits outside the picture; the picture only repeats it. */
import { makeArt, type Art, type Ink } from './art';
import { EMAIL_INK, type EmailLook } from './look';

export type Letter = {
  subject: string;
  /* the line an inbox shows after the subject */
  pre: string;
  /* drawn in the picture: a code, a city's three letters, HOST */
  word: string;
  /* the stub's parts and the board's row */
  stub: string[];
  board?: { city: string; code: string; starts: string; status: string };
  /* the first line, large; then the paragraphs */
  head: string; lines: string[];
  /* a code to show as real digits */
  code?: string;
  link?: { href: string; label: string };
  after?: string[];
  /* the line at the foot: why this came */
  why: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const MONO = "Menlo,Consolas,'Courier New',monospace";
const SANS = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const GMONO = "'Geist Mono'," + MONO;

/* a hex colour mixed toward another: t of a, the rest b */
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) * t + p(b, i) * (1 - t)).toString(16).padStart(2, '0')).join('');
}

/* the picture: one div a row, a span a run of one ink, &nbsp; for spaces */
function artHtml(art: Art, look: EmailLook, inks: Record<Ink, string>, center: boolean): string {
  const lh = Math.round(look.sizePhone * look.leading);
  const row = (r: number) => {
    const line = art.rows[r], ink = art.inks[r];
    let out = '', i = 0;
    while (i < line.length) {
      let j = i; while (j < line.length && ink[j] === ink[i]) j++;
      const run = line.slice(i, j).replace(/ /g, ' ');
      const txt = run.replace(/ /g, '&nbsp;');
      out += ink[i] === 0 ? txt : '<span style="color:' + inks[ink[i]] + '">' + txt + '</span>';
      i = j;
    }
    return '<div class="art" style="font-family:' + MONO + ';font-size:' + look.sizePhone + 'px;line-height:' + lh + 'px;mso-line-height-rule:exactly;white-space:nowrap;letter-spacing:0;-webkit-text-size-adjust:none;text-size-adjust:none">' + out + '</div>';
  };
  return '<div aria-hidden="true" role="presentation" style="' + (center ? 'text-align:center;' : '') + '-webkit-text-size-adjust:none;text-size-adjust:none;overflow:hidden">' + art.rows.map((_, r) => row(r)).join('') + '</div>';
}

export function layout(l: Letter, look: EmailLook, city: string | null): { html: string; text: string } {
  /* ground none: the black ticket as on night, on no background at all (the inbox's own shows around it); `out` is
     the page around the ticket, where the foot sits */
  const bare = look.ground === 'none', night = look.ground === 'night', c = EMAIL_INK[bare ? 'night' : look.ground], out = EMAIL_INK[look.ground];
  const inks: Record<Ink, string> = { 0: c.ink, 1: c.ink, 2: mix(c.ink, c.ground, look.shadowInk), 3: mix(c.ink, c.ground, look.gridInk), 4: c.green, 5: mix(c.ink, c.ground, Math.min(1, look.gridInk + 0.25)) };
  const showArt = look.mode !== 'plain' && (l.word || look.globe);
  const art = showArt ? makeArt(look, { word: l.word, city }) : null;
  const sans = look.webfont ? SANS : SANS.replace('Geist,', ''), mono = look.webfont ? GMONO : MONO;
  const card = look.mode === 'pass' && !bare ? c.card : c.ground;
  /* the page's ground: ground none paints none, so the inbox's own shows through */
  const bg = (h: string) => (bare ? '' : 'background-color:' + h + ';background-image:linear-gradient(' + h + ',' + h + ')');
  const fill = (h: string) => 'background-color:' + h + ';background-image:linear-gradient(' + h + ',' + h + ')';
  const big = Math.round(look.size * look.leading);

  const stubLine = '<div class="ink3" style="font:500 11px/16px ' + mono + ';letter-spacing:0.06em;text-transform:uppercase;color:' + c.ink2 + '">' + l.stub.map(esc).join('&nbsp;&nbsp;·&nbsp;&nbsp;') + '</div>';
  const p = (s: string) => '<p class="ink2" style="margin:0 0 14px;font:400 15px/23px ' + sans + ';color:' + c.ink2 + '">' + esc(s) + '</p>';
  const head = '<h1 class="ink" style="margin:0 0 16px;font:500 24px/30px ' + sans + ';letter-spacing:-0.01em;color:' + c.ink + '">' + esc(l.head) + '</h1>';
  const code = l.code ? '<div class="ink" style="margin:4px 0 20px;font:500 34px/40px ' + mono + ';letter-spacing:0.18em;color:' + c.ink + '">' + esc(l.code) + '</div>' : '';
  const button = l.link ? (() => {
    const h = esc(l.link.href), t = esc(l.link.label);
    if (look.button === 'bracket') return '<p style="margin:22px 0 10px"><a href="' + h + '" style="font:500 15px/22px ' + mono + ';color:' + c.green + ';text-decoration:none;letter-spacing:0.02em">[&nbsp;' + t + '&nbsp;&rarr;&nbsp;]</a></p>';
    const solid = look.button === 'solid';
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px"><tr><td style="' + (solid ? fill(c.fill) + ';' : 'border:1px solid ' + c.ink + ';') + 'border-radius:0"><a href="' + h + '" style="display:inline-block;padding:13px 20px;font:500 15px/20px ' + sans + ';color:' + (solid ? c.onFill : c.ink) + ';text-decoration:none">' + t + '&nbsp;&nbsp;&rarr;</a></td></tr></table>';
  })() : '';
  const address = l.link ? '<p style="margin:0 0 18px;font:400 12px/18px ' + mono + ';color:' + c.ink3 + ';word-break:break-all">Or open: <a href="' + esc(l.link.href) + '" style="color:' + c.ink2 + ';text-decoration:underline">' + esc(l.link.href) + '</a></p>' : '';
  const after = (l.after || []).map(p).join('');
  const body = head + code + l.lines.map(p).join('') + button + address + after;

  const boardRow = l.board ? (() => {
    const cell = (k: string, v: string, green = false) => '<td valign="top" style="padding:0 12px 0 0"><div style="font:500 10px/14px ' + mono + ';letter-spacing:0.06em;text-transform:uppercase;color:' + c.ink3 + '">' + k + '</div><div style="font:500 15px/22px ' + mono + ';color:' + (green ? c.green : c.ink) + '">' + esc(v) + '</div></td>';
    const b = l.board!;
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ' + c.line + ';border-bottom:1px solid ' + c.line + '"><tr><td style="padding:12px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
      + cell('City', b.city) + cell('Code', b.code) + cell('Starts', b.starts) + cell('Status', b.status, true) + '</tr></table></td></tr></table>';
  })() : '';

  /* the perforation: a dashed line with a notch cut at each end, the ground showing through */
  const perf = look.perf ? '<tr><td style="padding:0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
    + '<td width="12" style="width:12px;height:24px;' + fill(bare ? '#ffffff' : c.ground) + ';border-radius:0 12px 12px 0;font-size:0;line-height:0">&nbsp;</td>'
    + '<td style="padding:0 10px"><div style="border-top:1px dashed ' + c.line + ';height:0;font-size:0;line-height:0">&nbsp;</div></td>'
    + '<td width="12" style="width:12px;height:24px;' + fill(bare ? '#ffffff' : c.ground) + ';border-radius:12px 0 0 12px;font-size:0;line-height:0">&nbsp;</td>'
    + '</tr></table></td></tr>' : '<tr><td style="padding:0 28px"><div style="border-top:1px solid ' + c.line + ';height:0;font-size:0;line-height:0">&nbsp;</div></td></tr>';

  const pad = 'padding:0 16px';
  let inner = '';
  if (look.mode === 'pass') {
    /* on no ground the ticket has no border: a black one ran past the notches and drew a ring round each hole */
    inner = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tk" style="' + fill(card) + (bare ? '' : ';border:1px solid ' + c.line) + '">'
      + '<tr><td class="pad" style="padding:18px 16px 6px">' + stubLine + '</td></tr>'
      + (art ? '<tr><td class="pad" style="' + pad + ';padding-bottom:10px">' + artHtml(art, look, inks, false) + '</td></tr>' : '')
      + perf
      + '<tr><td class="pad" style="padding:22px 16px 14px">' + body + '</td></tr></table>';
  } else if (look.mode === 'board') {
    inner = '<div style="padding:6px 0 10px">' + stubLine + '</div>'
      + (art ? '<div style="padding:4px 0 14px">' + artHtml(art, look, inks, false) + '</div>' : '')
      + boardRow + '<div style="padding:24px 0 0">' + body + '</div>';
  } else if (look.mode === 'globe') {
    inner = '<div style="padding:6px 0 0;text-align:center">' + stubLine + '</div>'
      + (art ? '<div style="padding:16px 0 18px">' + artHtml(art, look, inks, true) + '</div>' : '')
      + '<div style="border-top:1px solid ' + c.line + ';padding:26px 0 0">' + body + '</div>';
  } else {
    inner = '<div style="padding:6px 0 22px">' + stubLine + '</div><div style="border-top:1px solid ' + c.line + ';padding:26px 0 0">' + body + '</div>';
  }

  /* ground none: the other layouts get the black ticket too, without the stub's perforation */
  if (bare && look.mode !== 'pass') inner = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tk" style="' + fill(c.ground) + '"><tr><td class="pad" style="padding:20px 16px 18px">' + inner + '</td></tr></table>';

  const foot = '<div style="padding:22px 4px 0;font:500 11px/17px ' + mono + ';letter-spacing:0.04em;color:' + out.ink3 + '"><span style="color:' + out.green + '">[+]</span>&nbsp;' + esc(l.stub[0] || '') + '</div>'
    + '<div style="padding:6px 4px 0;font:400 12px/18px ' + sans + ';color:' + out.ink3 + '">' + esc(l.why) + '</div>';

  const scheme = night ? 'dark' : 'light';
  const html = '<!doctype html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="' + scheme + '"><meta name="supported-color-schemes" content="' + scheme + '"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no">'
    + '<title>' + esc(l.subject) + '</title>'
    + (look.webfont ? '<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@500&display=swap" rel="stylesheet"><!--<![endif]-->' : '')
    + '<style>:root{color-scheme:' + scheme + ';supported-color-schemes:' + scheme + '}body{margin:0;padding:0;-webkit-text-size-adjust:none;text-size-adjust:none}'
    + 'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font:inherit!important}'
    + '@media (min-width:620px){.art{font-size:' + look.size + 'px!important;line-height:' + big + 'px!important}.pad{padding-left:32px!important;padding-right:32px!important}}'
    + '[data-ogsc] .ink{color:' + c.ink + '!important}[data-ogsc] .ink2{color:' + c.ink2 + '!important}[data-ogsb] .tk{background-color:' + card + '!important}' + (bare ? '' : '[data-ogsb] .bg{background-color:' + c.ground + '!important}') + '</style></head>'
    + '<body class="bg" style="margin:0;padding:0;' + bg(c.ground) + '">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">' + esc(l.pre) + '&#8199;&#65279;&#847;'.repeat(20) + '</div>'
    + '<table role="presentation" class="bg" cellpadding="0" cellspacing="0" border="0" width="100%" style="' + bg(c.ground) + '"><tr><td align="center" style="padding:28px 10px 40px">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px"><tr><td style="text-align:left">' + inner + foot + '</td></tr></table>'
    + '</td></tr></table></body></html>';

  const text = [l.stub.join(' · '), '', l.head, ...(l.code ? ['', l.code] : []), '', ...l.lines.flatMap((s) => [s, '']),
    ...(l.link ? [l.link.label + ': ' + l.link.href, ''] : []), ...(l.after || []).flatMap((s) => [s, '']), '--', l.why].join('\n');
  return { html, text };
}
