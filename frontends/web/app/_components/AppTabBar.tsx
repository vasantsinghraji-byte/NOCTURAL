'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, House, ShoppingBag, UserRound, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/book', label: 'Home', icon: House },
  { href: '/pharmacy', label: 'Pharmacy', icon: ShoppingBag },
  { href: '/orders', label: 'Bookings', icon: CalendarDays },
  { href: '/plus', label: 'Account', icon: UserRound }
];

/** Phone-width bottom tabs for signed-in customers, like the Nabz app. */
export default function AppTabBar() {
  const { patient } = useAuth();
  const path = usePathname() || '/';
  if (!patient || path.startsWith('/track/')) return null;
  return (
    <nav className="tabbar" aria-label="App">
      {TABS.map(({ href, label, icon: Icon }) => {
        const on = path === href || path.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={on ? 'on' : ''}>
            <Icon size={21} strokeWidth={on ? 2.4 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
