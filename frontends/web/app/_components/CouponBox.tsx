'use client';

import { useEffect, useState } from 'react';
import { TicketPercent, X } from 'lucide-react';
import type { CouponPreview, CouponService } from '@medrush/shared';
import { api } from '@/lib/api';

/**
 * "Have a coupon?" at checkout. Checks the code against this order's amount
 * (before fees) and shows what it takes off; the server checks it again when
 * the order is placed, so this is only a preview. A changed amount re-checks
 * the code (a minimum order may no longer be met).
 */
export default function CouponBox({ service, amount, value, onChange }: {
  service: CouponService;
  amount: number;
  value: CouponPreview | null;
  onChange: (coupon: CouponPreview | null) => void;
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
      onChange((await api.checkCoupon(clean, service, amount)).coupon);
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
    if (appliedCode) apply(appliedCode);
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
