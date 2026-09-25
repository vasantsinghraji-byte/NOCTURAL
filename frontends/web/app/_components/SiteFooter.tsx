'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from './Brand';

/** Site-wide footer (hidden on full-screen pages such as family tracking). */
export default function SiteFooter() {
  const path = usePathname() || '/';
  if (path.startsWith('/track/')) return null;
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Wordmark onDark />
          <p>Verified nurses and physios at your door. Medicines from licensed pharmacies near you. Now in Jaipur.</p>
        </div>
        <div>
          <h4>Care</h4>
          <Link href="/book">Book a visit</Link>
          <Link href="/pharmacy">Order medicines</Link>
          <Link href="/plus">Nabz Plus</Link>
        </div>
        <div>
          <h4>Partners</h4>
          <Link href="/partners">Join as a partner</Link>
          <Link href="/staff/login">Medical staff login</Link>
          <Link href="/vendor/login">Pharmacy login</Link>
        </div>
        <div>
          <h4>Account</h4>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Create account</Link>
          <Link href="/forgot-password">Forgot password</Link>
          <Link href="/account/delete">Delete account</Link>
        </div>
      </div>
      <div className="container footer-legal">
        <span>© {new Date().getFullYear()} Nabz. In an emergency call 108 (ambulance) or 112.</span>
        <span>Map data © OpenStreetMap contributors</span>
      </div>
    </footer>
  );
}
