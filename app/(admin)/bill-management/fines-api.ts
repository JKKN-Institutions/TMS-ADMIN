import type { FineCandidate, CreateFinesResult } from '@/lib/fines/create';

const json = async (res: Response) => {
  const j = await res.json();
  if (!res.ok || j.success === false) throw new Error(j.error || 'Request failed');
  return j;
};

export type { FineCandidate, CreateFinesResult };

export async function previewFines(
  year: string,
  personIds: string[]
): Promise<{ candidates: FineCandidate[]; totalAmount: number }> {
  const res = await fetch('/api/admin/fines/preview', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transport_year_id: year, person_ids: personIds }),
  });
  return (await json(res)).data;
}

export async function createFines(body: {
  year: string;
  personIds: string[];
  dueDate: string;
  reason: string;
  notify: boolean;
  idempotencyKey: string;
  sourceBillByPerson: Record<string, string>;
}): Promise<CreateFinesResult> {
  const res = await fetch('/api/admin/fines', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transport_year_id: body.year,
      person_ids: body.personIds,
      due_date: body.dueDate,
      reason: body.reason,
      notify: body.notify,
      idempotency_key: body.idempotencyKey,
      source_bill_by_person: body.sourceBillByPerson,
    }),
  });
  return (await json(res)).data;
}
