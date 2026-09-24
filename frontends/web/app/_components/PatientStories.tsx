'use client';

import Image from 'next/image';
import { BadgeCheck, Heart, MapPin, Quote, Star } from 'lucide-react';

interface Story {
  id: string;
  name: string;
  age: number;
  relation: string;
  location: string;
  service: string;
  avatar: string;
  quote: string;
  highlight: string;
  daysAgo: string;
}

const STORIES: Story[] = [
  {
    id: 'ramesh',
    name: 'Ramesh Kumar',
    age: 68,
    relation: 'Patient',
    location: 'C-Scheme, Jaipur',
    service: 'Post-Op Knee Dressing & Vitals',
    avatar: '/images/testimonials/avatar-ramesh.jpg',
    quote:
      'After my knee replacement surgery, visiting the hospital daily was extremely painful. Asha ji came to our doorstep every morning at exactly 9:00 AM with fresh sterile dressings and checked my vitals. Truly a blessing.',
    highlight: 'Saved 2 hours of daily hospital travel',
    daysAgo: '3 days ago'
  },
  {
    id: 'neha',
    name: 'Neha Agarwal',
    age: 32,
    relation: 'Daughter booking for mother',
    location: 'Mansarovar, Jaipur',
    service: 'Elderly Nursing & Insulin Support',
    avatar: '/images/testimonials/avatar-neha.jpg',
    quote:
      'I live and work in Bangalore while my 72-year-old mother lives alone in Mansarovar. The live tracking, verified police badge, and 4-digit door code give me complete peace of mind. I pay only after the nurse finishes the visit.',
    highlight: 'Live tracking & door security code',
    daysAgo: 'Yesterday'
  },
  {
    id: 'vikram',
    name: 'Vikram Sharma',
    age: 42,
    relation: 'Patient',
    location: 'Malviya Nagar, Jaipur',
    service: 'Home Physiotherapy (Knee Rehab)',
    avatar: '/images/testimonials/avatar-vikram.jpg',
    quote:
      'Rajesh ji is an exceptional physiotherapist. He brought resistance bands and monitored my range of motion step-by-step. Within 2 weeks of home sessions, I was walking without support.',
    highlight: 'Walking without support in 14 days',
    daysAgo: '5 days ago'
  },
  {
    id: 'sunita',
    name: 'Sunita Devi',
    age: 60,
    relation: 'Patient',
    location: 'Vaishali Nagar, Jaipur',
    service: 'Doorstep Injection & Blood Test',
    avatar: '/images/testimonials/avatar-sunita.jpg',
    quote:
      'No waiting in crowded pathology labs. The nurse arrived in 18 minutes with sterile vacuum collection tubes. Gentle prick, no bruising, and reports arrived on WhatsApp the same evening.',
    highlight: 'Zero waiting, pain-free sample collection',
    daysAgo: '1 week ago'
  }
];

export function PatientStories() {
  return (
    <section className="band patient-stories-section" id="stories">
      <div className="container">
        <div className="head">
          <div>
            <span className="kicker" style={{ color: 'var(--night)' }}>
              Real patient experiences
            </span>
            <h2 className="display">Stories of Care at Home</h2>
          </div>
          <p className="sub">
            Real families across Jaipur share how doorstep care helped their loved ones recover comfortably and safely.
          </p>
        </div>

        <div className="stories-grid">
          {STORIES.map((s) => (
            <div key={s.id} className="story-card">
              <div className="story-header">
                <div className="story-avatar-wrap">
                  <Image
                    src={s.avatar}
                    alt={s.name}
                    width={64}
                    height={64}
                    className="story-avatar"
                  />
                  <span className="verified-badge-icon" title="Verified patient visit">
                    <BadgeCheck size={18} color="#2f9e6e" fill="#e3f1e8" />
                  </span>
                </div>

                <div className="story-meta">
                  <div className="name-row">
                    <h4>{s.name}</h4>
                    <span className="age-pill">{s.age} yrs</span>
                  </div>
                  <span className="relation-text">{s.relation}</span>
                  <span className="location-text">
                    <MapPin size={12} color="var(--amber)" /> {s.location}
                  </span>
                </div>
              </div>

              <div className="story-stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} color="#f0c77e" fill="#f0c77e" />
                ))}
                <span className="service-tag">{s.service}</span>
              </div>

              <div className="quote-box">
                <Quote size={20} className="quote-icon" />
                <p className="quote-text">&ldquo;{s.quote}&rdquo;</p>
              </div>

              <div className="story-footer">
                <span className="highlight-pill">
                  <Heart size={12} color="var(--rose)" fill="var(--rose)" /> {s.highlight}
                </span>
                <span className="days-ago">{s.daysAgo}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
