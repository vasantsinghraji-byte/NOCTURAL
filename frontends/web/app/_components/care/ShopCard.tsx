'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BadgeCheck, Car, Home, Building2, Star, Tag } from 'lucide-react';
import type { ShopCard as Shop, CareMode } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr } from '@/lib/care';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** A provider in search results, like a restaurant card: price, rating, distance, travel. */
export default function ShopCard({ shop, mode, serviceId, unit }: { shop: Shop; mode?: CareMode; serviceId?: string; unit: string }) {
  const router = useRouter();
  const href = `/care/shop/${shop._id}${serviceId ? `?service=${serviceId}${mode ? `&mode=${mode}` : ''}` : ''}`;
  const open = (e: React.MouseEvent) => {
    if (!shop.sponsored || !shop.token) return;
    e.preventDefault();
    api.adClick(shop.token).catch(() => undefined).finally(() => router.push(href));
  };
  const homeOnlyHere = shop.home.enabled && shop.homeCovered === false;
  return (
    <Link href={href} className="mk-card-link" onClick={open}>
      <article className="mk-card mk-reveal" style={{ display: 'grid', gap: 12 }}>
        <div className="mk-row">
          <span className="mk-avatar" aria-hidden="true">{initials(shop.name)}</span>
          <div className="grow">
            <div className="mk-row" style={{ gap: 8 }}>
              <h3 className="mk-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shop.name}</h3>
              {shop.sponsored && <span className="mk-badge sponsored">{shop.label || 'Sponsored'}</span>}
            </div>
            <p className="mk-meta" style={{ margin: '2px 0 0' }}>
              {[shop.qualification, shop.experienceYears ? `${shop.experienceYears} yrs` : null, shop.languages.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
            </p>
          </div>
          {shop.rating.count > 0 ? (
            <span className="mk-rating" aria-label={`Rated ${shop.rating.avg} from ${shop.rating.count} reviews`}><Star size={14} fill="currentColor" aria-hidden="true" />{shop.rating.avg.toFixed(1)}<span className="mk-meta">({shop.rating.count})</span></span>
          ) : <span className="mk-badge">New</span>}
        </div>

        <div className="mk-badges">
          {shop.registered && <span className="mk-badge green"><BadgeCheck size={13} aria-hidden="true" /> Verified</span>}
          {shop.accredited && <span className="mk-badge green"><BadgeCheck size={13} aria-hidden="true" /> NABL</span>}
          {shop.clinic.enabled && <span className="mk-badge"><Building2 size={13} aria-hidden="true" /> Clinic{Number.isFinite(shop.distanceKm) ? ` ${shop.distanceKm} km` : ''}</span>}
          {shop.home.enabled && !homeOnlyHere && <span className="mk-badge"><Home size={13} aria-hidden="true" /> Home visits</span>}
          {homeOnlyHere && <span className="mk-badge">Clinic only for your address</span>}
          {shop.item?.offer && <span className="mk-badge red"><Tag size={13} aria-hidden="true" /> {shop.item.offer.label}</span>}
        </div>

        <div className="mk-row">
          <div className="grow">
            {shop.price != null ? (
              <span className="mk-price">{inr(shop.price)} <small>/ {unit}</small></span>
            ) : <span className="mk-meta">See services and prices</span>}
            {mode === 'HOME' && shop.travel && (
              <p className="mk-meta" style={{ margin: '2px 0 0' }}><Car size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Travel {inr(shop.travel.fee)} ({shop.travel.roadKm} km × {inr(shop.travel.ratePerKm)}/km)</p>
            )}
          </div>
          <span className="mk-icon-btn red" aria-hidden="true"><ArrowRight size={18} /></span>
        </div>
      </article>
    </Link>
  );
}
