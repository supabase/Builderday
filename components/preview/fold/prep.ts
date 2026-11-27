/* The accounts and tools to have ready before the day, so the day itself is only building. Each has the page to open
   and what it is for. The repository is not on the list to make: the rules want a new one on the day. */
export type Tool = { id: string; name: string; why: string; label: string; href: string };

export const TOOLS: Tool[] = [
  { id: 'github', name: 'GitHub', why: 'Have an account. On the day you start a new public repository and push to it as you go.', label: 'Open GitHub', href: 'https://github.com/signup' },
  { id: 'supabase', name: 'Supabase project', why: 'Your database, sign-in and storage. Make one now, so you know where the keys and the tables are.', label: 'Open the dashboard', href: 'https://supabase.com/dashboard' },
  { id: 'vercel', name: 'Vercel', why: 'Puts what you build on a public address in a minute. Sign up with GitHub, so a push deploys.', label: 'Sign up', href: 'https://vercel.com/signup' },
];

/* "To bring" on the day, short on purpose */
export const BRING = ['Your laptop and its charger', 'Your editor signed in, with its agent working', 'The GitHub and Supabase accounts you signed in with'];
