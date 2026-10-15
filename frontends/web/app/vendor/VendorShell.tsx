'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, House, Package, Settings2, Wallet, type LucideIcon } from 'lucide-react';
import type { AuthUser } from '@medrush/shared';
import { api } from '@/lib/api';

const TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/vendor/today', label: 'Today', icon: House },
  { href: '/vendor', label: 'Orders', icon: ClipboardList },
  { href: '/vendor/stock', label: 'Stock', icon: Package },
  { href: '/vendor/money', label: 'Money', icon: Wallet },
  { href: '/vendor/settings', label: 'Shop settings', icon: Settings2 }
];

/** Store management tabs (same sections as the Partner app's bottom bar). */
export function VendorNav() {
  const path = usePathname();
  return (
    <nav aria-label="Store" className="mk-chips" style={{ marginTop: 16 }}>
      {TABS.map(({ href, label, icon: Icon }) => {
        const on = path === href;
        return (
          <Link key={href} href={href} className={`mk-chip${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} style={{ textDecoration: 'none', minHeight: 44 }}>
            <Icon size={16} aria-hidden="true" />{label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Signed-in pharmacy store only; everyone else gets a login prompt. */
export default function VendorShell({ children }: { children: (user: AuthUser) => ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    api.staffMe().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecking(false));
  }, []);

  if (checking) return <p className="muted" style={{ marginTop: 20 }}>Checking session…</p>;
  if (!user || user.role !== 'pharmacy_vendor') {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Store dashboard</h2>
        <p className="muted">{user ? `Logged in as ${user.role}, not a pharmacy store.` : 'Please log in with your pharmacy store account.'}</p>
        <Link href="/vendor/login" className="btn">Store login</Link>
      </div>
    );
  }
  return (
    <>
      <VendorNav />
      {children(user)}
    </>
  );
}
