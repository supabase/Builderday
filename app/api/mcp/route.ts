/* /api/mcp: the editor server (lib/server/mcp.ts), with the person's key in "Authorization: Bearer <key>". This is the
   address every install line uses where the editor can send a header; /api/mcp/<key> stays for
   an editor that cannot. GET would open a stream, which this server does not offer (405, as the transport allows). */
import { handleMcp } from '@/lib/server/mcp';
import { offline } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
const NO = { allow: 'POST', 'cache-control': 'no-store' };

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  return handleMcp(req);
}
export function GET() { return new Response(null, { status: 405, headers: NO }); }
export function DELETE() { return new Response(null, { status: 405, headers: NO }); }
