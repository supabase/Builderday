import type { NextConfig } from 'next';

/* the site under a base path (supabase.com/builderday): set NEXT_PUBLIC_BASE_PATH on the host; empty on the dev server */
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');

/* The old static URLs keep working: /index.html is the home.
   /city.html?city=<id> is handled in proxy.ts, because a redirect here would keep ?city= in the new address. */
const nextConfig: NextConfig = {
  devIndicators: false,
  ...(BASE ? { basePath: BASE } : {}),
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      /* the host's own root, and the addresses from before the base (links already shared or sent), go under it */
      ...(BASE ? [
        { source: '/', destination: BASE, basePath: false as const, permanent: false },
        ...['/preview', '/desk', '/desk/:path*', '/city/:path*', '/in/:path*'].map((source) => ({ source, destination: BASE + source, basePath: false as const, permanent: false })),
      ] : []),
    ];
  },
};

export default nextConfig;
