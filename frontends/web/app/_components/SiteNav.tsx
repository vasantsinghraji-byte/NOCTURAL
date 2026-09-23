'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { ShoppingCart } from 'lucide-react';

export default function SiteNav() {
  const { patient, loading, logout } = useAuth();
  const { count } = useCart();

  return (
    <div className="container navbar" style={{ padding: 0 }}>
      <Link href="/" className="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <img src="/brand/nabz-icon.svg" alt="" width={30} height={30} style={{ borderRadius: 9 }} />
        nabz<span style={{ color: '#ff5a3c', WebkitTextFillColor: '#ff5a3c' }}>.</span>
      </Link>
      <nav className="navlinks">
        <Link href="/pharmacy">Pharmacy</Link>
        <Link href="/nursing">Nursing</Link>
        <Link href="/orders">Orders</Link>
        <Link href="/plus">Plus</Link>
        <Link href="/checkout" className="cartlink" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={16} />{count > 0 ? count : ''}</Link>
        {loading ? null : patient ? (
          <>
            <span className="navuser">Hi, {patient.name.split(' ')[0]}</span>
            <button className="linkbtn" onClick={() => logout()}>Logout</button>
          </>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </nav>
    </div>
  );
}
