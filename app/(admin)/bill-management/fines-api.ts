import type { FineCandidate, CreateFinesResult } from '@/lib/fines/create';
import type { FineRateInput } from '@/lib/fines/fields';
import type { FineRow, FineSummary } from '@/lib/fines/list';

const json = async (res: Response) => {
  const j = await res.json();
  if (!res.ok || j.success === false) throw new Error(j.error || 'Request failed');
  return j;
};

export type { FineCandidate, CreateFinesResult, FineRow, FineSummary };

export async function fetchFines(year: string): Promise<{ rows: FineRow[]; summary: FineSummary }> {
  const res = await fetch(`/api/admin/fines?year=${encodeURIComponent(year)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return (await json(res)).data;
}

export async function cancelFine(id: string, reason: string): Promise<void> {
  const res = await fetch(`/api/admin/fines/${id}/cancel`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  await json(res);
}

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

/**
 * Write stop rates into the year's fine sheet. Shares the same endpoint as the
 * Fine Rates screen, so a rate typed in the Generate Fine dialog shows up there
 * — there is one sheet, not a dialog-local copy.
 */
export async function saveFineRates(year: string, rates: FineRateInput[]): Promise<void> {
  const res = await fetch('/api/admin/fees/fine-rates', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, rates }),
  });
  await json(res);
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
