'use client';

import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { RealtimeProvider } from './chat/RealtimeProvider';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider><RealtimeProvider>{children}</RealtimeProvider></CartProvider>
    </AuthProvider>
  );
}
