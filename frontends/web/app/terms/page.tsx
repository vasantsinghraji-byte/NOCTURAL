import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms and Conditions · Nabz',
  description: 'The terms for using Nabz as a customer or as a partner.'
};

// Draft pending legal review: bracketed items must be filled in by the company
// and the text checked by a lawyer before public launch.
const VERSION = '0.9 (draft, 27 September 2026)';

const SECTIONS: Array<{ id: string; title: string; body: Array<string | string[]> }> = [
  {
    id: 'about',
    title: '1. Who we are and what Nabz does',
    body: [
      'Nabz is operated by [Company legal name], [registered address] ("Nabz", "we"). Nabz is a technology platform that connects customers with independent, verified healthcare professionals (nurses, physiotherapists, phlebotomists), licensed pharmacies, certified pathology labs and delivery partners in Jaipur.',
      'Nabz is not a hospital, clinic, pharmacy or laboratory. Care is given by the professional or partner you book; medicines are sold by the licensed pharmacy that accepts your order; tests are run by the certified lab. Nabz is not a replacement for emergency care.'
    ]
  },
  {
    id: 'emergency',
    title: '2. Emergencies',
    body: ['If it is an emergency, call 108 (ambulance) or 112 now. Do not wait for a Nabz booking. The SOS button in the app alerts the Nabz safety team but does not replace emergency services.']
  },
  {
    id: 'accounts',
    title: '3. Your account',
    body: [
      'You must be 18 or older to create an account. Keep your login details private; you are responsible for activity on your account.',
      'You can book for someone else (for example a parent in another city). You confirm they have agreed to the visit or order and to you sharing their name, phone number and address with Nabz and the partner.'
    ]
  },
  {
    id: 'visits',
    title: '4. Home visits (nurse, physiotherapy and care packages)',
    body: [
      [
        'Professionals are verified (ID, police check and council registration) before they can take bookings.',
        'Share the 4-digit visit code only when the professional is at the door; it starts the visit.',
        'Physiotherapy packages are booked for a number of sessions. The same professional is assigned for the package where possible; you can ask to change the professional at any time.',
        'Visit prices, the platform fee and taxes are shown before you confirm.'
      ]
    ]
  },
  {
    id: 'cancellations',
    title: '5. Cancellations and changes',
    body: [
      [
        'Free cancellation until the professional is on the way.',
        'After the professional is on the way, a cancellation fee of ₹[100] applies. It is added to your next booking.',
        'A visit that has started cannot be cancelled in the app; contact support.',
        'If no professional is available, we tell you and you can pick another time or cancel for free.'
      ]
    ]
  },
  {
    id: 'medicines',
    title: '6. Medicines',
    body: [
      [
        'Prescription medicines need a valid prescription, which the pharmacist checks before packing. The pharmacy can refuse an order it cannot legally fill.',
        'Give the delivery person the 4-digit delivery code only when you receive your order.',
        'If a medicine is out of stock, the pharmacy may drop that item and refund it, or the order may move to another partner pharmacy.',
        'Returns of medicines are accepted only for wrong, damaged or expired items reported within [48 hours] of delivery.'
      ]
    ]
  },
  {
    id: 'labs',
    title: '7. Lab tests',
    body: ['Samples are collected at home by a certified collector and tested by a Nabz-endorsed, certified laboratory. The laboratory is responsible for the test and the report. Reports are shared with you in the Nabz app.']
  },
  {
    id: 'payments',
    title: '8. Payments and refunds',
    body: [
      [
        'You can pay online (UPI, card, netbanking) through our payment partner, or in cash where offered.',
        'Refunds for cancelled or failed orders go back to the original payment method, usually within [5–7] working days.',
        'Nabz Plus membership fees are shown before purchase; benefits apply while the membership is active.'
      ]
    ]
  },
  {
    id: 'referrals',
    title: '9. Referral codes',
    body: ['A customer can use one partner referral code before their first order. Rewards go to the referring partner only after the referred customer completes a first order of the minimum value, or the referred partner completes their first job. Self-referrals, fake accounts and abuse cancel rewards. Nabz may change or end the programme with notice in the app.']
  },
  {
    id: 'conduct',
    title: '10. Fair use',
    body: ['Treat professionals and partners with respect. Harassment, unsafe requests or abuse lead to account suspension. Do not ask partners to take bookings or payments outside Nabz: off-platform visits are not verified, tracked, insured or supported.']
  },
  {
    id: 'privacy',
    title: '11. Your data and health information',
    body: [
      'We process personal and health data under the Digital Personal Data Protection Act, 2023, only to provide and improve the service, and share it with a partner only as needed for your booking or order (for example your address and phone, shown to the professional around the time of the visit).',
      'You can delete your account in the app or at nabz.[domain]/account/delete. Your identity and contact details are erased; your health records are kept as your medical history, and records the law requires (invoices, pharmacy registers) are kept.'
    ]
  },
  {
    id: 'partners',
    title: '12. Terms for Nabz partners',
    body: [
      [
        'Partners are independent professionals or businesses, not Nabz employees. You keep the licences, registrations and insurance your work requires, and let Nabz verify them.',
        'Accept only jobs you can complete. Repeated cancellations after accepting may pause your account.',
        'Collect cash only as shown in the app and record it at completion; it is deducted from your weekly payout.',
        'Do not take Nabz customers off the platform or share personal contact details for off-app bookings. Doing so may end your partnership and hold pending payouts.',
        'Nabz commission and fees are shown in the app and in your partner agreement. Payouts are made weekly to your verified bank account, after any tax deducted at source as required by law.',
        'Pharmacies follow the Drugs and Cosmetics Act and rules, including prescription checks and the Schedule H1 register. Labs keep their certification current.'
      ]
    ]
  },
  {
    id: 'liability',
    title: '13. Liability',
    body: ['To the extent the law allows, Nabz is not liable for the professional judgement of an independent professional, the dispensing decisions of a pharmacy, or the results of a laboratory, but we will help you raise and resolve any complaint. Nothing in these terms limits rights you have under the Consumer Protection Act, 2019.']
  },
  {
    id: 'grievance',
    title: '14. Complaints and grievance officer',
    body: ['Raise a complaint from the app or write to our grievance officer: [Name], [email], [phone]. We acknowledge within 24 hours and aim to resolve within 15 days. These terms are governed by the laws of India; courts in Jaipur, Rajasthan have jurisdiction.']
  },
  {
    id: 'changes',
    title: '15. Changes to these terms',
    body: ['We may update these terms. We will show the new version in the app before it applies; continuing to use Nabz after that means you accept it.']
  }
];

export default function TermsPage() {
  return (
    <article className="card" style={{ marginTop: 20, padding: 28, maxWidth: 820, lineHeight: 1.6 }}>
      <h1 style={{ marginTop: 0 }}>Terms and Conditions</h1>
      <p className="muted">Version {VERSION}. These terms apply to the Nabz app, the Nabz Partner app and this website.</p>
      <nav aria-label="Sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0 20px' }}>
        {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="pill">{s.title.replace(/^\d+\.\s/, '')}</a>)}
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} style={{ scrollMarginTop: 80 }}>
          <h2 style={{ fontSize: 20, marginTop: 24 }}>{s.title}</h2>
          {s.body.map((b, i) => (Array.isArray(b)
            ? <ul key={i}>{b.map((li) => <li key={li}>{li}</li>)}</ul>
            : <p key={i}>{b}</p>))}
        </section>
      ))}
      <p className="muted" style={{ marginTop: 28 }}>Questions? <Link href="/" className="link">Contact Nabz</Link>.</p>
    </article>
  );
}
