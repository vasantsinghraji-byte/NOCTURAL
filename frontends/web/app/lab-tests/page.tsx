import { FlaskConical } from 'lucide-react';
import ComingSoon from '@/app/_components/ComingSoon';

export default function LabTestsPage() {
  return (
    <ComingSoon
      icon={FlaskConical}
      title="Lab Tests"
      phase="Phase 4"
      blurb="Browse tests and packages, schedule home sample collection, and get reports delivered digitally."
    />
  );
}
