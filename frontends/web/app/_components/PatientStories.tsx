import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

/**
 * "Who Nabz helps": everyday situations Nabz is built for. These are
 * illustrative scenarios, not testimonials: no names, ratings or dates, and the
 * section says the photos are illustrative. Add real reviews only once they
 * come from real, consenting customers.
 */
interface Scenario {
  id: string;
  title: string;
  body: string;
  photo: string;
  alt: string;
  helps: string[];
  service: string;
  cta: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'surgery',
    title: 'Recovering after surgery',
    body: 'Dressings and vitals at home, so the first weeks after an operation don’t mean a hospital trip every day.',
    photo: '/images/people/avatar-ramesh.jpg',
    alt: 'Older man smiling in his living room',
    helps: ['Sterile supplies packed nearby', 'Book the same nurse again'],
    service: 'POST_SURGERY_CARE',
    cta: 'Post-surgery care'
  },
  {
    id: 'parent',
    title: 'Caring for a parent from afar',
    body: 'Book for your mother or father from another city, follow the visit live and share the visit code with them.',
    photo: '/images/people/avatar-neha.jpg',
    alt: 'Young woman smiling outdoors',
    helps: ['Live family tracking link', '4-digit code at the door'],
    service: 'ELDERLY_CARE',
    cta: 'Elderly care'
  },
  {
    id: 'rehab',
    title: 'Getting moving again',
    body: 'A physiotherapist comes to your living room with the kit for knee, back or post-surgery rehab.',
    photo: '/images/people/avatar-vikram.jpg',
    alt: 'Man smiling at home',
    helps: ['Professional brings the kit', 'Session packages'],
    service: 'PHYSIOTHERAPY_SESSION',
    cta: 'Home physiotherapy'
  },
  {
    id: 'routine',
    title: 'Routine injections and checks',
    body: 'Injections, drips and blood-pressure checks at home, with no waiting room and no commute.',
    photo: '/images/people/avatar-sunita.jpg',
    alt: 'Older woman in a saree smiling at home',
    helps: ['Book now or schedule', 'Pay after the visit'],
    service: 'INJECTION',
    cta: 'Injection at home'
  }
];

export function PatientStories() {
  return (
    <section className="band patient-stories-section" id="who">
      <div className="container">
        <div className="head">
          <div>
            <span className="kicker" style={{ color: 'var(--night)' }}>Who Nabz helps</span>
            <h2 className="display">Care that fits real life.</h2>
          </div>
          <p className="sub">The everyday situations Nabz is built for, from a first dressing after surgery to a parent who lives alone.</p>
        </div>

        <div className="stories-grid">
          {SCENARIOS.map((s) => (
            <article key={s.id} className="scenario-card">
              <div className="scenario-photo">
                <Image src={s.photo} alt={s.alt} fill sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 280px" />
              </div>
              <div className="scenario-body">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <ul>
                  {s.helps.map((h) => (
                    <li key={h}><Check size={14} /> {h}</li>
                  ))}
                </ul>
                <Link href={`/nursing?service=${s.service}`} className="scenario-link">
                  {s.cta} <ArrowRight size={14} />
                </Link>
              </div>
            </article>
          ))}
        </div>
        <p className="illustrative-note">Illustrative situations. Photos are for illustration and do not show Nabz patients.</p>
      </div>
    </section>
  );
}
