'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { Wordmark } from './Brand';
import { Avatar } from './ProfilePhoto';

const APP_LINKS = [
  { href: '/book', label: 'Book a visit' },
  { href: '/pharmacy', label: 'Pharmacy' },
  { href: '/orders', label: 'My orders' },
  { href: '/plus', label: 'Plus' }
];

const PUBLIC_LINKS = [
  { href: '/#services', label: 'Services' },
  { href: '/#how', label: 'How it works' },
  { href: '/#safety', label: 'Safety' },
  { href: '/partners', label: 'For partners' }
];

/** Top bar. Signed out: marketing links + Sign in / Get started. Signed in: app links. */
export default function SiteNav() {
  const { patient, loading, logout } = useAuth();
  const { count } = useCart();
  const path = usePathname() || '/';
  const links = patient ? APP_LINKS : PUBLIC_LINKS;

  return (
    <div className="container navbar" style={{ padding: 0 }}>
      <Link href={patient ? '/book' : '/'} aria-label="Nabz home"><Wordmark /></Link>
      <nav className="navlinks" aria-label="Main">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`hide-sm ${path === l.href ? 'active' : ''}`}>{l.label}</Link>
        ))}
        {patient && count > 0 && (
          <Link href="/checkout" className="cartlink" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} aria-label={`Cart, ${count} items`}>
            <ShoppingCart size={16} />{count}
          </Link>
        )}
        {loading ? null : patient ? (
          <>
            <Link href="/account" className="navuser" aria-label="My account"><Avatar name={patient.name} url={patient.profilePhoto?.url} size={30} /><span className="hide-sm">{patient.name.split(' ')[0]}</span></Link>
            <button className="linkbtn" onClick={() => logout()}>Sign out</button>
          </>
        ) : (
          <>
            <Link href="/login" className={path === '/login' ? 'active' : ''}>Sign in</Link>
            <Link href="/signup" className="cta">Get started</Link>
          </>
        )}
      </nav>
    </div>
  );
}
