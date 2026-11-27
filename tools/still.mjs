// still.mjs <url> <out.png> <waitMs> [js-after-wait] [extraWaitMs] [clip x,y,w,h]
import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
const [url, out, wait = '8000', js = '', extra = '900', clip = ''] = process.argv.slice(2);
const port = +(process.env.PORT_BASE||9800) + Math.floor(Math.random() * 60), prof = out + '.profile';
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--window-size=${process.env.W||1440},${process.env.H||900}`, '--hide-scrollbars', '--no-first-run', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let ws;
for (let i = 0; i < 50 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(150); }
const sock = new WebSocket(ws); await new Promise(r => sock.addEventListener('open', r)); let id = 0; const pend = new Map();
sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: +(process.env.W||1440), height: +(process.env.H||900), deviceScaleFactor: +(process.env.DPR||1), mobile: process.env.MOBILE==='1' });
await send('Page.navigate', { url }); await sleep(+wait);
if (js) console.log((await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true })).result?.value);
await sleep(+extra);
const p = { format: 'png' }; if (clip) { const [x, y, w, h] = clip.split(',').map(Number); p.clip = { x, y, width: w, height: h, scale: 1 }; }
writeFileSync(out, Buffer.from((await send('Page.captureScreenshot', p)).data, 'base64')); sock.close(); chrome.kill();
