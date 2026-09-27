'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BadgeCheck, CheckCircle2, Circle, Fingerprint, Gift, IndianRupee, Landmark, LogOut, Share2, ShieldCheck, Smartphone, Star, Store, Syringe, Wallet, type LucideIcon } from 'lucide-react';
import type { PartnerAccount, PayoutDetailsInput, PayoutSummary } from '@medrush/shared';
import { api } from '@/lib/api';

/**
 * Website version of the Partner app's Account screen (nurses, physios and
 * pharmacies): profile, rating, earnings, payouts and withdrawals, Nabz
 * commission tier, referral code, verification and log out.
 */

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;

export default function PartnerAccountPage() {
  const router = useRouter();
  const [acct, setAcct] = useState<PartnerAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPartnerAccount()
      .then((r) => setAcct(r.account))
      .catch((e) => setError(e.status === 401 || e.status === 403 ? 'auth' : e.message));
  }, []);

  async function signOut() {
    try { await api.logout(); } catch { /* already signed out */ }
    router.push('/');
  }

  if (error === 'auth') {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Partner account</h2>
        <p className="muted">Please log in with your partner account.</p>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <Link href="/staff/login" className="btn">Medical staff login</Link>
          <Link href="/vendor/login" className="btn secondary">Pharmacy login</Link>
        </div>
      </div>
    );
  }

  const e = acct?.earnings;
  const v = acct?.verification;
  const back = acct?.kind === 'PHARMACY' ? '/vendor' : '/staff';

  return (
    <>
      <section className="hero staff-hero">
        <Link href={back} className="link-on" aria-label="Back to dashboard"><ArrowLeft size={16} aria-hidden="true" /> Dashboard</Link>
        <span className="eyebrow" style={{ display: 'block', marginTop: 12 }}>My account</span>
        <h1 style={{ fontSize: 34, margin: '6px 0 4px' }}>{acct?.name || ' '}</h1>
        <p style={{ margin: 0 }}>
          {acct?.kind === 'PHARMACY' ? acct.store?.name || 'Pharmacy partner' : [acct?.role, acct?.profile?.qualification].filter(Boolean).join(' · ')}
        </p>
        {acct && (
          <p className="muted-on" style={{ marginTop: 6 }}>
            <Star size={14} aria-hidden="true" fill={acct.rating.average ? 'currentColor' : 'none'} />
            {acct.rating.average ? `${acct.rating.average.toFixed(1)} · ${acct.rating.count} reviews` : 'New · no reviews yet'}
          </p>
        )}
      </section>

      {error && <div className="notice bad" role="alert" style={{ marginTop: 16 }}>{error}</div>}
      {!acct && !error && <p className="muted" style={{ marginTop: 16 }}>Loading your account…</p>}

      {e && (
        <>
          <div className="section-title" style={{ marginTop: 20 }}>Earnings</div>
          <div className="stat-grid" style={{ marginTop: 0 }}>
            <Tile icon={IndianRupee} label={`Today · ${e.todayJobs} ${acct?.kind === 'PHARMACY' ? 'orders' : 'visits'}`} value={inr(e.today)} />
            <Tile icon={Wallet} label="This week" value={inr(e.week)} />
            <Tile icon={BadgeCheck} label={`All time · ${e.jobs} jobs`} value={inr(e.allTime)} />
            <Tile icon={IndianRupee} label="Next weekly payout" value={inr(Math.max(0, e.netPayout))} />
          </div>
          {e.cashHeld > 0 && (
            <p className="muted">You hold {inr(e.cashHeld)} in cash from customers; it’s taken off your payout ({inr(e.pendingPayout)} earned − {inr(e.cashHeld)} cash).</p>
          )}
        </>
      )}

      {acct && (
        <div className="account-grid">
          <Payouts />

          {acct.commission && (
            <div className="card stack">
              <h3 className="inline-title"><IndianRupee size={18} aria-hidden="true" /> Your Nabz commission: {acct.commission.currentRatePercent}%</h3>
              {acct.commission.flat ? (
                <p className="muted" style={{ margin: 0 }}>A flat {acct.commission.currentRatePercent}% on the medicines in each delivered order.</p>
              ) : (
                <>
                  <p className="muted" style={{ margin: 0 }}>
                    {acct.commission.jobsThisMonth} visits this month.
                    {acct.commission.jobsToNextTier ? ` ${acct.commission.jobsToNextTier} more and it drops to ${acct.commission.nextRatePercent}%.` : ' You’re on the lowest rate.'}
                    {' '}Resets on the 1st of every month.
                  </p>
                  <div className="tier-row">
                    {(acct.commission.tiers || []).map((t) => (
                      <div key={t.from} className={`tier ${t.ratePercent === acct.commission?.currentRatePercent ? 'on' : ''}`}>
                        <b>{t.ratePercent}%</b>
                        <span>{t.to ? `jobs ${t.from}–${t.to}` : `jobs ${t.from}+`}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {acct.referral && <Referral referral={acct.referral} />}

          {acct.kind === 'STAFF' && v && (
            <div className="card stack">
              <h3 style={{ margin: 0 }}>Verification</h3>
              <Check ok={v.id} icon={Fingerprint} label="ID verified" />
              <Check ok={v.police} icon={ShieldCheck} label="Police verification" />
              <Check ok={v.council} icon={BadgeCheck} label="Council registration" />
              <Check ok={v.vaccinated} icon={Syringe} label="Vaccinated" />
              {!(v.id && v.police && v.council) && <p className="muted" style={{ margin: 0 }}>You can go online once ID, police and council checks are done. Our team will call you.</p>}
            </div>
          )}

          {acct.kind === 'PHARMACY' && acct.store && (
            <div className="card stack">
              <h3 className="inline-title"><Store size={18} aria-hidden="true" /> {acct.store.name}</h3>
              {acct.store.address && <p className="muted" style={{ margin: 0 }}>{acct.store.address}</p>}
              <p className="muted" style={{ margin: 0 }}>Status: {acct.store.status}{acct.store.licence ? ` · Licence ${acct.store.licence}` : ''}</p>
            </div>
          )}

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Contact details</h3>
            <p className="muted" style={{ margin: 0 }}>{acct.email}</p>
            {acct.phone && <p className="muted" style={{ margin: 0 }}>{acct.phone}</p>}
            <button className="btn secondary" onClick={signOut} style={{ marginTop: 8, alignSelf: 'flex-start' }}><LogOut size={16} aria-hidden="true" /> Log out</button>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="card stat">
      <Icon size={18} aria-hidden="true" />
      <span className="muted">{label}</span>
      <b className="stat-value">{value}</b>
    </div>
  );
}

function Check({ ok, icon: Icon, label }: { ok: boolean; icon: LucideIcon; label: string }) {
  return (
    <div className={`check-row ${ok ? 'ok' : ''}`}>
      <Icon size={16} aria-hidden="true" />
      <span style={{ flex: 1 }}>{label}</span>
      {ok ? <CheckCircle2 size={18} aria-label="Done" /> : <Circle size={18} aria-label="Pending" />}
    </div>
  );
}

function Referral({ referral: r }: { referral: PartnerAccount['referral'] }) {
  const [copied, setCopied] = useState(false);
  const message = `Join me on Nabz: verified nurses, physios and medicines at home in Jaipur. Use my code ${r.code} when you sign up. Partners can apply with it too.`;

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ text: message }); return; }
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* share sheet dismissed */ }
  }

  return (
    <div className="card stack">
      <h3 className="inline-title"><Gift size={18} aria-hidden="true" /> Refer and keep more</h3>
      <p className="muted" style={{ margin: 0 }}>
        When someone you refer completes their first order (customers, {inr(r.minFirstOrder)} or more) or their first job (partners),
        your next {r.rewardJobs} jobs carry only {r.reducedCommissionPercent}% Nabz commission.
      </p>
      <div className="code-box" aria-label="Your referral code">{r.code}</div>
      <p className="muted" style={{ margin: 0 }}>{r.successful} successful referrals · {r.credits} low-commission jobs left</p>
      <button className="btn" onClick={share} aria-live="polite"><Share2 size={16} aria-hidden="true" /> {copied ? 'Copied to clipboard' : 'Share my code'}</button>
    </div>
  );
}

function Payouts() {
  const [data, setData] = useState<PayoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api.getPayouts().then((r) => setData(r.payouts)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function withdraw() {
    if (!data) return;
    if (!window.confirm(`Withdraw ${inr(data.available)}?\n\nIt goes to ${data.details?.display}. Transfers are usually done within 1 working day.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestWithdrawal();
      setNotice('Withdrawal requested. We’ll notify you when the money is sent.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not withdraw');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <div className="card stack"><h3 className="inline-title"><Wallet size={18} aria-hidden="true" /> Payouts</h3>{error ? <div className="notice bad">{error}</div> : <p className="muted">Loading…</p>}</div>;
  }
  const open = data.history.find((h) => h.status === 'REQUESTED');
  const cooling = data.details?.withdrawalsFrom && new Date(data.details.withdrawalsFrom) > new Date();

  return (
    <div className="card stack">
      <h3 className="inline-title"><Wallet size={18} aria-hidden="true" /> Payouts</h3>
      <div className="stat-value" style={{ fontSize: 34 }}>{inr(data.available)}</div>
      <p className="muted" style={{ margin: 0 }}>
        Available to withdraw: {inr(data.earned)} earned − {inr(data.cashHeld)} cash you collected.
        {data.owes > 0 ? ` You hold ${inr(data.owes)} more in cash than you’ve earned; it’s settled from your next earnings.` : ''}
      </p>

      {data.details ? (
        <button className="dest-row" onClick={() => setEditing(true)} aria-label="Change payout details">
          {data.details.method === 'UPI' ? <Smartphone size={16} aria-hidden="true" /> : <Landmark size={16} aria-hidden="true" />}
          <span style={{ flex: 1, textAlign: 'left' }}>{data.details.display}</span>
          <span className="link">Change</span>
        </button>
      ) : (
        <button className="btn secondary" onClick={() => setEditing(true)}>Add UPI ID or bank account</button>
      )}

      {open ? (
        <p className="warn-text">Withdrawal of {inr(open.amount)} is being processed.</p>
      ) : cooling ? (
        <p className="warn-text">Payout details changed recently: withdrawals open {new Date(data.details!.withdrawalsFrom!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</p>
      ) : null}
      {error && <div className="notice bad" role="alert">{error}</div>}
      {notice && <div className="notice good" role="status">{notice}</div>}

      <button className="btn" disabled={!data.canWithdraw || busy} onClick={withdraw}>
        {busy ? 'Requesting…' : data.available >= data.minimum ? `Withdraw ${inr(data.available)}` : `Withdraw from ${inr(data.minimum)}`}
      </button>

      {data.history.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 4 }}>
          <span className="eyebrow-dark">Recent withdrawals</span>
          {data.history.slice(0, 5).map((h) => (
            <div key={h._id} className="row">
              <span>{inr(h.amount)} · {new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              <span className={`pill ${h.status === 'PAID' ? 'mint' : h.status === 'REJECTED' ? 'rx' : ''}`}>
                {h.status === 'PAID' ? 'Paid' : h.status === 'REJECTED' ? 'Rejected' : 'Processing'}
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && <DetailsDialog onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setNotice('Payout details saved. For your safety, withdrawals open 24 hours after a change.'); load(); }} />}
    </div>
  );
}

function DetailsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [method, setMethod] = useState<'UPI' | 'BANK'>('UPI');
  const [f, setF] = useState({ upiId: '', accountNumber: '', ifsc: '', accountName: '', bankName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const input: PayoutDetailsInput = method === 'UPI'
      ? { method, upiId: f.upiId.trim(), ...(f.accountName.trim() ? { accountName: f.accountName.trim() } : {}) }
      : { method, accountNumber: f.accountNumber.trim(), ifsc: f.ifsc.trim().toUpperCase(), accountName: f.accountName.trim(), ...(f.bankName.trim() ? { bankName: f.bankName.trim() } : {}) };
    setBusy(true);
    setError(null);
    try {
      await api.savePayoutDetails(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="payout-title" onClick={onClose}>
      <form className="card dialog" onSubmit={save} onClick={(e) => e.stopPropagation()} autoComplete="off">
        <h2 id="payout-title" style={{ marginTop: 0 }}>Where should we pay you?</h2>
        <div className="segmented" role="radiogroup" aria-label="Payout method">
          {(['UPI', 'BANK'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>
              {m === 'UPI' ? 'UPI' : 'Bank account'}
            </button>
          ))}
        </div>
        {method === 'UPI' ? (
          <>
            <label htmlFor="upi">UPI ID</label>
            <input id="upi" className="input" required placeholder="name@okicici" autoCapitalize="none" spellCheck={false} value={f.upiId} onChange={set('upiId')} />
          </>
        ) : (
          <>
            <label htmlFor="acname">Account holder’s name</label>
            <input id="acname" className="input" required value={f.accountName} onChange={set('accountName')} />
            <label htmlFor="acno">Account number</label>
            <input id="acno" className="input" required type="password" inputMode="numeric" maxLength={18} value={f.accountNumber} onChange={(e) => setF((x) => ({ ...x, accountNumber: e.target.value.replace(/\D/g, '') }))} />
            <label htmlFor="ifsc">IFSC</label>
            <input id="ifsc" className="input" required placeholder="HDFC0001234" maxLength={11} autoCapitalize="characters" spellCheck={false} value={f.ifsc} onChange={set('ifsc')} />
            <label htmlFor="bank">Bank name (optional)</label>
            <input id="bank" className="input" value={f.bankName} onChange={set('bankName')} />
          </>
        )}
        <p className="muted" style={{ margin: '4px 0 0' }}>Your account number is stored encrypted. Only the last 4 digits are shown.</p>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save payout details'}</button>
        </div>
      </form>
    </div>
  );
}
