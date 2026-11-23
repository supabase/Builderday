/* The editor server's address on Supabase: https://<project>.supabase.co/functions/v1/mcp, with the person's key in
   "Authorization: Bearer <key>" (or, for an editor that cannot send a header, at the end of the address).
   It hands each request to the site's own server (/api/mcp, lib/server/mcp.ts), where the one submit lives, so a
   refusal reads the same from the form and from the editor. Streamable HTTP without sessions: POST carries JSON-RPC
   and gets JSON back; GET and DELETE are 405. The key is passed on as it came and never logged.
   HACKDAY_SITE_URL: where the site runs (set as a function secret). Editors send no Supabase token, so the function
   is deployed with verify_jwt off (supabase/config.toml); the key is the only pass. */
declare const Deno: { env: { get(name: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, authorization',
  'access-control-expose-headers': 'mcp-session-id',
};
const KEY = /^[\w.-]{10,200}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { ...CORS, allow: 'POST' } });
  const parts = new URL(req.url).pathname.split('/').filter(Boolean), at = parts.lastIndexOf('mcp'), key = at >= 0 ? parts[at + 1] || '' : '';
  const auth = req.headers.get('authorization') || '';
  const fail = (message: string, status: number) => Response.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }, { status, headers: CORS });
  /* a line with no key, or an address that is not a key, still goes to the site: the editor connects and the site
     says in words what is wrong (an error here would show in the editor as a failed connection, with no words) */
  const path = key && KEY.test(key) ? '/' + encodeURIComponent(key) : '';
  const site = (Deno.env.get('HACKDAY_SITE_URL') || '').replace(/\/+$/, '');
  if (!site) return fail('The server is not set up yet.', 503);
  const body = await req.text();
  if (body.length > 256_000) return fail('That request is too large.', 413);
  try {
    const pass: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': req.headers.get('mcp-protocol-version') || '' };
    if (auth) pass.authorization = auth;
    const r = await fetch(site + '/api/mcp' + path, {
      method: 'POST', body, headers: pass,
      signal: AbortSignal.timeout(25_000),
    });
    return new Response(r.status === 202 ? null : await r.text(), { status: r.status, headers: { ...CORS, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
  } catch {
    return fail('The editor server did not answer. Try again in a minute.', 502);
  }
});
