'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Crown, Headphones, Stethoscope, Truck } from 'lucide-react';
import type { MembershipStatus } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { payForMembership, PaymentDismissedError } from '@/lib/razorpay';
import { IconTile } from '../_components/icons';

const BENEFITS = [
  { icon: Truck, title: 'Free medicine delivery', desc: 'No delivery fee on any pharmacy order, day or night.' },
  { icon: Stethoscope, title: 'No platform fee on visits', desc: 'Save 15% on every nurse and physio visit.' },
  { icon: Headphones, title: 'Priority support', desc: 'Jump the queue when you need help.' }
];

/** Nabz Plus membership (Swiggy One-style). */
export default function PlusPage() {
  const { patient } = useAuth();
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    if (!patient) return;
    api.getMembership().then(setStatus).catch(() => setStatus(null));
  }, [patient]);
  useEffect(() => { load(); }, [load]);

  const plan = status?.plans?.[0] || { name: 'Nabz Plus', price: 149, days: 30, code: 'PLUS_MONTHLY' };

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      await action();
      setMsg({ ok: true, text: done });
      load();
    } catch (e) {
      if (e instanceof PaymentDismissedError) return;
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero" style={{ background: 'linear-gradient(135deg,#c9475d,#9e2f43)' }}>
        <span className="eyebrow"><Crown size={14} color="#f5b82e" /> Nabz Plus</span>
        <h1 style={{ fontSize: 'clamp(28px,4vw,44px)' }}>Care costs less with Plus.</h1>
        <p>Free medicine delivery and no platform fee on home visits, for ₹{plan.price} a month.</p>
        {!patient ? (
          <Link href="/login?next=/plus" className="btn light">Sign in to join</Link>
        ) : status?.active ? (
          <span className="pill" style={{ background: '#e6f0f5', color: '#2f7d5b', fontSize: 13 }}>
            <BadgeCheck size={14} /> Active till {status.validUntil ? new Date(status.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          </span>
        ) : (
          <div className="hero-actions">
            {status?.trialAvailable && (
              <button className="btn light" disabled={busy} onClick={() => run(() => api.startMembershipTrial(), 'Your free trial is on. Enjoy free delivery!')}>
                Start {status.trialDays}-day free trial
              </button>
            )}
            <button className="btn ghost" disabled={busy || !status?.onlinePayment}
              onClick={() => run(() => payForMembership({ name: patient.name, email: patient.email, contact: patient.phone }), 'Welcome to Nabz Plus!')}>
              {status?.onlinePayment ? `Join for ₹${plan.price}/month` : 'Online payment coming soon'}
            </button>
          </div>
        )}
      </section>

      {msg && <div className={`notice ${msg.ok ? 'good' : 'bad'}`} style={{ marginTop: 16 }}>{msg.text}</div>}

      <div className="section-title">What you get</div>
      <div className="grid cards">
        {BENEFITS.map((b) => (
          <div key={b.title} className="card stack">
            <IconTile icon={b.icon} size={48} />
            <h3>{b.title}</h3>
            <span className="muted">{b.desc}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 18 }}>
        {plan.days}-day plan that renews only when you pay again. Plus covers the whole delivery fee, including rain surge and late-night charges.
      </p>
    </>
  );
}
