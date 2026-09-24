'use client';

import Image from 'next/image';
import { ShieldCheck, Star, Users } from 'lucide-react';

const AVATARS = [
  { name: 'Ramesh Kumar', src: '/images/testimonials/avatar-ramesh.jpg' },
  { name: 'Neha Agarwal', src: '/images/testimonials/avatar-neha.jpg' },
  { name: 'Vikram Sharma', src: '/images/testimonials/avatar-vikram.jpg' },
  { name: 'Sunita Devi', src: '/images/testimonials/avatar-sunita.jpg' },
];

export function TrustBadgeBar() {
  return (
    <div className="trust-badge-bar">
      <div className="avatar-group">
        {AVATARS.map((a, i) => (
          <div key={a.name} className="avatar-wrap" style={{ zIndex: AVATARS.length - i }}>
            <Image
              src={a.src}
              alt={a.name}
              width={42}
              height={42}
              className="avatar-img"
              priority
            />
          </div>
        ))}
      </div>

      <div className="trust-content">
        <div className="rating-row">
          <div className="stars" aria-label="5 stars">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={14} color="#f0c77e" fill="#f0c77e" />
            ))}
          </div>
          <span className="rating-score">4.9 / 5.0</span>
        </div>
        <p className="trust-caption">
          Trusted by <b>12,500+ families</b> across Jaipur
        </p>
      </div>

      <div className="trust-seals">
        <span className="trust-pill">
          <ShieldCheck size={14} color="var(--mint)" /> Police Verified
        </span>
        <span className="trust-pill">
          <Users size={14} color="#f0c77e" /> Council Registered
        </span>
      </div>
    </div>
  );
}
