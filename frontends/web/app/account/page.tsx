'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarHeart, ChevronRight, Crown, FlaskConical, Gift, LogOut, MapPin, Package, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import ProfilePhotoEditor from '../_components/ProfilePhoto';
import { promptDialog } from '../_components/Dialog';
import CallMeBack from '../_components/care/CallMeBack';

/**
 * Customer account on the website (same as the app's Account tab): profile
 * photo, contact details, a partner's referral code, Nabz Plus, orders and
 * account deletion.
 */
export default function AccountPage() {
  const { patient, loading, logout, refresh } = useAuth();
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  useEffect(() => { setPhoto(patient?.profilePhoto?.url || null); }, [patient]);

  async function referral() {
    const code = await promptDialog({
      title: 'Enter a referral code',
      message: 'Got a code from a Nabz nurse, physio or pharmacy? Add it before your first order.',
      label: 'Referral code',
      placeholder: 'NZ4K8P2Q…',
      maxLength: 12,
      minLength: 4,
      confirmLabel: 'Apply code'
    });
    if (!code) return;
    try {
      const r = await api.applyPartnerReferral(code.toUpperCase());
      setNotice({ tone: 'good', text: r.message || `Referred by ${r.referredBy}.` });
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not apply the code' });
    }
  }

  if (loading) return <div className="card skeleton-card" style={{ marginTop: 20 }} aria-busy="true" aria-label="Loading your account" />;
  if (!patient) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Your account</h2>
        <p className="muted">Sign in to see your account.</p>
        <Link href="/login" className="btn">Sign in</Link>
      </div>
    );
  }

  return (
    <>
      <section className="hero staff-hero">
        <ProfilePhotoEditor name={patient.name} url={photo} tone="dark" onChange={(url) => { setPhoto(url); refresh(); }} />
        <h1 style={{ fontSize: 34, margin: '12px 0 4px' }}>{patient.name}</h1>
        <p style={{ margin: 0 }}>{patient.email}{patient.phone ? `, ${patient.phone}` : ''}</p>
      </section>

      {notice && <div className={`notice ${notice.tone}`} role="status" style={{ marginTop: 16 }}>{notice.text}</div>}

      <div style={{ marginTop: 16 }}><CallMeBack /></div>
      <nav className="card account-links" aria-label="Account" style={{ marginTop: 16 }}>
        <Link href="/care/plans"><CalendarHeart size={18} aria-hidden="true" /><span>My care plans</span><ChevronRight size={16} aria-hidden="true" /></Link>
        <Link href="/lab-tests/orders"><FlaskConical size={18} aria-hidden="true" /><span>My lab tests</span><ChevronRight size={16} aria-hidden="true" /></Link>
        <Link href="/account/addresses"><MapPin size={18} aria-hidden="true" /><span>Saved addresses</span><ChevronRight size={16} aria-hidden="true" /></Link>
        <Link href="/orders"><Package size={18} aria-hidden="true" /><span>My orders and visits</span><ChevronRight size={16} aria-hidden="true" /></Link>
        <Link href="/plus"><Crown size={18} aria-hidden="true" /><span>Nabz Plus</span><ChevronRight size={16} aria-hidden="true" /></Link>
        <button type="button" onClick={referral}><Gift size={18} aria-hidden="true" /><span>Have a referral code?</span><ChevronRight size={16} aria-hidden="true" /></button>
        <Link href="/account/delete" className="danger-link"><Trash2 size={18} aria-hidden="true" /><span>Delete my account</span><ChevronRight size={16} aria-hidden="true" /></Link>
      </nav>

      <button className="btn secondary" style={{ marginTop: 16 }} onClick={async () => { await logout(); router.push('/'); }}>
        <LogOut size={16} aria-hidden="true" /> Sign out
      </button>
    </>
  );
}
