/* POST /api/entry (multipart: name, pitch, repo, demo, video, by, keep, picture): submit or edit your entry.
   DELETE /api/entry: delete it, until building closes. The same submit as the editor's tool (lib/server/entries.ts). */
import { no, offline, ok } from '@/lib/server/http';
import { authUser } from '@/lib/server/supabase';
import { ensurePerson, personByAuth } from '@/lib/server/people';
import { deleteEntry, submitEntry, type Upload } from '@/lib/server/entries';
import { MAX_PIC, PIC_TYPES } from '@/lib/forms';

async function who() {
  const u = await authUser();
  return u ? (await personByAuth(u.id)) || (await ensurePerson(u.email)) : null;
}

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const p = await who(); if (!p) return no('Sign in to submit.', 401);
  let f: FormData; try { f = await req.formData(); } catch { return no('Send the entry as a form.'); }
  const s = (k: string) => { const v = f.get(k); return typeof v === 'string' ? v : ''; };
  let upload: Upload | null = null;
  const file = f.get('picture');
  if (file && typeof file !== 'string' && file.size) {
    if (PIC_TYPES.indexOf(file.type) < 0) return no('Use a JPEG, PNG or WebP picture.', 400, { field: 'picture' });
    if (file.size > MAX_PIC) return no('That picture is over 5 MB. Choose a smaller one.', 400, { field: 'picture' });
    upload = { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type };
  }
  const r = await submitEntry(p, { name: s('name'), pitch: s('pitch'), repo: s('repo'), demo: s('demo'), video: s('video'), by: s('by') }, { via: 'web', upload, keepPicture: s('keep') === '1' });
  return r.ok ? ok({ entry: r.entry, flags: r.verdict.flags, later: r.verdict.later }) : no(r.error, r.status || 400, { field: r.field });
}

export async function DELETE() {
  const off = offline(); if (off) return off;
  const p = await who(); if (!p) return no('Sign in first.', 401);
  const r = await deleteEntry(p);
  return r.ok ? ok({ deleted: true }) : no(r.error, r.status || 400, r.field ? { field: r.field } : undefined);
}
