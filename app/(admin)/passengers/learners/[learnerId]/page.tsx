'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { LearnerPassenger } from '@/lib/passengers/types';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';

async function fetchLearner(id: string): Promise<LearnerPassenger> {
  const res = await fetch(`/api/admin/passengers/learners/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load learner');
  return json.data as LearnerPassenger;
}

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Learners', href: '/passengers/learners' },
  { label: name },
];

export default function LearnerDetailPage({ params }: { params: Promise<{ learnerId: string }> }) {
  const { learnerId } = use(params);
  const { data: learner, isLoading, isError } = useQuery({
    queryKey: ['passenger-learner', learnerId],
    queryFn: () => fetchLearner(learnerId),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/passengers/learners" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !learner) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/passengers/learners" title="Learner not found" />
        <p className="text-gray-600">
          This learner could not be loaded.{' '}
          <Link href="/passengers/learners" className="text-green-600 hover:underline">
            Back to learners
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(learner.name)}
        backHref="/passengers/learners"
        title={learner.name}
        subtitle={learner.lifecycleStatus ? learner.lifecycleStatus.replace(/_/g, ' ') : 'Learner'}
      />

      <SectionCard title="Learner">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Roll Number" value={learner.rollNumber} />
          <Field label="Register Number" value={learner.registerNumber} />
          <Field label="Email" value={learner.email} />
          <Field label="Mobile" value={learner.mobile} />
          <Field label="Institution" value={learner.institutionName} />
          <Field label="Department" value={learner.departmentName} />
          <Field label="Lifecycle Status" value={learner.lifecycleStatus?.replace(/_/g, ' ')} />
        </div>
      </SectionCard>

      <SectionCard title="Transport">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Bus Required" value="Yes" />
          <Field label="Assigned Route" value={learner.routeLabel} />
          <Field label="Boarding Stop" value={learner.stopLabel} />
          <Field
            label="Transport Fee"
            value={learner.transportFee != null ? `₹${learner.transportFee}` : null}
          />
          <Field label="Assignment" value={learner.assigned ? 'Assigned' : 'Unassigned'} />
        </div>
      </SectionCard>
    </div>
  );
}
