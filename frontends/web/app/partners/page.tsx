'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bike, CircleCheck, Droplets, FlaskConical, Hospital, Stethoscope, Store, Syringe, type LucideIcon } from 'lucide-react';
import { PEOPLE_PARTNER_KINDS, type PartnerApplicationInput, type PartnerKind } from '@medrush/shared';
import { api } from '@/lib/api';
import AuthShell from '../_components/AuthShell';

// Lab and delivery partners join a waitlist: their dashboards aren't built yet (audit M7).
const KINDS: Array<{ kind: PartnerKind; icon: LucideIcon; title: string; login: string | null }> = [
  { kind: 'MEDICAL_STAFF', icon: Stethoscope, title: 'Nurse / physio', login: '/staff/login' },
  { kind: 'PHARMACY', icon: Store, title: 'Pharmacy', login: '/vendor/login' },
  { kind: 'PATH_LAB', icon: FlaskConical, title: 'Path lab', login: null },
  { kind: 'DELIVERY', icon: Bike, title: 'Delivery', login: null },
  { kind: 'PHLEBOTOMIST', icon: Droplets, title: 'Phlebotomist', login: null },
  { kind: 'PRP_TECHNICIAN', icon: Syringe, title: 'PRP technician', login: null },
  { kind: 'HOSPITAL', icon: Hospital, title: 'Hospital / nursing home', login: null }
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
  DELIVERY: [{ key: 'vehicle', label: 'Vehicle (scooter, bike…)' }],
  PHLEBOTOMIST: [
    { key: 'qualification', label: 'Qualification (DMLT, BMLT…)' },
    { key: 'experienceYears', label: 'Years of sample-collection experience', numeric: true }
  ],
  PRP_TECHNICIAN: [
    { key: 'qualification', label: 'Qualification / certification' },
    { key: 'experienceYears', label: 'Years of PRP experience', numeric: true }
  ],
  HOSPITAL: [
    { key: 'businessName', label: 'Hospital / nursing home name' },
    { key: 'registrationNumber', label: 'Clinical establishment registration no.' },
    { key: 'address', label: 'Address' }
  ],
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
    if (form.agree !== 'yes') { setError('Please accept the partner terms to apply.'); return; }
    setBusy(true);
    try {
      const input: PartnerApplicationInput = { kind, name: form.name.trim(), phone: form.phone, city: form.city || 'Jaipur', acceptTerms: true };
      if (form.email) input.email = form.email.trim();
      if (form.referralCode) input.referralCode = form.referralCode.trim().toUpperCase();
      if (PEOPLE_PARTNER_KINDS.includes(kind)) {
        if (!form.gender) { setError('Choose your gender (patients can ask for a female or male professional).'); setBusy(false); return; }
        input.gender = form.gender as PartnerApplicationInput['gender'];
      }
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
        <input id="p-phone" name="tel" type="tel" autoComplete="tel-national" className="input" inputMode="numeric" maxLength={10} value={form.phone || ''}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} />
        <label htmlFor="p-email">Email (optional)</label>
        <input id="p-email" className="input" type="email" autoComplete="email" value={form.email || ''} onChange={set('email')} />
        <label htmlFor="p-city">City</label>
        <input id="p-city" name="city" autoComplete="address-level2" className="input" value={form.city || ''} onChange={set('city')} />
        <label htmlFor="p-ref">Referral code from a Nabz partner (optional)</label>
        <input id="p-ref" name="referral" autoComplete="off" spellCheck={false} className="input" maxLength={12} style={{ textTransform: 'uppercase' }} value={form.referralCode || ''} onChange={set('referralCode')} />
        {PEOPLE_PARTNER_KINDS.includes(kind) && (
          <>
            <label>Gender</label>
            <div style={{ display: 'flex', gap: 8 }} role="radiogroup" aria-label="Gender">
              {(['FEMALE', 'MALE', 'OTHER'] as const).map((g) => (
                <button key={g} type="button" role="radio" aria-checked={form.gender === g} className={`choice ${form.gender === g ? 'on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, gender: g }))} style={{ flex: 1, fontWeight: 700 }}>
                  {g === 'FEMALE' ? 'Female' : g === 'MALE' ? 'Male' : 'Other'}
                </button>
              ))}
            </div>
          </>
        )}
        {kind === 'PRP_TECHNICIAN' && <p className="muted" style={{ fontSize: 12 }}>PRP visits run under a registered doctor; we confirm the supervising doctor during verification.</p>}
        {EXTRA[kind].map((f) => (
          <div key={`${kind}-${f.key}`}>
            <label htmlFor={`p-${f.key}`}>{f.label}</label>
            <input id={`p-${f.key}`} className="input" inputMode={f.numeric ? 'numeric' : undefined} value={form[f.key] || ''} onChange={set(f.key)} />
          </div>
        ))}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 600, fontSize: 13, marginTop: 14 }}>
          <input type="checkbox" checked={form.agree === 'yes'} onChange={(e) => setForm((f) => ({ ...f, agree: e.target.checked ? 'yes' : '' }))} style={{ marginTop: 2 }} />
          <span>I agree to the <a href="/terms#partners" target="_blank" rel="noreferrer" className="link">Nabz partner terms</a> and consent to document and background verification.</span>
        </label>
        {error && <div className="notice bad" style={{ marginTop: 14 }}>{error}</div>}
        <button className="btn block lg" type="submit" disabled={busy} style={{ marginTop: 20 }}>{busy ? 'Submitting…' : 'Submit application'}</button>
      </form>
      {active.login
        ? <p className="switch">Already a partner? <Link href={active.login} className="link">Sign in</Link></p>
        : <p className="switch">{active.title} partnerships open soon. Apply now and we&apos;ll call you when they do.</p>}
    </AuthShell>
  );
}
