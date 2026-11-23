// door-stills.mjs: stills of each account state on the preview page, the day home and a city page, at 1440x900 and
// 390x844 (mobile), signed in through the real routes against the local stack. Each person signs in with a six-digit
// code read from the outbox; the browser gets their cookies. The day pages are opened for the run at the desk's
// switch, and the switch and every changed row are put back after.
//   node tools/door-stills.mjs [--site http://localhost:4399] [--out shots/door]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { env, rest } from '../supabase/scripts/env.mjs';

const e = env(), args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SITE = opt('--site', 'http://localhost:4399'), OUT = opt('--out', 'shots/door');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

async function signIn(email) {
  const jar = new Map();
  const go = async (p, body) => {
    const r = await fetch(SITE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: Array.from(jar, ([k, v]) => k + '=' + v).join('; ') }, body: JSON.stringify(body) });
    (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
    return r.json().catch(() => ({}));
  };
  let s = await go('/api/auth/code', { email });
  if (s.wait) { await sleep((s.wait + 1) * 1000); await go('/api/auth/code', { email }); }
  const [row] = await rest(e, 'outbox?to_email=eq.' + encodeURIComponent(email) + '&template=eq.code&order=created_at.desc&limit=1&select=data');
  await go('/api/auth/verify', { email, code: row.data.code });
  return Array.from(jar, ([name, value]) => ({ name, value }));
}

let nextPort = Math.floor(Math.random() * 90);
/* a Chrome that does not come up in time is tried once more */
async function shot(url, out, o) { try { await shot1(url, out, o); } catch { await shot1(url, out, o); } }
async function shot1(url, out, { w, h, mobile, cookies = [], open = false, wait = 7000 }) {
  const port = 9700 + (nextPort++ % 90), prof = out + '.profile';
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--window-size=${w},${h}`, '--hide-scrollbars', '--no-first-run', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws; for (let i = 0; i < 120 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* not up */ } await sleep(150); }
  if (!ws) { chrome.kill(); throw new Error('Chrome did not start for ' + out); }
  const sock = new WebSocket(ws); await new Promise((r) => sock.addEventListener('open', r)); let id = 0; const pend = new Map();
  sock.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Network.enable');
  for (const c of cookies) await send('Network.setCookie', { name: c.name, value: decodeURIComponent(c.value) === c.value ? c.value : c.value, url: SITE, path: '/' });
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url: SITE + url }); await sleep(wait);
  /* a signed-in person: wait until the page knows them (the account no longer reads "Sign in"), up to ten seconds */
  for (let i = 0; cookies.length && i < 40; i++) {
    const r = await send('Runtime.evaluate', { expression: "!document.querySelector('.ac-cell[data-state=out], .pf-acct[data-state=out], .pf-tops [data-acct=out]')", returnByValue: true });
    if (r?.result?.value) break; await sleep(250);
  }
  if (open) { await send('Runtime.evaluate', { expression: "(document.querySelector('.ac-cell') || document.querySelector('.pf-tops [data-acct]'))?.click()" }); await sleep(1200); }
  /* the editor key is the person's own: the still shows its shape, never its letters */
  /* text nodes only, so the line keeps its word spans and wraps as it does on the page */
  await send('Runtime.evaluate', { expression: "document.querySelectorAll('.gr-cmd code').forEach((c) => { const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) n.data = n.data.replace(/([A-Za-z0-9_-]{40,60})/g, (k) => k.slice(0, 4) + '…(key hidden)'); })" });
  writeFileSync(out, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  sock.close(); chrome.kill(); await sleep(300); try { rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Chrome still closing: left for the next run */ }
}

const [ev0] = await rest(e, 'events?select=id,open');
const hana = (await rest(e, 'people?email=eq.hana@builder.test&select=id'))[0];
const [hanaPass] = await rest(e, 'passes?person=eq.' + hana.id + '&select=id,editor_seen_at');
try {
  await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify({ open: 'open' }) });
  await rest(e, 'passes?id=eq.' + hanaPass.id, { method: 'PATCH', body: JSON.stringify({ editor_seen_at: new Date(Date.now() - 3600e3).toISOString() }) });
  await sleep(5500);
  const people = [
    ['out', null],
    ['place', 'femi@builder.test'],
    ['connected', 'hana@builder.test'],
    ['none', 'still.noplace@door.test'],
  ];
  /* the preview at the top, at the board and at Get ready; its two lab modes (the account beside the register cell,
     Sign in only in the header's cells); the day home and a city page */
  const pages = [
    ['preview', '/preview?still=1'], ['preview-cities', '/preview?still=1#cities'], ['preview-ready', '/preview?still=1#ready'],
    ['lab-beside', '/lab/fold?bare&still=1&acct=beside#cities'], ['lab-toplink', '/lab/fold?bare&still=1&acctTop=link'],
    ['home', '/?still=1'], ['city', '/city/berlin?still=1'],
  ];
  const sheet = new Set(['preview', 'home', 'city']);
  const sizes = [['1440', { w: 1440, h: 900, mobile: false }], ['390', { w: 390, h: 844, mobile: true }]];
  for (const [who, email] of people) {
    const cookies = email ? await signIn(email) : [];
    /* each view is its own browser, three at a time */
    const jobs = pages.flatMap(([pg, url]) => sizes.flatMap(([sz, o]) => [
      () => shot(url, `${OUT}/${pg}-${who}-${sz}.png`, { ...o, cookies }),
      ...(sheet.has(pg) ? [() => shot(url, `${OUT}/${pg}-${who}-sheet-${sz}.png`, { ...o, cookies, open: true })] : []),
    ]));
    await Promise.all(Array.from({ length: 3 }, async () => { while (jobs.length) await jobs.shift()(); }));
    console.log(who, 'done');
  }
} finally {
  await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify({ open: ev0.open }) });
  await rest(e, 'passes?id=eq.' + hanaPass.id, { method: 'PATCH', body: JSON.stringify({ editor_seen_at: hanaPass.editor_seen_at }) });
  await rest(e, 'people?email=eq.still.noplace@door.test', { method: 'DELETE' }).catch(() => {});
}
