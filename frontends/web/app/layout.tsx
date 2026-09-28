import RevealOnScroll from './_components/RevealOnScroll';
import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Manrope } from 'next/font/google';
import './globals.css';
import './nabz.css';
import Providers from './_components/Providers';
import { DialogHost } from './_components/Dialog';
import SiteNav from './_components/SiteNav';
import SiteFooter from './_components/SiteFooter';
import AppTabBar from './_components/AppTabBar';

// Self-hosted at build time (no request to Google from visitors' browsers).
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nabz · Care that comes home',
  // Versioned icon URLs: browsers cache favicons by URL for weeks, so a new
  // name is the only way to replace the old MedRush icon everywhere.
  icons: {
    icon: [
      { url: '/brand/nabz-favicon-v2.ico', sizes: 'any' },
      { url: '/brand/nabz-icon.svg?v=2', type: 'image/svg+xml' },
      { url: '/brand/favicon-32.png?v=2', sizes: '32x32', type: 'image/png' }
    ],
    shortcut: '/brand/nabz-favicon-v2.ico',
    apple: '/apple-touch-icon.png?v=2'
  },
  description:
    'Book verified nurses and physiotherapists to your home in minutes, with supplies from the nearest pharmacy. Medicines delivered from licensed stores near you. Now in Jaipur.'
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#131014' }
  ],
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${instrument.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <RevealOnScroll />
        <Providers>
          <header className="header">
            <SiteNav />
          </header>
          <main id="main" className="container main" tabIndex={-1}>{children}</main>
          <SiteFooter />
          <AppTabBar />
          <DialogHost />
        </Providers>
      </body>
    </html>
  );
}
