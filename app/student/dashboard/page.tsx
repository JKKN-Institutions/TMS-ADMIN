'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/lib/student/use-me';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}

export default function StudentDashboardPage() {
  const { data, isLoading, error } = useMe();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error)
    return (
      <div className="text-destructive">
        Could not load your transport profile. Please try again.
      </div>
    );

  if (data?.notFound || !data?.data) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Transport profile not found</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We couldn&apos;t find a learner record linked to your account yet. Please
          contact the transport office to complete your transport setup.
        </CardContent>
      </Card>
    );
  }

  const me = data.data;
  const firstName = me.name?.split(' ')[0] ?? '';

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">
        Welcome{firstName ? `, ${firstName}` : ''}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Transport status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Needs transport" value={me.busRequired ? 'Yes' : 'No'} />
          <Field label="Route allocated" value={me.assigned ? 'Yes' : 'Not yet'} />
          <Field label="Route" value={me.routeLabel ?? '—'} />
          <Field label="Boarding stop" value={me.stopLabel ?? '—'} />
          <Field
            label="Transport fee"
            value={me.transportFee != null ? `₹${me.transportFee}` : '—'}
          />
          <Field label="Roll number" value={me.rollNumber ?? '—'} />
        </CardContent>
      </Card>

      {me.busRequired && !me.assigned && (
        <Card className="max-w-3xl">
          <CardContent className="text-sm pt-6 text-muted-foreground">
            You need transport but don&apos;t have a route allocated yet. Transport
            enrollment will be available here soon.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
