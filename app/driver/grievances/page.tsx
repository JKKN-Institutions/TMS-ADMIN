import { PortalGrievances } from '@/components/grievances/portal-grievances';

// Driver self-service grievances — same flow as the learner portal, talking to the
// driver API namespace (submitter_type='driver').
export default function DriverGrievancesPage() {
  return <PortalGrievances apiBase="/api/driver/grievances" />;
}
