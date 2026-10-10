import { Stethoscope } from 'lucide-react';
import ComingSoon from '@/app/_components/ComingSoon';

export default function ConsultPage() {
  return (
    <ComingSoon
      icon={Stethoscope}
      title="Consult a Doctor"
      phase="Phase 4"
      blurb="Chat or audio consultations with available doctors, with digital prescriptions and lab-test ordering."
    />
  );
}
