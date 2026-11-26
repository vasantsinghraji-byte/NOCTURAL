import { Siren } from 'lucide-react';
import ComingSoon from '@/app/_components/ComingSoon';

export default function EmergencyPage() {
  return (
    <ComingSoon
      icon={Siren}
      title="Emergency SOS"
      phase="Phase 4"
      blurb="One-tap urgent home care with nearest-staff dispatch, live location sharing and emergency-contact alerts."
    />
  );
}
