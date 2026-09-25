'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bike, CircleCheck, FlaskConical, Stethoscope, Store, type LucideIcon } from 'lucide-react';
import type { PartnerApplicationInput, PartnerKind } from '@medrush/shared';
import { api } from '@/lib/api';
import AuthShell from '../_components/AuthShell';

// Lab and delivery partners join a waitlist: their dashboards aren't built yet (audit M7).
const KINDS: Array<{ kind: PartnerKind; icon: LucideIcon; title: string; login: string | null }> = [
  { kind: 'MEDICAL_STAFF', icon: Stethoscope, title: 'Nurse / physio', login: '/staff/login' },
  { kind: 'PHARMACY', icon: Store, title: 'Pharmacy', login: '/vendor/login' },
  { kind: 'PATH_LAB', icon: FlaskConical, title: 'Path lab', login: null },
  { kind: 'DELIVERY', icon: Bike, title: 'Delivery', login: null }
];

type Field = { key: keyof PartnerApplicationInput; label: string; numeric?: boolean };
const EXTRA: Record<PartnerKind, Field[]> = {
  MEDICAL_STAFF: [
    { key: 'qualification', label: 'Qualification (B.Sc Nursing, GNM, BPT…)' },
    { key: 'registrationNumber', label: 'Nursing / physio council registration no.' },
    { key: 'experienceYears', label: 'Years of experience', numeric: true }
  ],
  PHARMACY: [
    { key: 'businessName', label: 'Store name' },
    { key: 'registrationNumber', label: 'Drug licence number' },
    { key: 'gstin', label: 'GSTIN (optional)' },
    { key: 'address', label: 'Store address' }
  ],
  PATH_LAB: [
    { key: 'businessName', label: 'Lab name' },
    { key: 'registrationNumber', label: 'NABL / registration number' },
    { key: 'address', label: 'Lab address' }
  ],
  DELIVERY: [{ key: 'vehicle', label: 'Vehicle (scooter, bike…)' }]
};

/** Apply to become a Nabz partner (reviewed by the ops team; logins are never self-assigned). */
export default function PartnersPage() {
  const [kind, setKind] = useState<PartnerKind>('MEDICAL_STAFF');
  const [form, setForm] = useState<Record<string, string>>({ city: 'Jaipur' });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if ((form.name || '').trim().length < 2) { setError('Enter your full name.'); return; }
    if (!/^[6-9]\d{9}$/.test(form.phone || '')) { setError('Enter a valid 10-digit mobile number.'); return; }
    setBusy(true);
    try {
      const input: PartnerApplicationInput = { kind, name: form.name.trim(), phone: form.phone, city: form.city || 'Jaipur' };
      if (form.email) input.email = form.email.trim();
      for (const f of EXTRA[kind]) {
        const v = (form[f.key] || '').trim();
        if (!v) continue;
        if (f.numeric) input.experienceYears = Number(v);
        else (input as unknown as Record<string, string>)[f.key] = v;
      }
      await api.applyAsPartner(input);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the application');
    } finally {
      setBusy(false);
    }
  }

  const active = KINDS.find((k) => k.kind === kind)!;

  if (done) {
    return (
      <AuthShell title="Application received" sideTitle="Welcome aboard, almost.">
        <div className="check-mail">
          <div className="icon"><CircleCheck size={34} /></div>
          <p className="sub">Our Jaipur team will call you within 2 working days to verify your documents. Once approved, you’ll get your Nabz Partner login.</p>
          <Link href="/" className="btn block lg" style={{ marginTop: 12 }}>Back to Nabz</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Join Nabz"
      subtitle="Get requests near you, clear earnings on every job, weekly payouts."
      sideTitle="Earn on your own schedule."
      sideText="We verify ID, registration and police clearance before you go live, so patients can trust every Nabz partner."
    >
      <form onSubmit={submit} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {KINDS.map((k) => (
            <button key={k.kind} type="button" onClick={() => setKind(k.kind)} className={`choice ${kind === k.kind ? 'on' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <k.icon size={18} /> {k.title}
            </button>
          ))}
        </div>
        <label htmlFor="p-name">Full name</label>
        <input id="p-name" className="input" autoComplete="name" value={form.name || ''} onChange={set('name')} />
        <label htmlFor="p-phone">Mobile number</label>
        <input id="p-phone" className="input" inputMode="numeric" maxLength={10} value={form.phone || ''}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} />
        <label htmlFor="p-email">Email (optional)</label>
        <input id="p-email" className="input" type="email" autoComplete="email" value={form.email || ''} onChange={set('email')} />
        <label htmlFor="p-city">City</label>
        <input id="p-city" className="input" value={form.city || ''} onChange={set('city')} />
        {EXTRA[kind].map((f) => (
          <div key={`${kind}-${f.key}`}>
            <label htmlFor={`p-${f.key}`}>{f.label}</label>
            <input id={`p-${f.key}`} className="input" inputMode={f.numeric ? 'numeric' : undefined} value={form[f.key] || ''} onChange={set(f.key)} />
          </div>
        ))}
        {error && <div className="notice bad" style={{ marginTop: 14 }}>{error}</div>}
        <button className="btn block lg" type="submit" disabled={busy} style={{ marginTop: 20 }}>{busy ? 'Submitting…' : 'Submit application'}</button>
      </form>
      {active.login
        ? <p className="switch">Already a partner? <Link href={active.login} className="link">Sign in</Link></p>
        : <p className="switch">{active.title} partnerships open soon. Apply now and we&apos;ll call you when they do.</p>}
    </AuthShell>
  );
}
