import type { ApplyResult, ConcessionList, ConcessionRow } from '@/lib/fees/concessions';
import type { ConcessionKind, ConcessionRule } from '@/lib/fees/concession-math';

export type { ApplyResult, ConcessionList, ConcessionRow, ConcessionKind, ConcessionRule };

const json = async (res: Response) => {
  const j = await res.json();
  if (!res.ok || j.success === false) throw new Error(j.error || 'Request failed');
  return j;
};

export async function fetchConcessions(year: string, kind: ConcessionKind): Promise<ConcessionList> {
  const qs = new URLSearchParams({ year, kind });
  const res = await fetch(`/api/admin/fees/concessions?${qs}`, { cache: 'no-store', credentials: 'same-origin' });
  return (await json(res)).data as ConcessionList;
}

export async function applyConcessionTo(year: string, kind: ConcessionKind, personIds: string[]): Promise<ApplyResult[]> {
  const res = await fetch('/api/admin/fees/concessions/apply', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, kind, personIds }),
  });
  return (await json(res)).data.results as ApplyResult[];
}

export interface RuleInput {
  kind: ConcessionKind;
  institution_id?: string | null;
  admission_year?: number | null;
  program_id?: string | null;
  percent?: number | null;
  annual_amount?: number | null;
  label: string;
  is_active?: boolean;
}

export async function createRule(year: string, input: RuleInput): Promise<ConcessionRule> {
  const res = await fetch('/api/admin/fees/concessions/rules', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, ...input }),
  });
  return (await json(res)).data as ConcessionRule;
}

export async function updateRule(id: string, input: RuleInput): Promise<ConcessionRule> {
  const res = await fetch(`/api/admin/fees/concessions/rules/${id}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await json(res)).data as ConcessionRule;
}
