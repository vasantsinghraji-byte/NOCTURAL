import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Manrope } from 'next/font/google';
import './globals.css';
import './nabz.css';
import Providers from './_components/Providers';
import SiteNav from './_components/SiteNav';
import SiteFooter from './_components/SiteFooter';
import AppTabBar from './_components/AppTabBar';

// Self-hosted at build time (no request to Google from visitors' browsers).
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nabz · Care that comes home',
  icons: {
    icon: [
      { url: '/brand/nabz-icon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' }
    ],
    apple: '/apple-touch-icon.png'
  },
  description:
    'Book verified nurses and physiotherapists to your home in minutes, with supplies from the nearest pharmacy. Medicines delivered from licensed stores near you. Now in Jaipur.'
};

export const viewport: Viewport = {
  themeColor: '#fbf8f3',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${instrument.variable}`}>
      <body>
        <Providers>
          <header className="header">
            <SiteNav />
          </header>
          <main className="container main">{children}</main>
          <SiteFooter />
          <AppTabBar />
        </Providers>
      </body>
    </html>
  );
}
