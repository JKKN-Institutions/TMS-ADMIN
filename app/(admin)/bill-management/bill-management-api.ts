import type { BillSummary, TransportBillRow, UnbilledPerson } from '@/lib/fees/bills';

// Re-export the transport-year option fetcher so this module has one import home.
export { fetchTransportYearOptions } from '../fees/fee-api';
export type { MasterOption } from '../fees/fee-api';
export type { BillSummary, TransportBillRow, UnbilledPerson } from '@/lib/fees/bills';

const json = async (res: Response) => {
  const j = await res.json();
  if (!res.ok || j.success === false) throw new Error(j.error || 'Request failed');
  return j;
};

export interface BillsResult {
  summary: BillSummary;
  rows: TransportBillRow[];
}

export async function fetchBills(year: string): Promise<BillsResult> {
  const res = await fetch(`/api/admin/bill-management?year=${encodeURIComponent(year)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return (await json(res)).data as BillsResult;
}

export interface UnbilledResult {
  count: number;
  people: UnbilledPerson[];
}

export async function fetchUnbilled(year: string): Promise<UnbilledResult> {
  const res = await fetch(`/api/admin/bill-management/unbilled?year=${encodeURIComponent(year)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return (await json(res)).data as UnbilledResult;
}
