import type { NextConfig } from 'next';

/* the site under a base path (supabase.com/builderday): set NEXT_PUBLIC_BASE_PATH on the host; empty on the dev server */
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');

/* The site is one page. The host's own root and every older address (links already shared) go to it. */
const OLD = ['/index.html', '/preview', '/city.html', '/city/:path*', '/desk/:path*', '/in/:path*', '/team/:path*', '/lab/:path*'];
const nextConfig: NextConfig = {
  devIndicators: false,
  ...(BASE ? { basePath: BASE } : {}),
  async redirects() {
    return [
      ...OLD.map((source) => ({ source, destination: '/', permanent: false })),
      ...(BASE ? [
        { source: '/', destination: BASE, basePath: false as const, permanent: false },
        ...OLD.map((source) => ({ source, destination: BASE, basePath: false as const, permanent: false })),
      ] : []),
    ];
  },
};

export default nextConfig;
