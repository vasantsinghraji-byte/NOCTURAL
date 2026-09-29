import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import { IconTile } from '../_components/icons';

export default function LabPartnerHome() {
  return (
    <section className="card" style={{ marginTop: 20, padding: 28 }}>
      <div style={{ marginBottom: 12 }}><IconTile icon={FlaskConical} bg="#fbf0dc" color="#b7791f" size={56} /></div>
      <h2 style={{ marginTop: 0 }}>Path lab partner dashboard</h2>
      <p className="muted">
        You&apos;re signed in to the lab partner portal. Sample pickups, report uploads and lab orders arrive
        here with the lab-tests module.
      </p>
      <span className="pill sky">Lab module: next release</span>
      <div style={{ marginTop: 16 }}><Link className="btn secondary" href="/">Home</Link></div>
    </section>
  );
}
