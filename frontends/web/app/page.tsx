'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, BadgeCheck, Clock3, Crown, Fingerprint, HeartHandshake, MapPin, PackageCheck,
  Share2, ShieldAlert, ShieldCheck, Star, Stethoscope, Wallet
} from 'lucide-react';
import type { CareService, HomeFeed } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { IconTile, serviceIcon, TONES } from './_components/icons';
import { TrustBadgeBar } from './_components/TrustBadgeBar';
import { CareGallery } from './_components/CareGallery';
import { PatientStories } from './_components/PatientStories';

const short = (s: CareService) => (s.displayName || s.name).replace(/ at Home| \(.*\)|Session/g, '').trim();

const SAFETY = [
  { icon: Fingerprint, title: 'Checked before they go live', text: 'ID, council registration and police verification for every professional.' },
  { icon: ShieldCheck, title: 'Visit code at the door', text: 'Your 4-digit code must be entered before a visit can start.' },
  { icon: Share2, title: 'Family can follow along', text: 'Share a live tracking link. It shows only a first name and the route.' },
  { icon: ShieldAlert, title: 'SOS in one tap', text: 'Alerts the Nabz safety team with your location. 108 and 112 are one tap away.' }
];

/** Public landing page. Signed-in customers go straight to the web app (/book). */
export default function Landing() {
  const { patient, loading } = useAuth();
  const router = useRouter();
  const [services, setServices] = useState<CareService[]>([]);
  const [feed, setFeed] = useState<HomeFeed | null>(null);

  useEffect(() => {
    if (!loading && patient) router.replace('/book');
  }, [loading, patient, router]);

  useEffect(() => {
    api.listCareServices().then((r) => setServices(r.services.filter((s) => s.category !== 'PACKAGE'))).catch(() => undefined);
    api.getHomeFeed().then(setFeed).catch(() => undefined);
  }, []);

  const plusBanner = feed?.banners.find((b) => b.kind === 'PLUS');

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="landing-hero bleed">
        <div className="inner">
          <div>
            <span className="kicker"><span className="live" /> Now live in Jaipur</span>
            <h1>Care that <em>comes home.</em></h1>
            <p className="lede">
              Book a verified nurse or physiotherapist to your door in minutes. We bring the supplies from the nearest
              pharmacy, you pay after the visit.
            </p>
            <div className="actions">
              <Link href="/signup" className="btn light lg">Book a visit <ArrowRight size={18} /></Link>
              <Link href="/pharmacy" className="btn ghost lg">Order medicines</Link>
            </div>
            <TrustBadgeBar />
            <div className="meta">
              <span><BadgeCheck size={16} color="#f0c77e" /> Verified professionals</span>
              <span><Wallet size={16} color="#f0c77e" /> Pay after the visit</span>
              <span><Clock3 size={16} color="#f0c77e" /> Book now or schedule</span>
            </div>
          </div>

          <div className="preview" aria-hidden="true">
            <div className="phone">
              <div className="screen">
                <div className="map">
                  <Image
                    src="/images/map-preview.jpg"
                    alt="Live GPS map"
                    fill
                    sizes="360px"
                    className="map-bg"
                    priority
                  />
                  <div className="route" />
                  <div className="pin-me" />
                  <div className="pin-staff"><Stethoscope size={18} /></div>
                </div>
                <div className="sheet">
                  <span className="label">On the way</span>
                  <span className="title">Asha is coming</span>
                  <div className="staff">
                    <div className="av-photo-wrap">
                      <Image
                        src="/images/staff/nurse-asha.jpg"
                        alt="Asha Verma"
                        width={46}
                        height={46}
                        className="av-photo"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 14 }}>Asha Verma</b>
                      <div className="muted">B.Sc Nursing · 6 yrs</div>
                    </div>
                    <span className="pill mint"><Star size={11} /> 4.9</span>
                  </div>
                  <div className="badges">
                    <span className="pill mint">ID verified</span>
                    <span className="pill mint">Police verified</span>
                  </div>
                  <div className="code"><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: '#f0c77e' }}>VISIT CODE</span><b>4 8 2 7</b></div>
                </div>
              </div>
            </div>
            <div className="float-card a"><Clock3 size={16} color="#12a150" /> Arriving in 12 min</div>
            <div className="float-card b"><PackageCheck size={16} color="#2f7d5b" /> Supplies packed nearby</div>
          </div>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <section className="band" id="services">
        <div className="head">
          <div>
            <span className="kicker" style={{ color: 'var(--amber)' }}>Home care</span>
            <h2 className="display">What can we help with?</h2>
          </div>
          <p className="sub">Verified nurses and physiotherapists available across Jaipur for doorstep care.</p>
        </div>
        <div className="service-grid">
          {services.slice(0, 8).map((s, i) => (
            <Link key={s.serviceType} href={`/nursing?service=${s.serviceType}`} className="service-card">
              <div className="top">
                <IconTile icon={serviceIcon(s.serviceType)} bg={TONES[i % TONES.length].bg} color={TONES[i % TONES.length].fg} size={46} />
              </div>
              <h3>{short(s)}</h3>
              <span className="muted">
                {s.serviceDetails?.duration ? `${s.serviceDetails.duration} min · ` : ''}
                {s.supplies?.length ? 'Supplies can be brought' : 'Professional brings the kit'}
              </span>
              <span className="go">Book <ArrowRight size={14} /></span>
            </Link>
          ))}
          {services.length === 0 && [0, 1, 2, 3].map((i) => <div key={i} className="service-card" style={{ minHeight: 150, opacity: .5 }} />)}
        </div>
      </section>

      {/* ── Care in Action Visual Gallery ─────────────────────────────────── */}
      <CareGallery />

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="band alt bleed" id="how">
        <div className="container">
          <div className="head">
            <div>
              <span className="kicker" style={{ color: 'var(--amber)' }}>How it works</span>
              <h2 className="display">Three taps to a visit.</h2>
            </div>
          </div>
          <div className="how-grid">
            <div className="how"><div className="num">01</div><h3>Pick a service and time</h3><p>Book now to reach the nearest online professional, or schedule for later.</p></div>
            <div className="how"><div className="num">02</div><h3>Tick what they should bring</h3><p>Syringes, dressings, IV sets: the nearest pharmacy packs them. Untick what you already have.</p></div>
            <div className="how"><div className="num">03</div><h3>Track, verify, pay after</h3><p>Follow them live, share the visit code at the door, and pay once the visit is done.</p></div>
          </div>
        </div>
      </section>

      {/* ── Real Customer Stories & Testimonials ──────────────────────────── */}
      <PatientStories />

      {/* ── Safety ───────────────────────────────────────────────────────── */}
      <section className="band" id="safety">
        <div className="safety">
          <div>
            <span className="kicker">Safety first</span>
            <h2>Someone you can let into your home.</h2>
            <p>Every professional is checked before they can go online, and every visit is protected from the moment it’s booked.</p>
          </div>
          <div className="safety-list">
            {SAFETY.map((s) => (
              <div key={s.title} className="safety-item">
                <b><s.icon size={18} color="#f0c77e" /> {s.title}</b>
                <span>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plus + partners ──────────────────────────────────────────────── */}
      <section className="band tight">
        <div className="split">
          <div className="promo plus">
            <Crown size={26} color="#f0c77e" />
            <h3>Nabz Plus</h3>
            <p>{plusBanner ? `${plusBanner.title}. ${plusBanner.subtitle}.` : 'No platform fee on visits and free medicine delivery.'}</p>
            <div className="actions">
              <Link href="/plus" className="btn accent">See Plus</Link>
            </div>
          </div>
          <div className="promo partner">
            <HeartHandshake size={26} color="#2f7d5b" />
            <h3>Work with Nabz</h3>
            <p>Nurses, physios, pharmacies and path labs in Jaipur: get requests near you, clear earnings on every job, weekly payouts.</p>
            <div className="actions">
              <Link href="/partners" className="btn">Join as a partner</Link>
              <Link href="/staff/login" className="btn secondary">Partner sign in</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="band tight">
        <div className="cta-band">
          <h2>Ready when you are.</h2>
          <p>Create your account in under a minute, then book your first visit.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="btn light lg">Create account</Link>
            <Link href="/login" className="btn ghost lg">I already have one</Link>
          </div>
          <p style={{ marginTop: 18, marginBottom: 0, fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}><MapPin size={14} /> Serving Jaipur. More cities soon.</p>
        </div>
      </section>
    </>
  );
}
