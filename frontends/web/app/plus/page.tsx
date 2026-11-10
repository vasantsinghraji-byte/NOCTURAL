'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Crown, Headphones, Stethoscope, Truck } from 'lucide-react';
import type { MembershipPlan, MembershipStatus } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { payForMembership, PaymentDismissedError } from '@/lib/razorpay';
import { IconTile } from '../_components/icons';
import CouponBox, { type AppliedCoupon } from '../_components/CouponBox';

/** Only the benefits switched on in admin settings. */
function benefitsFor(status: MembershipStatus | null) {
  const b = status?.benefits || { freeDelivery: true, noVisitFee: true, visitFeePercent: 15 };
  return [
    b.freeDelivery && { icon: Truck, title: 'Free medicine delivery', desc: 'No delivery fee on any pharmacy order, day or night.' },
    b.noVisitFee && { icon: Stethoscope, title: 'No platform fee on visits', desc: `Save ${b.visitFeePercent}% on every nurse and physio visit.` },
    { icon: Headphones, title: 'Priority support', desc: 'Jump the queue when you need help.' }
  ].filter(Boolean) as Array<{ icon: typeof Truck; title: string; desc: string }>;
}

/** "₹149 a month", "₹399 for 90 days". */
const priceLabel = (p: MembershipPlan) => (p.days === 30 ? `₹${p.price} a month` : `₹${p.price} for ${p.days} days`);

/** Nabz Plus membership (Swiggy One-style). Plans and prices come from the admin panel. */
export default function PlusPage() {
  const { patient } = useAuth();
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);

  const load = useCallback(() => {
    if (!patient) return;
    api.getMembership().then(setStatus).catch(() => setStatus(null));
  }, [patient]);
  useEffect(() => { load(); }, [load]);

  const plans = status?.plans || [];
  const plan: MembershipPlan | undefined = plans.find((p) => p.code === chosen) || plans[0];
  const cheapest = plans.reduce<MembershipPlan | undefined>((best, p) => (!best || p.price / p.days < best.price / best.days ? p : best), undefined);

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
      <section className="hero">
        <span className="eyebrow"><Crown size={14} color="#f5b82e" /> Nabz Plus</span>
        <h1 style={{ fontSize: 'clamp(28px,4vw,44px)' }}>Care costs less with Plus.</h1>
        <p>Free medicine delivery and no platform fee on home visits{cheapest ? `, from ${priceLabel(cheapest)}` : ''}.</p>
        {!patient ? (
          <Link href="/login?next=/plus" className="btn">Sign in to join</Link>
        ) : status?.active ? (
          <span className="pill" style={{ background: 'var(--sky-soft)', color: 'var(--brand)', fontSize: 13 }}>
            <BadgeCheck size={14} /> Active till {status.validUntil ? new Date(status.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
          </span>
        ) : (
          <div className="hero-actions">
            {status?.trialAvailable && (
              <button className="btn" disabled={busy} onClick={() => run(() => api.startMembershipTrial(), 'Your free trial is on. Enjoy free delivery!')}>
                Start {status.trialDays}-day free trial
              </button>
            )}
            <button className="btn ghost" disabled={busy || !status?.onlinePayment || !plan}
              onClick={() => plan && run(() => payForMembership({ name: patient.name, email: patient.email, contact: patient.phone }, plan.code, coupon?.code), 'Welcome to Nabz Plus!')}>
              {!plan ? 'No plan on sale right now' : status?.onlinePayment ? `Join for ₹${Math.max(1, plan.price - (coupon?.discount || 0))}` : 'Online payment coming soon'}
            </button>
          </div>
        )}
        {patient && !status?.active && plan && status?.onlinePayment && (
          <div style={{ marginTop: 14, maxWidth: 420 }}>
            <CouponBox service="MEMBERSHIP" amount={plan.price} value={coupon} onChange={setCoupon} />
          </div>
        )}
      </section>

      {msg && <div className={`notice ${msg.ok ? 'good' : 'bad'}`} style={{ marginTop: 16 }}>{msg.text}</div>}

      {patient && !status?.active && plans.length > 1 && (
        <>
          <div className="section-title">Choose your plan</div>
          <div className="grid cards" role="radiogroup" aria-label="Nabz Plus plans">
            {plans.map((p) => {
              const on = p.code === plan?.code;
              return (
                <button key={p.code} type="button" role="radio" aria-checked={on} className="card stack"
                  style={{ textAlign: 'left', cursor: 'pointer', border: on ? '2px solid var(--brand)' : undefined }} onClick={() => setChosen(p.code)}>
                  <div className="row"><h3 style={{ margin: 0 }}>{p.name}</h3>{p.note && <span className="pill">{p.note}</span>}</div>
                  <strong style={{ fontSize: 22 }}>₹{p.price}</strong>
                  <span className="muted">{p.days} days · about ₹{Math.round((p.price / p.days) * 30)} a month</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="section-title">What you get</div>
      <div className="grid cards">
        {benefitsFor(status).map((b) => (
          <div key={b.title} className="card stack">
            <IconTile icon={b.icon} size={48} />
            <h3>{b.title}</h3>
            <span className="muted">{b.desc}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 18 }}>
        {plan ? `${plan.days}-day plan that renews only when you pay again.` : 'Plans renew only when you pay again.'} Plus covers the whole delivery fee, including rain surge and late-night charges.
      </p>
    </>
  );
}
