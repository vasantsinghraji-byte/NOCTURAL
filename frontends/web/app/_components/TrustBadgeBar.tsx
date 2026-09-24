import Image from 'next/image';
import { KeyRound, ShieldCheck, Siren } from 'lucide-react';

/**
 * Hero trust strip. States only what the product actually does; no ratings or
 * customer counts until real numbers exist to back them.
 */
export function TrustBadgeBar() {
  return (
    <div className="trust-badge-bar">
      <div className="avatar-wrap solo">
        <Image src="/images/staff/nurse-asha.jpg" alt="Nurse in blue scrubs" width={46} height={46} className="avatar-img" priority />
      </div>

      <p className="trust-caption">
        <b>Every nurse and physio is verified</b> (ID, council registration and police check) before their first visit.
      </p>

      <div className="trust-seals">
        <span className="trust-pill"><ShieldCheck size={14} color="var(--mint)" /> Verified</span>
        <span className="trust-pill"><KeyRound size={14} color="#f0c77e" /> Visit code</span>
        <span className="trust-pill"><Siren size={14} color="#ffc4cd" /> SOS</span>
      </div>
    </div>
  );
}
