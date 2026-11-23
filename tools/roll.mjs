// roll.mjs <url> <outPrefix> <waitMs> : one still per screen down the whole page, plus a facts dump
import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
const [url, out, wait = '8000', maxShots = '14'] = process.argv.slice(2);
const W = +(process.env.W || 1440), H = +(process.env.H || 900);
const port = +(process.env.PORT_BASE || 9800) + Math.floor(Math.random() * 60), prof = out + '.profile';
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws;
for (let i = 0; i < 50 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(150); }
const sock = new WebSocket(ws); await new Promise((r) => sock.addEventListener('open', r)); let id = 0; const pend = new Map();
sock.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: process.env.MOBILE === '1' });
await send('Page.navigate', { url }); await sleep(+wait);
const total = await ev('document.documentElement.scrollHeight');
const facts = await ev(`(() => {
  const pick = (el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), text: (el.textContent || '').trim().slice(0, 40), font: s.fontFamily.split(',')[0], size: s.fontSize, weight: s.fontWeight, track: s.letterSpacing, lh: s.lineHeight, color: s.color, bg: s.backgroundColor, radius: s.borderRadius, border: s.borderTopWidth + ' ' + s.borderTopColor, pad: s.padding, h: Math.round(r.height), w: Math.round(r.width), x: Math.round(r.left), tr: s.transitionDuration + ' ' + s.transitionTimingFunction.slice(0, 40), upper: s.textTransform }; };
  const q = (sel, n = 8) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).slice(0, n).map(pick);
  const b = getComputedStyle(document.body);
  return JSON.stringify({ body: { bg: b.backgroundColor, color: b.color, font: b.fontFamily.split(',')[0] }, h1: q('h1'), h2: q('h2', 12), h3: q('h3', 6), buttons: q('button, a[class*="btn"], a[class*="cta"], a[class*="key"], a[class*="act"]', 30), header: q('header, header *', 14), sections: [...document.querySelectorAll('section, main > div, footer')].slice(0, 30).map((e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { cls: String(e.className).slice(0, 50), id: e.id, top: Math.round(r.top + scrollY), h: Math.round(r.height), x: Math.round(r.left), w: Math.round(r.width), pl: s.paddingLeft, pt: s.paddingTop, pb: s.paddingBottom, bt: s.borderTopWidth + ' ' + s.borderTopColor, bg: s.backgroundColor }; }) }, null, 1);
})()`);
writeFileSync(out + '.facts.json', facts);
const n = Math.min(+maxShots, Math.ceil(total / H));
for (let i = 0; i < n; i++) {
  await ev(`window.scrollTo(0, ${i * H})`); await sleep(1300);
  writeFileSync(`${out}-${String(i).padStart(2, '0')}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
}
console.log(out, 'height', total, 'shots', n);
sock.close(); chrome.kill();
