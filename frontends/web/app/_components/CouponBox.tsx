'use client';

import { useEffect, useState } from 'react';
import { TicketPercent, X } from 'lucide-react';
import type { CouponPreview, CouponService } from '@medrush/shared';
import { api } from '@/lib/api';

/** A code applied at checkout: what the bill shows. */
export type AppliedCoupon = Pick<CouponPreview, 'code' | 'offer' | 'discount'>;

/**
 * "Have a coupon?" at checkout. Checks the code against this order's amount
 * (before fees) and shows what it takes off; the server checks it again when
 * the order is placed, so this is only a preview. A changed amount re-checks
 * the code (a minimum order may no longer be met).
 *
 * Screens with a server quote (labs, care plans) pass `check`: it asks for a
 * new quote with the code and returns the quote's coupon, so the bill shown is
 * the server's. Those screens re-quote themselves when the order changes.
 */
export default function CouponBox({ service, amount = 0, value, onChange, check }: {
  service: CouponService;
  amount?: number;
  value: Pick<CouponPreview, 'code' | 'offer' | 'discount'> | null;
  onChange: (coupon: Pick<CouponPreview, 'code' | 'offer' | 'discount'> | null) => void;
  check?: (code: string) => Promise<Pick<CouponPreview, 'code' | 'offer' | 'discount'> | null | undefined>;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(raw: string) {
    const clean = raw.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const found = check ? await check(clean) : (await api.checkCoupon(clean, service, amount)).coupon;
      if (!found) throw new Error('That code is not valid');
      onChange(found);
    } catch (e) {
      onChange(null);
      setError(e instanceof Error ? e.message : 'That code is not valid');
    } finally {
      setBusy(false);
    }
  }

  // The basket changed: check the applied code against the new amount.
  const appliedCode = value?.code;
  useEffect(() => {
    if (appliedCode && !check) apply(appliedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  if (value) {
    return (
      <div className="notice good row" style={{ alignItems: 'center', gap: 10 }} role="status">
        <TicketPercent size={18} aria-hidden />
        <span style={{ flex: 1 }}><b>{value.code}</b> applied: {value.offer}. You save ₹{value.discount}.</span>
        <button type="button" className="linkbtn" aria-label={`Remove code ${value.code}`} onClick={() => { onChange(null); setCode(''); }}><X size={16} /></button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="coupon-code">Have a coupon?</label>
      <div className="row" style={{ gap: 8 }}>
        <input id="coupon-code" className="input mono" style={{ flex: 1, textTransform: 'uppercase' }} value={code} maxLength={20}
          autoComplete="off" spellCheck={false} placeholder="Enter code"
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(code); } }} />
        <button type="button" className="btn secondary" disabled={busy || !code.trim()} onClick={() => apply(code)}>{busy ? 'Checking…' : 'Apply'}</button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
