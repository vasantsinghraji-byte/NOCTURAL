'use client';

import Image from 'next/image';
import { Activity, Award, ShieldCheck, Stethoscope } from 'lucide-react';

const MOMENTS = [
  {
    title: 'Compassionate Senior Care',
    desc: 'Regular blood pressure monitoring, diabetic wound dressings, and medication schedules delivered at home with kindness.',
    img: '/images/patients/elderly-care.jpg',
    tag: 'Senior Health',
    icon: Activity
  },
  {
    title: 'Guided Home Rehabilitation',
    desc: 'Qualified physiotherapists bring resistance bands and recovery kits to your living room to help you move comfortably again.',
    img: '/images/patients/physio-recovery.jpg',
    tag: 'Physiotherapy',
    icon: Stethoscope
  },
  {
    title: 'Verified & Trusted Healthcare',
    desc: 'Every nurse and physiotherapist is checked before their first visit: ID, council registration and a police background check.',
    img: '/images/staff/nurse-asha.jpg',
    tag: 'Safety Verified',
    icon: ShieldCheck
  }
];

export function CareGallery() {
  return (
    <section className="band alt bleed care-gallery-section" id="gallery">
      <div className="container">
        <div className="head">
          <div>
            <span className="kicker" style={{ color: 'var(--brand)' }}>
              Care in action
            </span>
            <h2 className="display">What Doorstep Healthcare Looks Like</h2>
          </div>
          <p className="sub">
            Warm, clinical-grade healthcare without crowded hospital waiting rooms or painful commutes.
          </p>
        </div>

        <div className="gallery-grid">
          {MOMENTS.map((m) => (
            <div key={m.title} className="gallery-card">
              <div className="gallery-img-wrap">
                <Image
                  src={m.img}
                  alt={m.title}
                  width={600}
                  height={450}
                  className="gallery-img"
                />
                <span className="gallery-tag">
                  <m.icon size={13} /> {m.tag}
                </span>
              </div>
              <div className="gallery-body">
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
