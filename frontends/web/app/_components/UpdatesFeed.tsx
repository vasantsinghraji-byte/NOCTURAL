'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { FeedUpdate } from '@medrush/shared';
import { api } from '@/lib/api';

/**
 * "Offers & updates" from Nabz (admin panel campaigns). Customers see customer
 * offers, partners see partner updates. Renders nothing when there are none.
 */
export default function UpdatesFeed({ audience, title = 'Offers & updates' }: { audience: 'customer' | 'partner'; title?: string }) {
  const [items, setItems] = useState<FeedUpdate[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const load = audience === 'customer'
      ? api.getMyOffers().then((r) => r.offers)
      : api.getPartnerUpdates().then((r) => r.updates);
    load.then(setItems).catch(() => setItems([]));
  }, [audience]);

  const opened = (id: string) => {
    (audience === 'customer' ? api.markOfferOpened(id) : api.markPartnerUpdateOpened(id)).catch(() => undefined);
  };

  async function copy(item: FeedUpdate) {
    if (!item.offerCode) return;
    try {
      await navigator.clipboard.writeText(item.offerCode);
      setCopied(item._id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard blocked: the code is visible anyway */ }
    opened(item._id);
  }

  if (!items.length) return null;
  return (
    <section aria-labelledby="updates-title" style={{ marginTop: 18 }}>
      <div className="section-title" id="updates-title" style={{ marginTop: 0 }}>{title}</div>
      <div className="feed">
        {items.map((item) => (
          <article key={item._id} className="feed-card">
            <b>{item.title}</b>
            <p>{item.body}</p>
            <div className="row">
              {item.offerCode && (
                <button className="feed-code" onClick={() => copy(item)} aria-label={`Copy offer code ${item.offerCode}`}>
                  {copied === item._id ? 'Copied' : item.offerCode}
                </button>
              )}
              {item.cta && <Link href={item.cta.path} className="feed-cta" onClick={() => opened(item._id)}>{item.cta.label} →</Link>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
