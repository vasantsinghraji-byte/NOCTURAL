'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, FlaskConical, HeartPulse, ShoppingBag, UserRound, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/care', label: 'Care', icon: HeartPulse },
  { href: '/lab-tests', label: 'Labs', icon: FlaskConical },
  { href: '/pharmacy', label: 'Pharmacy', icon: ShoppingBag },
  { href: '/care/plans', label: 'Bookings', icon: CalendarDays },
  { href: '/account', label: 'Account', icon: UserRound }
];

/** Phone-width bottom tabs for signed-in customers, like the Nabz app. */
export default function AppTabBar() {
  const { patient } = useAuth();
  const path = usePathname() || '/';
  if (!patient || path.startsWith('/track/')) return null;
  return (
    <nav className="tabbar" aria-label="App">
      {TABS.map(({ href, label, icon: Icon }) => {
        // The longest matching tab wins (/care/plans is Bookings, not Care).
        const best = TABS.filter((x) => path === x.href || path.startsWith(`${x.href}/`)).sort((x, y) => y.href.length - x.href.length)[0];
        const on = best ? best.href === href : false;
        return (
          <Link key={href} href={href} className={on ? 'on' : ''}>
            <span className="tab-ico" aria-hidden="true"><Icon size={19} strokeWidth={on ? 2.4 : 1.8} /></span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
