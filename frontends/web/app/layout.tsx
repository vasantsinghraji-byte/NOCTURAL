import type { Metadata } from 'next';
import './globals.css';
import Providers from './_components/Providers';
import SiteNav from './_components/SiteNav';

export const metadata: Metadata = {
  title: 'Nabz · Care at your doorstep',
  icons: { icon: '/brand/nabz-icon.svg' },
  description:
    'Order medicines from nearby local pharmacies, book home nursing and lab tests, consult doctors, and trigger emergency SOS — all in one app.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="header">
            <SiteNav />
          </header>
          <main className="container">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
