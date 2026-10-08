'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarHeart, FlaskConical, HeartHandshake, Activity, Wallet, Sparkles } from 'lucide-react';
import type { MarketService, SpotlightAd, CarePlanView, PlanProposalView } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inr, fmtDay, fmtTime } from '@/lib/care';
import CareArt from '../_components/care/CareArt';

type Home = { spotlight: SpotlightAd[]; physio: MarketService[]; homecare: MarketService[]; labs: MarketService[] };

export default function CareHub() {
  const { patient } = useAuth();
  const [home, setHome] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);
  const [mine, setMine] = useState<{ plans: CarePlanView[]; proposals: PlanProposalView[]; wallet: number } | null>(null);

  useEffect(() => {
    api.marketHome().then((r) => setHome(r)).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (!patient) return;
    Promise.all([api.myCarePlans(), api.myProposals(), api.myWallet()])
      .then(([p, pr, w]) => setMine({ plans: p.plans, proposals: pr.proposals, wallet: w.balance }))
      .catch(() => setMine(null));
  }, [patient]);

  const active = mine?.plans.filter((p) => p.status === 'ACTIVE' || p.status === 'PENDING_PAYMENT') || [];

  return (
    <div>
      <section className="mk-hero" aria-labelledby="care-title">
        <div className="in">
          <div className="mk-reveal">
            <h1 id="care-title">Care at home, by people <b>you choose</b></h1>
            <p>Compare physiotherapists, caregivers and labs near you. See every price before you book.</p>
            <div className="cta-row">
              <Link className="mk-btn" href="/care/physio">Book a Physio <span className="arrow"><ArrowRight size={16} aria-hidden="true" /></span></Link>
              <Link className="mk-btn dark" href="/lab-tests">Lab Tests</Link>
            </div>
          </div>
          <div className="art"><CareArt kind="heart" /></div>
        </div>
      </section>

      {mine && (active.length > 0 || mine.proposals.length > 0 || mine.wallet > 0) && (
        <section aria-label="Your care" className="mk-grid" style={{ marginBottom: 8 }}>
          {active.slice(0, 2).map((p) => {
            const next = p.sessions?.find((s) => ['CONFIRMED', 'REQUESTED'].includes(s.status));
            return (
              <Link key={p._id} href={`/care/plans/${p._id}`} className="mk-card-link">
                <div className="mk-card red mk-reveal">
                  <div className="mk-row">
                    <span className="mk-tile"><CalendarHeart size={22} aria-hidden="true" /></span>
                    <div className="grow">
                      <p className="mk-title">{p.serviceName}</p>
                      <p className="mk-meta" style={{ margin: 0 }}>{p.store?.name} · {p.sessionsCompleted}/{p.sessionsTotal} done</p>
                    </div>
                    <span className="mk-icon-btn" aria-hidden="true"><ArrowRight size={18} /></span>
                  </div>
                  {next && <p className="mk-meta" style={{ margin: '12px 0 0' }}>Next: {fmtDay(next.scheduledDate)}, {fmtTime(next.scheduledTime)}</p>}
                </div>
              </Link>
            );
          })}
          {mine.proposals.slice(0, 1).map((pr) => (
            <Link key={pr._id} href={`/care/shop/${pr.store?._id}?proposal=${pr._id}`} className="mk-card-link">
              <div className="mk-card mk-reveal">
                <div className="mk-row">
                  <span className="mk-tile"><Sparkles size={22} aria-hidden="true" /></span>
                  <div className="grow">
                    <p className="mk-title">Plan suggested by {pr.store?.name}</p>
                    <p className="mk-meta" style={{ margin: 0 }}>{pr.sessions} × {pr.serviceName}</p>
                  </div>
                  <span className="mk-icon-btn red" aria-hidden="true"><ArrowRight size={18} /></span>
                </div>
              </div>
            </Link>
          ))}
          {mine.wallet > 0 && (
            <div className="mk-card mk-reveal">
              <div className="mk-row">
                <span className="mk-tile"><Wallet size={22} aria-hidden="true" /></span>
                <div className="grow"><p className="mk-title">{inr(mine.wallet)} Nabz credit</p><p className="mk-meta" style={{ margin: 0 }}>Used automatically on your next booking</p></div>
              </div>
            </div>
          )}
        </section>
      )}

      <h2 className="mk-h2">What do you need?</h2>
      <div className="mk-grid">
        <KindCard href="/care/physio" title="Physiotherapy" text="Back, knee, sports injuries, rehab. At home or at the clinic." icon={<Activity size={22} aria-hidden="true" />} art="physio" red />
        <KindCard href="/care/homecare" title="Home care" text="Attendants, elderly, baby and post-hospital care. Same person every day." icon={<HeartHandshake size={22} aria-hidden="true" />} art="homecare" />
        <KindCard href="/lab-tests" title="Lab tests" text="Compare labs and prices. Sample collected at home." icon={<FlaskConical size={22} aria-hidden="true" />} art="lab" />
      </div>

      {home?.spotlight?.[0] && <Spotlight ad={home.spotlight[0]} />}

      <h2 className="mk-h2">Popular physio services</h2>
      <ServiceStrip items={home?.physio} failed={failed} base="/care/physio" />
      <h2 className="mk-h2">Home care</h2>
      <ServiceStrip items={home?.homecare} failed={failed} base="/care/homecare" />
      <h2 className="mk-h2">Lab tests and checkups</h2>
      <ServiceStrip items={home?.labs} failed={failed} base="/lab-tests" lab />

      <section className="mk-card" style={{ marginTop: 26 }} aria-labelledby="how-title">
        <h2 id="how-title" className="mk-title" style={{ fontSize: 20 }}>How booking works</h2>
        <div className="mk-steps" style={{ marginTop: 14 }}>
          {[
            ['Compare', 'Each provider sets their own price. You see the rating, distance and travel fee before you choose.'],
            ['Pick your days', 'One visit or a full plan. The same professional comes every time.'],
            ['See the full bill', 'Service, travel, discount and tax shown before you pay. The price is locked for 15 minutes.'],
            ['Pay your way', 'Pay after each visit, or pay for the plan upfront and save more.']
          ].map(([t, d], i) => (
            <div key={t} className={`mk-step ${i === 0 ? 'on' : ''}`}>
              <span className="dot" aria-hidden="true">{i + 1}</span>
              <div><strong>{t}</strong><p className="mk-meta" style={{ margin: '2px 0 0' }}>{d}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KindCard({ href, title, text, icon, art, red }: { href: string; title: string; text: string; icon: React.ReactNode; art: 'physio' | 'homecare' | 'lab'; red?: boolean }) {
  return (
    <Link href={href} className="mk-card-link">
      <div className={`mk-card ${red ? 'red' : ''} mk-reveal`} style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, alignItems: 'center', minHeight: 170 }}>
        <div>
          <span className="mk-tile" style={{ marginBottom: 12 }}>{icon}</span>
          <p className="mk-title" style={{ fontSize: 19 }}>{title}</p>
          <p className="mk-meta" style={{ margin: '6px 0 0' }}>{text}</p>
        </div>
        <div style={{ width: 110, height: 110, borderRadius: 24, background: red ? 'rgba(255,255,255,.08)' : 'linear-gradient(150deg, var(--wine-2), var(--wine))', overflow: 'hidden' }}>
          <CareArt kind={art} />
        </div>
      </div>
    </Link>
  );
}

function ServiceStrip({ items, failed, base, lab }: { items?: MarketService[]; failed: boolean; base: string; lab?: boolean }) {
  if (failed) return <p className="mk-note neutral">Services couldn’t load. Check your connection and refresh.</p>;
  if (!items) return <div className="mk-grid">{[0, 1, 2].map((i) => <div key={i} className="mk-skel" />)}</div>;
  if (!items.length) return <p className="mk-note neutral">Coming to your area soon.</p>;
  return (
    <div className="mk-grid">
      {items.slice(0, 6).map((s) => (
        <Link key={s._id} href={lab ? `${base}?test=${s._id}` : `${base}?service=${s._id}`} className="mk-card-link">
          <div className="mk-card mk-reveal">
            <div className="mk-row">
              <div className="grow">
                <p className="mk-title">{s.displayName}</p>
                <p className="mk-meta" style={{ margin: '4px 0 0' }}>{s.providers ? `${s.providers} ${lab ? 'lab' : 'provider'}${s.providers === 1 ? '' : 's'}` : 'Coming soon'}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                {s.fromPrice != null && <span className="mk-price"><small>from </small>{inr(s.fromPrice)}</span>}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Spotlight({ ad }: { ad: SpotlightAd }) {
  const href = ad.creative?.ctaPath || (ad.store ? `/care/shop/${ad.store}` : '/care');
  return (
    <Link href={href} className="mk-card-link" onClick={() => { if (!ad.house) api.adClick(ad.token).catch(() => undefined); }} style={{ display: 'block', marginTop: 18 }}>
      <div className="mk-card red mk-reveal">
        <div className="mk-row">
          <div className="grow">
            <span className="mk-badge" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>{ad.house ? 'From Nabz' : ad.label}</span>
            <p className="mk-title" style={{ fontSize: 20, marginTop: 10 }}>{ad.creative?.title}</p>
            {ad.creative?.subtitle && <p className="mk-meta" style={{ margin: '4px 0 0' }}>{ad.creative.subtitle}</p>}
          </div>
          <span className="mk-icon-btn" aria-hidden="true"><ArrowRight size={18} /></span>
        </div>
      </div>
    </Link>
  );
}
