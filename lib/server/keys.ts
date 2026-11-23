/* keys.ts: a person's personal key, the one in their link (/in/<key>) and in their editor's install line.

   The key is the pass id and a signature over it, its purpose and the pass's key_version, with HACKDAY_KEY_SECRET.
   Nothing secret is stored, so the desk can copy a person's link again at any time; bumping key_version ends every
   key that pass had. Keys open their city until the day after it closes (see stillValid in passes.ts).

   Two purposes, so a link pasted into an editor cannot sign a browser in, and an install line cannot open the desk:
   'in' for the link, 'mcp' for the editor. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { need } from './env';

export type KeyUse = 'in' | 'mcp';
const b64 = (b: Buffer) => b.toString('base64url');
const uuidBytes = (id: string) => Buffer.from(id.replace(/-/g, ''), 'hex');
const uuidOf = (b: Buffer) => { const h = b.toString('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); };
function mac(use: KeyUse, pass: string, version: number): Buffer {
  return createHmac('sha256', need('HACKDAY_KEY_SECRET')).update(use + ':' + pass + ':' + version).digest().subarray(0, 18);
}

export function makeKey(use: KeyUse, pass: string, version: number): string {
  return b64(uuidBytes(pass)) + b64(mac(use, pass, version));
}

/* the pass a key names, if the signature is right for that version; the caller then checks the pass still exists */
export function readKey(use: KeyUse, key: string): { pass: string; check: (version: number) => boolean } | null {
  if (!/^[A-Za-z0-9_-]{46}$/.test(key)) return null;
  const idPart = Buffer.from(key.slice(0, 22), 'base64url'), sig = Buffer.from(key.slice(22), 'base64url');
  if (idPart.length !== 16 || sig.length !== 18) return null;
  const pass = uuidOf(idPart);
  return { pass, check: (version) => { const want = mac(use, pass, version); return timingSafeEqual(want, sig); } };
}

/* the desk's mark: set only when a person signs in with the six-digit code (never by a link or the room code), bound
   to their Auth user, so a session that a personal link made cannot open the desk */
export const DESK_COOKIE = 'hd_desk';
export function deskMark(authUser: string): string { return createHmac('sha256', need('HACKDAY_KEY_SECRET')).update('desk:' + authUser).digest('base64url'); }
export function deskMarkOk(authUser: string, mark: string | undefined): boolean {
  if (!mark) return false;
  const a = Buffer.from(deskMark(authUser)), b = Buffer.from(mark);
  return a.length === b.length && timingSafeEqual(a, b);
}
