import { redirect } from 'next/navigation';

// Enrollments merged into Learners: the same learners, with an Assign route
// button on every row. Old links and bookmarks land on the unassigned view.
export default function EnrollmentRequestsPage() {
  redirect('/passengers/learners?assignment=unassigned');
}
