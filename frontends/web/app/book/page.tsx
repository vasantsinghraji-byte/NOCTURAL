'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CareService } from '@medrush/shared';
import { api } from '@/lib/api';
import { loadDeliveryCoords, saveDeliveryCoords, type Coords } from '@/lib/location';
import { FlaskConical, ShieldCheck, Siren, Pill, Store, ArrowRight } from 'lucide-react';
import { IconTile, serviceIcon, TONES } from '../_components/icons';

const DEMO: Coords = { lat: 26.9110, lng: 75.8010 }; // launch city: Jaipur
const short = (s: CareService) => (s.displayName || s.name).replace(/ at Home| \(.*\)|Session/g, '').trim();

const MORE = [
  { href: '/pharmacy', icon: Pill, title: 'Pharmacy', desc: 'Medicines from stores near you in ~30 min', tone: 'tone-green', tag: 'Live' },
  { href: '/lab-tests', icon: FlaskConical, title: 'Lab Tests', desc: 'Home sample collection', tone: 'tone-sky', tag: 'Soon' },
  { href: '/emergency', icon: Siren, title: 'Emergency SOS', desc: 'One tap for urgent home care', tone: 'tone-rose', tag: 'Soon' }
];

/** Web-app home: book a medical staff (Uber/Rapido style) with a live map. */
export default function BookPage() {
  const router = useRouter();
  const [services, setServices] = useState<CareService[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [point, setPoint] = useState<Coords>(DEMO);
  const [located, setLocated] = useState(false);

  useEffect(() => {
    api.listCareServices()
      .then((r) => {
        const list = r.services.filter((s) => s.category !== 'PACKAGE');
        setServices(list);
        setSelected(list[0]?.serviceType ?? null);
      })
      .catch(() => undefined);
    const saved = loadDeliveryCoords();
    if (saved) { setPoint(saved); setLocated(true); return; }
    navigator.geolocation?.getCurrentPosition(
      (pos) => { const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }; saveDeliveryCoords(c); setPoint(c); setLocated(true); },
      () => undefined,
      { timeout: 8000 }
    );
  }, []);

  const service = services.find((s) => s.serviceType === selected) || null;
  const d = 0.012;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${point.lng - d * 1.6},${point.lat - d},${point.lng + d * 1.6},${point.lat + d}&layer=mapnik&marker=${point.lat},${point.lng}`;

  return (
    <>
      <section className="book-hero">
        <div className="book-panel">
          <span className="pill"><ShieldCheck size={13} /> Verified nurses & physios</span>
          <h1>Book a medical staff to your home</h1>
          <div className="where">
            <span className="dot" />
            <div style={{ flex: 1 }}>
              <div className="muted">Care at</div>
              <b>{located ? 'Your current location' : 'C-Scheme, Jaipur (demo)'}</b>
            </div>
          </div>

          <div className="muted" style={{ fontWeight: 700 }}>What do you need?</div>
          <div className="cat-row">
            {services.slice(0, 8).map((s, i) => (
              <button key={s.serviceType} type="button" className={`cat-chip ${selected === s.serviceType ? 'on' : ''}`} onClick={() => setSelected(s.serviceType)}>
                <IconTile icon={serviceIcon(s.serviceType)} bg={TONES[i % TONES.length].bg} color={TONES[i % TONES.length].fg} size={58} round />
                {short(s)}
              </button>
            ))}
            {services.length === 0 && <span className="muted">Loading services…</span>}
          </div>

          {service && (
            <div className="where" style={{ background: '#fff', border: '1px solid var(--border)' }}>
              <IconTile icon={serviceIcon(service.serviceType)} size={46} />
              <div style={{ flex: 1 }}>
                <b>{service.displayName || service.name}</b>
                <div className="muted">
                  {service.serviceDetails?.duration ? `${service.serviceDetails.duration} min · ` : ''}
                  {service.supplies?.length ? 'Staff can bring the supplies' : 'Staff brings own kit'}
                </div>
              </div>
              <b style={{ color: 'var(--brand)' }}>₹{service.pricing.basePrice}</b>
            </div>
          )}

          <button className="btn book-cta" disabled={!service} onClick={() => service && router.push(`/nursing?service=${service.serviceType}`)}>
            {service ? `Book ${short(service)}` : 'Book'}
          </button>
          <div className="muted" style={{ textAlign: 'center' }}>Pay at the visit · prices shown upfront</div>
        </div>

        <div className="book-map">
          <iframe title="Map" src={mapSrc} loading="lazy" />
          <div className="float">
            <IconTile icon={Store} size={44} />
            <div>
              <b>Supplies from the nearest pharmacy</b>
              <div className="muted">The staff collects them on the way. No second trip.</div>
            </div>
          </div>
        </div>
      </section>

      <div className="section-title">More from Nabz</div>
      <div className="grid cats">
        {MORE.map((s) => (
          <Link key={s.href} href={s.href} className={`card cat ${s.tone}`}>
            <IconTile icon={s.icon} size={52} />
            <span className="go"><ArrowRight size={18} /></span>
            <h3>{s.title} <span className={`pill ${s.tag === 'Live' ? '' : 'dark'}`}>{s.tag}</span></h3>
            <span className="muted">{s.desc}</span>
          </Link>
        ))}
      </div>

      <div className="section-title">How a visit works</div>
      <div className="grid cards steps">
        <div className="card step"><h3>Pick a service</h3><span className="muted">Injection, IV drip, dressing, catheter care, physio.</span></div>
        <div className="card step"><h3>Tick what they should bring</h3><span className="muted">Untick anything you already have. Prices are shown upfront.</span></div>
        <div className="card step"><h3>Staff arrives prepared</h3><span className="muted">The nearest pharmacy packs the kit and the staff collects it.</span></div>
      </div>

    </>
  );
}
