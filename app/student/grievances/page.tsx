import { PortalGrievances } from '@/components/grievances/portal-grievances';

// Learner self-service grievances. Shares the portal UI with the driver and boarding
// portals; the only difference is the API namespace it talks to.
export default function StudentGrievancesPage() {
  return <PortalGrievances apiBase="/api/student/grievances" />;
}
