import { Stethoscope } from 'lucide-react';
import ComingSoon from '@/app/_components/ComingSoon';

export default function DoctorPage() {
  return (
    <ComingSoon
      icon={Stethoscope}
      title="Doctor Portal"
      phase="Phase 4"
      blurb="Consultation queue, patient history at a glance, digital prescription pad and lab-test ordering."
    />
  );
}
