import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import dayCfg from '@/saved/day.config.json';
import cityCfg from '@/saved/city.config.json';
import motionCfg from '@/saved/motion.config.json';
import { clampMotion, motionCss } from '@/lib/motion';
import { headScript } from '@/components/ground/head-script';
import { SITE_URL } from '@/lib/site';
import { EVENT } from '@/lib/day-data';
import './globals.css';

/* Geist 400/500/600 and Geist Mono 500 are the page faces; globals.css reads them through these two variables.
   Manrope 600 is the Builder Day name in the logo. */
const geist = Geist({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin', 'latin-ext'], weight: ['500'], variable: '--font-geist-mono' });
const manrope = Manrope({ subsets: ['latin'], weight: ['600'], variable: '--font-manrope' });

/* the ground and the arrival are decided before first paint, from the saved looks and the URL */
const HEAD = headScript({
  day: { ground: dayCfg.ground, speed: dayCfg.speed, reduced: dayCfg.reduced },
  city: { ground: cityCfg.ground, speed: cityCfg.speed, reduced: cityCfg.reduced },
});

/* the motion tokens, from the motion tuning page's saved config */
const MOTION = motionCss(clampMotion(motionCfg));

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: EVENT.name,
  formatDetection: { telephone: false, address: false, email: false },
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 109 113'><path fill='%2324a06a' d='M63.7 110.3c-2.9 3.6-8.7 1.6-8.7-3L54 40.1h45.2c8.2 0 12.8 9.5 7.7 15.9z'/><path fill='%233ecf8e' d='M45.3 2.1c2.9-3.6 8.7-1.6 8.7 3l.5 67.2H9.8c-8.2 0-12.8-9.5-7.7-15.9z'/></svg>" },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content', themeColor: '#131413', colorScheme: 'dark' };

/* The head script sets the ground's colours, data-paper, data-ground and a few classes on <html> before React
   hydrates, so <html> is allowed to differ from the server's. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-paper="night" className={geist.variable + ' ' + geistMono.variable + ' ' + manrope.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HEAD }} />
        <style dangerouslySetInnerHTML={{ __html: MOTION }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
