'use client';

import { useQuery } from '@tanstack/react-query';

/** The learner DTO returned by /api/student/me (mapLearner + busRequired). */
export interface LearnerMe {
  id: string;
  name: string;
  rollNumber: string | null;
  registerNumber: string | null;
  email: string | null;
  mobile: string | null;
  lifecycleStatus: string;
  institutionName: string | null;
  departmentName: string | null;
  programName: string | null;
  semesterName: string | null;
  routeLabel: string | null;
  stopLabel: string | null;
  transportFee: number | null;
  assigned: boolean;
  busRequired: boolean | null;
}

export type MeResult = { data?: LearnerMe; notFound?: boolean };

async function fetchMe(): Promise<MeResult> {
  const res = await fetch('/api/student/me', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load transport profile');
  const json = await res.json();
  return { data: json.data as LearnerMe };
}

/** Fetches the signed-in learner's own transport profile. */
export function useMe() {
  return useQuery({ queryKey: ['student-me'], queryFn: fetchMe });
}
