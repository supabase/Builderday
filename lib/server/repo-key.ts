/* repo-key.ts: is this person's editor key in their repository?
   Editors write their server settings into the project folder when asked to (a project-level install), and a public
   repository then carries the key. We read the files editors write there, and any other file whose name has "mcp" in
   it, and look for the person's current key. Found: the key is replaced (editor_version goes up, so the old line stops
   and the emailed link does not), the entry is kept, the hosts see a flag, and the answer says what to do.
   GitHub's tree is one API call; the files are read from raw.githubusercontent.com, which does not count against the
   API's hourly limit. With HACKDAY_FAKE_GITHUB on the local stack, a repository whose name has "leak" in it carries
   the key in .mcp.json, so the path can be tested without GitHub. */
import { admin } from './supabase';
import { editorKeyFor, type Pass } from './people';

const T = 5000, MAX_FILES = 20, MAX_BYTES = 200_000;
/* where editors put a project-level server (each editor's docs, read 2026-11-18) */
const KNOWN = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', '.gemini/settings.json', 'opencode.json', '.kiro/settings/mcp.json', '.junie/mcp/mcp.json', '.devin/mcp_config.json', '.codex/config.toml'];

const fake = () => process.env.HACKDAY_FAKE_GITHUB === '1' && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '');

/* the paths that carry the key, [] when none does, null when the repository could not be read */
export async function keyInRepo(repo: string, key: string): Promise<string[] | null> {
  const m = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/i.exec(repo);
  if (!m) return null;
  if (fake()) return /leak/i.test(m[2]) ? ['.mcp.json'] : [];
  const [, owner, name] = m;
  try {
    const h: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'SupabaseBuilderDay/1' };
    if (process.env.GITHUB_TOKEN) h.authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
    const at = 'https://api.github.com/repos/' + owner + '/' + name + '/git/trees/HEAD?recursive=1';
    let r = await fetch(at, { headers: h, signal: AbortSignal.timeout(T) });
    /* an organisation that refuses the token by its own rules: a public repository still reads without one */
    if ((r.status === 401 || r.status === 403) && h.authorization) { delete h.authorization; r = await fetch(at, { headers: h, signal: AbortSignal.timeout(T) }); }
    if (r.status === 404 || r.status === 409) return [];   /* not found, or an empty repository: nothing to carry a key */
    if (!r.ok) return null;
    const j = await r.json() as { tree?: { path: string; type: string; size?: number }[] };
    const files = (j.tree || []).filter((t) => t.type === 'blob' && (t.size || 0) <= MAX_BYTES)
      .filter((t) => KNOWN.indexOf(t.path) >= 0 || KNOWN.some((k) => t.path.endsWith('/' + k)) || /mcp/i.test(t.path.split('/').pop() || ''))
      .slice(0, MAX_FILES);
    const found: string[] = [];
    await Promise.all(files.map(async (f) => {
      try {
        const raw = await fetch('https://raw.githubusercontent.com/' + owner + '/' + name + '/HEAD/' + f.path.split('/').map(encodeURIComponent).join('/'), { signal: AbortSignal.timeout(T) });
        if (raw.ok && (await raw.text()).indexOf(key) >= 0) found.push(f.path);
      } catch { /* one file that does not answer is not a finding */ }
    }));
    return found.sort();
  } catch { return null; }
}

/* the key is replaced: the old editor line stops, the link in the email does not */
export async function replaceEditorKey(pass: Pass, why: string, by?: string | null): Promise<void> {
  const db = admin();
  await db.from('passes').update({ editor_version: pass.editor_version + 1, editor_seen_at: null }).eq('id', pass.id);
  await db.from('log').insert({ who: by || pass.person, what: why, city: pass.city, target: pass.person });
}

/* look, and replace when found; the words to add to the answer, or null */
export async function guardKey(pass: Pass, repo: string): Promise<{ found: string[]; say: string } | null> {
  const found = await keyInRepo(repo, editorKeyFor(pass));
  if (!found || !found.length) return null;
  await replaceEditorKey(pass, 'editor key found in the repository; replaced');
  const where = found.join(', ');
  return { found, say: 'Your editor line was in ' + where + ' in that repository, where anyone can read it. We replaced it, so the old line stops working now (the link in your email still works). Copy your new line from your account on the site, add it to your editor again, and take ' + (found.length > 1 ? 'those files' : where) + ' out of the repository.' };
}
