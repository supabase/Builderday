/* POST /api/save?name=<lab>: the tuning pages' Save. Writes the posted config to saved/<name>.config.json, plus a
   timestamped copy, so the real pages read the new look on their next build. Development only: a deployed site has
   no files to write, so it refuses, and the tuning page falls back to copying the config. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const NAMES = ['team', 'day', 'city', 'seal', 'lab-home', 'lab-city', 'motion', 'wheel', 'screen', 'parts', 'day-home', 'day-city', 'explain', 'footer', 'neo', 'stage', 'fold', 'ending', 'sheet', 'email', 'family', 'hero'];

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return Response.json({ error: 'Saving writes files, so it only works on the development server.' }, { status: 403 });
  const name = (new URL(req.url).searchParams.get('name') || '').replace(/[^a-z0-9-]/gi, '');
  if (NAMES.indexOf(name) < 0) return Response.json({ error: 'Unknown config: ' + name + '.' }, { status: 400 });
  let cfg: unknown;
  try { cfg = await req.json(); } catch { return Response.json({ error: 'The body is not JSON.' }, { status: 400 }); }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return Response.json({ error: 'The config must be an object.' }, { status: 400 });
  const dir = path.join(process.cwd(), 'saved'), stamp = new Date().toISOString().replace(/[:.]/g, '-'), pretty = JSON.stringify(cfg, null, 2) + '\n';
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name + '.config.json'), pretty);
  await writeFile(path.join(dir, name + '-' + stamp + '.json'), pretty);
  return Response.json({ path: 'saved/' + name + '.config.json' });
}
