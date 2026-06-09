'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/lib/student/use-me';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-words">{value}</span>
    </div>
  );
}

export default function StudentProfilePage() {
  const { data, isLoading, error } = useMe();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load your profile.</div>;
  if (data?.notFound || !data?.data) {
    return (
      <div className="text-muted-foreground text-sm">
        No learner record is linked to your account yet. Contact the transport office.
      </div>
    );
  }

  const me = data.data;
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">My Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <Row label="Name" value={me.name} />
          <Row label="Roll number" value={me.rollNumber ?? '—'} />
          <Row label="Register number" value={me.registerNumber ?? '—'} />
          <Row label="Email" value={me.email ?? '—'} />
          <Row label="Mobile" value={me.mobile ?? '—'} />
          <Row label="Department" value={me.departmentName ?? '—'} />
          <Row label="Programme" value={me.programName ?? '—'} />
          <Row label="Semester" value={me.semesterName ?? '—'} />
          <Row label="Institution" value={me.institutionName ?? '—'} />
          <Row label="Status" value={me.lifecycleStatus} />
          <Row label="Route" value={me.routeLabel ?? '—'} />
          <Row label="Boarding stop" value={me.stopLabel ?? '—'} />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Profile details are managed by the institution and shown read-only here.
      </p>
    </div>
  );
}
