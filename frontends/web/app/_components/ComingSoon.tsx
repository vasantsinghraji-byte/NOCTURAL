import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { IconTile } from './icons';

export default function ComingSoon({ icon, title, phase, blurb }: {
  icon: LucideIcon; title: string; phase: string; blurb: string;
}) {
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <IconTile icon={icon} size={56} />
      <h2 style={{ margin: '6px 0' }}>{title}</h2>
      <p className="muted">{blurb}</p>
      <div className="pill">Scaffolded · shipping in {phase}</div>
      <div style={{ marginTop: 14 }}>
        <Link href="/" className="btn secondary">← Back home</Link>
      </div>
    </section>
  );
}
