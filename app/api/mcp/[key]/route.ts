/* /api/mcp/<key>: the editor server (lib/server/mcp.ts) with the key in the address, for an editor that cannot send a
   header (Goose, today). Every other install line sends the key in a header to /api/mcp. A key in a header wins over
   the one in the address. GET would open a stream, which this server does not offer (405, as the transport allows). */
import { handleMcp } from '@/lib/server/mcp';
import { offline } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
const NO = { allow: 'POST', 'cache-control': 'no-store' };

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const off = offline(); if (off) return off;
  return handleMcp(req, (await params).key);
}
export function GET() { return new Response(null, { status: 405, headers: NO }); }
export function DELETE() { return new Response(null, { status: 405, headers: NO }); }
