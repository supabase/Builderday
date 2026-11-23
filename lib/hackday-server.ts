/* hackday-server.ts: submitting from your editor, and the checks every entry goes through.

   Projects are sent from the editor through the Builder Day MCP server, or on the web; both doors run the same checks.
   The server is lib/server/mcp.ts. NEXT_PUBLIC_HACKDAY_MCP_URL names its public base (the Supabase function in front
   of it, or the site's /api/mcp); unset, the base is the site's own /api/mcp whenever the backend is on. Each person's
   own address is that base, a slash, and their key, shown to them once they are signed in. With no backend
   SERVER.live is false and no address is shown anywhere: the site says the server is not open yet.

   The install lines are copied from each editor's own docs (checked 2026-11-17, see EDITORS). Pure. */
import { EVENT } from '@/lib/day-data';

const BASE = (process.env.NEXT_PUBLIC_HACKDAY_MCP_URL || '').replace(/\/+$/, '');
/* With no address set but the backend on, the server is the site's own /api/mcp (lib/server/me.ts writes the address
   from the site's own; url stays null here). With neither, it is not open. */
export const SERVER: { live: boolean; url: string | null; name: string } = { live: !!BASE || !!process.env.NEXT_PUBLIC_SUPABASE_URL, url: BASE || null, name: 'builder-day' };
/* Supabase's own hosted server, added first so the editor can make the project's database; it asks the builder to
   sign in to Supabase in the browser the first time (supabase.com/docs/guides/ai-tools/mcp, checked 2026-11-18) */
export const SUPABASE_MCP = { url: 'https://mcp.supabase.com/mcp', name: 'supabase', docs: 'https://supabase.com/docs/guides/ai-tools/mcp' };
/* the lab's stand-in address, so the live state can be seen; never used by a real page */
export const PLACEHOLDER_URL = 'https://hackday.example/mcp';

/* what to say to the editor on the day */
/* the sentence that runs the practice call before the day */
export const checkIt = () => 'Check my ' + EVENT.short + ' setup.';
export const sayIt = (city?: string) => 'Submit my project to ' + EVENT.name + (city ? ' in ' + city : '') + '.';

/* the rules that will be checked, said before the day */
export const RULES = [
  'Start a new repository on the day.',
  'Keep it public, so it can be read.',
  'Push as you go, not all at the end.',
];

/* Every check, named by what it catches, where it reads from, and what it does. A block stops the entry and says how to fix it; a flag goes to
   the hosts and judges and never shows on the public page. "Created before the day" is a block on the plan's advice,
   because the rule is printed ahead in Get ready; the owner has not decided it. */
export type Check = { id: string; what: string; from: string; does: 'block' | 'flag' | 'update'; say?: (v: Record<string, string>) => string };
export const CHECKS: Check[] = [
  { id: 'repo', what: 'The repository cannot be read', from: 'GitHub', does: 'block',
    say: (v) => 'We could not read ' + (v.repo || 'that repository') + '. Check the address, make the repository public, then send it again.' },
  { id: 'closed', what: 'Sent after building closed in that city', from: 'Our clock', does: 'block',
    say: (v) => 'Building closed in ' + (v.city || 'your city') + ' at ' + (v.time || 'the end of the session') + '. Entries can’t be sent or changed after that.' },
  { id: 'one', what: 'A second entry from the same person', from: 'Our records', does: 'update',
    say: () => 'You already have an entry. This one replaces it; nothing else changes.' },
  { id: 'age', what: 'The repository was made before the day', from: 'GitHub (when it was created)', does: 'block',
    say: (v) => 'This repository was made on ' + (v.made || 'an earlier day') + ', before Builder Day. Start a new repository today, push your work there, then send it again.' },
  { id: 'fork', what: 'A fork of an older repository', from: 'GitHub', does: 'flag' },
  { id: 'push', what: 'One push carries most of the code, or pushes only at the end', from: 'GitHub activity', does: 'flag' },
  { id: 'dates', what: 'Commit dates from before the start', from: 'GitHub commits', does: 'flag' },
  { id: 'demo', what: 'The demo does not answer', from: 'A guarded fetch', does: 'flag' },
  { id: 'supabase', what: 'No sign of Supabase in the project', from: 'The repository', does: 'flag' },
];

/* The editors in the picker, and how each adds a remote (Streamable HTTP) server for the user, not into the project
   folder, with the key in an Authorization header. From each editor's own docs, read again on
   2026-11-18. kind: a command to run, or a snippet for a file. line(base, name, key): with no key (Supabase's own
   server) there is no header.
   - Claude Code: --scope user and --header are documented apart; the one line puts them together.
   - Cursor: ~/.cursor/mcp.json is the global file; remote entries take "headers".
   - VS Code: the user's own mcp.json (the command "MCP: Open User Configuration"), top key "servers", "type": "http",
     "headers". `code --add-mcp` also writes to the user profile, but its docs do not show a header in that form.
   - Codex: ~/.codex/config.toml, http_headers.
   - Gemini CLI: --scope user (its default is the project) and --header.
   - Zed: the user settings file, "context_servers" with "headers".
   - Cline: one global settings file; --transport http and --header.
   - Goose: ~/.config/goose/config.yaml; its docs show no header for a remote extension, so its line carries the key
     in the address (/api/mcp/<key>). */
export type Editor = { id: string; name: string; kind: 'command' | 'file'; where?: string; line: (base: string, name: string, key?: string | null) => string; docs: string; inAddress?: boolean };
const bearer = (k: string) => 'Bearer ' + k;
export const EDITORS: Editor[] = [
  { id: 'claude', name: 'Claude Code', kind: 'command', line: (u, n, k) => `claude mcp add --transport http --scope user ${n} ${u}` + (k ? ` --header "Authorization: ${bearer(k)}"` : ''), docs: 'https://code.claude.com/docs/en/mcp' },
  { id: 'cursor', name: 'Cursor', kind: 'file', where: '~/.cursor/mcp.json', line: (u, n, k) => `{\n  "mcpServers": {\n    "${n}": {\n      "url": "${u}"` + (k ? `,\n      "headers": { "Authorization": "${bearer(k)}" }` : '') + `\n    }\n  }\n}`, docs: 'https://cursor.com/docs/context/mcp' },
  { id: 'vscode', name: 'VS Code', kind: 'file', where: 'your user mcp.json (run “MCP: Open User Configuration”)', line: (u, n, k) => `{\n  "servers": {\n    "${n}": {\n      "type": "http",\n      "url": "${u}"` + (k ? `,\n      "headers": { "Authorization": "${bearer(k)}" }` : '') + `\n    }\n  }\n}`, docs: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration' },
  { id: 'codex', name: 'Codex', kind: 'file', where: '~/.codex/config.toml', line: (u, n, k) => `[mcp_servers.${n.replace(/-/g, '_')}]\nurl = "${u}"` + (k ? `\nhttp_headers = { "Authorization" = "${bearer(k)}" }` : ''), docs: 'https://learn.chatgpt.com/docs/extend/mcp' },
  { id: 'gemini', name: 'Gemini CLI', kind: 'command', line: (u, n, k) => `gemini mcp add --transport http --scope user` + (k ? ` --header "Authorization: ${bearer(k)}"` : '') + ` ${n} ${u}`, docs: 'https://geminicli.com/docs/tools/mcp-server/' },
  { id: 'zed', name: 'Zed', kind: 'file', where: 'your user settings.json', line: (u, n, k) => `"context_servers": {\n  "${n}": {\n    "url": "${u}"` + (k ? `,\n    "headers": { "Authorization": "${bearer(k)}" }` : '') + `\n  }\n}`, docs: 'https://zed.dev/docs/ai/mcp' },
  { id: 'cline', name: 'Cline', kind: 'command', line: (u, n, k) => `cline mcp add ${n} ${u} --transport http` + (k ? ` --header "Authorization: ${bearer(k)}"` : '') + ' --yes', docs: 'https://docs.cline.bot/mcp/connecting-to-a-remote-server' },
  { id: 'goose', name: 'Goose', kind: 'file', where: '~/.config/goose/config.yaml', inAddress: true, line: (u, n, k) => `extensions:\n  ${n}:\n    name: ${n}\n    type: streamable_http\n    uri: ${k ? u + '/' + k : u}\n    enabled: true`, docs: 'https://goose-docs.ai/docs/getting-started/using-extensions' },
];

/* the person's own address, split into the server's base and their key (the key is the last part of the address) */
export function splitKey(address: string): { base: string; key: string | null } {
  const m = /^(.*)\/([A-Za-z0-9_-]{40,60})$/.exec(address);
  return m ? { base: m[1], key: m[2] } : { base: address, key: null };
}
/* the line for one editor: the key in a header, or in the address where the editor cannot send one */
export function lineFor(ed: Editor | undefined, address: string, name: string): string {
  const { base, key } = splitKey(address);
  if (!ed) return key ? base + '/' + key : base;
  return ed.line(base, name, key);
}
