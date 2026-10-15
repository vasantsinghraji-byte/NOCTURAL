import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import { IconTile } from '@/app/_components/icons';

// Lab partner sign-in opens with the lab dashboard (audit M7). Until then this
// page explains that instead of showing a login to an empty screen.
export default function LabLogin() {
  return (
    <section className="card" style={{ marginTop: 20, padding: 28 }}>
      <div style={{ marginBottom: 12 }}><IconTile icon={FlaskConical} bg="#fbf0dc" color="#b7791f" size={56} /></div>
      <h2 style={{ marginTop: 0 }}>Path lab partners: coming soon</h2>
      <p className="muted">Sample pickups, report uploads and lab orders for partner labs are in the next release.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Link className="btn" href="/partners">Join the waitlist</Link>
        <Link className="btn secondary" href="/">Home</Link>
      </div>
    </section>
  );
}
