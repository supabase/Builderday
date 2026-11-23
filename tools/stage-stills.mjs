// stage-stills.mjs <outDir> [dir] [size] [filter]: stills of the wall at every scene and step, from /lab/stage with the
// clock held. size is 1920 (1920x1080), 1280 (1280x720) or remote (390x844, the phone). filter keeps the shots whose
// name contains it. Uses tools/still.mjs, six at a time, against the dev server on BASE (http://localhost:4320).
import { spawn } from 'node:child_process'; import { mkdirSync } from 'node:fs';
const [out = 'shots/stage', dir = 'tube', size = '1920', filter = ''] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:4320';
const S = [
  ['doors', 'm=doors'], ['welcome', 'm=doors&scene=welcome'], ['speaker', 'm=doors&scene=speaker'], ['words', 'm=doors&scene=words'],
  ['question', 'm=doors&scene=question'],
  ...[0, 1, 4, 7, 8].map((i) => ['needs-' + i, 'm=needs&step=' + i]),
  ['tour', 'm=doors&scene=tour'], ['say', 'm=doors&scene=say'],
  ...[0, 1, 2, 3].map((i) => ['line-' + i, 'm=line&step=' + i]),
  ['deadline-0', 'm=deadline'], ['deadline-1', 'm=deadline&step=1'],
  ['rules-2', 'm=doors&scene=rules&step=2'], ['prizes-0', 'm=doors&scene=prizes'], ['prizes-1', 'm=doors&scene=prizes&step=1'],
  ['submit-0', 'm=doors&scene=submit'], ['submit-1', 'm=doors&scene=submit&step=1'], ['questions', 'm=doors&scene=questions'],
  ['start', 'm=start'], ['build', 'm=build'], ['late', 'm=late'], ['vote', 'm=vote'],
  ...[0, 1, 3].map((i) => ['top3-' + i, 'm=top3&step=' + i]), ['tombola-0', 'm=tombola'], ['final', 'm=final'],
  ['build-none', 'm=build&content=none'], ['build-many', 'm=build&content=many'], ['vote-long', 'm=vote&content=long'], ['vote-tie', 'm=vote&content=tie'],
  ['vote-none', 'm=vote&content=none'], ['closed-tie', 'm=top3&scene=voting&content=tie'], ['top3-tie', 'm=top3&step=3&content=tie'], ['top3-long', 'm=top3&step=3&content=long'], ['final-none', 'm=final&content=none'],
];
const [W, H, MOB] = size === 'remote' ? [390, 844, '1'] : size === '1280' ? [1280, 720, ''] : [1920, 1080, ''];
mkdirSync(out, { recursive: true });
const jobs = S.filter(([n]) => n.includes(filter)).map(([n, q]) => () => new Promise((res) => {
  const url = `${base}/lab/stage?hold=1&dir=${dir}&only=${size === 'remote' ? 'remote' : 'wall'}&${q}`;
  const p = spawn('node', ['tools/still.mjs', url, `${out}/${dir}-${size}-${n}.png`, '7000', '', '1800'], { env: { ...process.env, W: String(W), H: String(H), MOBILE: MOB, DPR: size === 'remote' ? '2' : '1' }, stdio: 'inherit' });
  p.on('exit', res);
}));
for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map((j) => j()));
console.log(jobs.length + ' stills in ' + out);
