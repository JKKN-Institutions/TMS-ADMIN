import { PortalGrievances } from '@/components/grievances/portal-grievances';

// Boarding-staff self-service grievances — same flow as the learner portal, talking
// to the boarding API namespace (submitter_type='boarding').
export default function BoardingGrievancesPage() {
  return <PortalGrievances apiBase="/api/boarding/grievances" />;
}
