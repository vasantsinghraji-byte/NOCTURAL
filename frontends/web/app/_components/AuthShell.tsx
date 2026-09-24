import type { ReactNode } from 'react';
import { BadgeCheck, ShieldCheck, Wallet } from 'lucide-react';

/** Split auth layout: midnight brand panel (desktop) + form. */
export default function AuthShell({ title, subtitle, children, sideTitle, sideText }: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  sideTitle?: string;
  sideText?: string;
}) {
  return (
    <div className="auth-wrap bleed">
      <aside className="auth-side">
        <div>
          <span className="kicker">Nabz · Jaipur</span>
          <h2>{sideTitle || 'Care that comes home.'}</h2>
          <p>{sideText || 'Verified nurses and physios at your door, supplies from the nearest pharmacy, and you pay after the visit.'}</p>
          <div className="points">
            <div><BadgeCheck size={18} color="#f0c77e" /> ID, council and police verified professionals</div>
            <div><ShieldCheck size={18} color="#f0c77e" /> Visit code and SOS on every visit</div>
            <div><Wallet size={18} color="#f0c77e" /> Clear prices, pay after the visit</div>
          </div>
        </div>
        <span style={{ color: 'var(--on-night-muted)', fontSize: 12 }}>In an emergency call 108 or 112.</span>
      </aside>
      <section className="auth-main">
        <div className="auth-box">
          <h1>{title}</h1>
          {subtitle ? <p className="sub">{subtitle}</p> : null}
          {children}
        </div>
      </section>
    </div>
  );
}
