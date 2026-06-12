import type { TransportYearRow } from './columns';

export async function fetchTransportYear(id: string): Promise<TransportYearRow> {
  const res = await fetch(`/api/admin/transport-years/${id}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load transport year');
  return json.data as TransportYearRow;
}
