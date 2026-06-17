import type { FeeStructureRow } from '@/lib/fees/types';

export interface MasterOption {
  id: string;
  name: string;
}

const json = async (res: Response) => {
  const j = await res.json();
  if (!res.ok || j.success === false) throw new Error(j.error || 'Request failed');
  return j;
};

export async function fetchFeeStructure(id: string): Promise<FeeStructureRow> {
  const res = await fetch(`/api/admin/fees/${id}`, { cache: 'no-store', credentials: 'same-origin' });
  return (await json(res)).data as FeeStructureRow;
}

/** Cascading master-data options. Pass parent ids to narrow (e.g. {institution_id}). */
export async function fetchMasters(
  type: string,
  parents: Record<string, string | undefined> = {}
): Promise<MasterOption[]> {
  const qs = new URLSearchParams({ type });
  for (const [k, v] of Object.entries(parents)) if (v) qs.set(k, v);
  const res = await fetch(`/api/admin/masters?${qs.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  return (await json(res)).data as MasterOption[];
}

export async function fetchTransportYearOptions(): Promise<MasterOption[]> {
  const res = await fetch('/api/admin/transport-years', { cache: 'no-store', credentials: 'same-origin' });
  const j = await json(res);
  return (j.data as Array<{ id: string; name: string }>).map((y) => ({ id: y.id, name: y.name }));
}

export interface GeneratePreview {
  mode: 'dry_run' | 'generate';
  audience: 'student' | 'staff';
  applicable: number;
  learnerCount: number;
  staffCount: number;
  termsPerPerson: number;
  alreadyBilledPairs: number;
  toGeneratePairs: number;
  conflictCount: number;
  totalPerPerson: number;
  staffDeferred: boolean;
  terms: Array<{ term_no: number; term_label: string | null; amount: number; due_date: string }>;
}

export interface GenerateResult {
  mode: 'generate';
  runId: string | null;
  applicable: number;
  learnerBilled: number;
  staffDeferred: number;
  skipped: number;
  errors: number;
}

export async function runGeneration(
  id: string,
  mode: 'dry_run' | 'generate'
): Promise<GeneratePreview | GenerateResult> {
  const res = await fetch(`/api/admin/fees/${id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify({ mode }),
  });
  return (await json(res)).data;
}

export interface CoveragePerson {
  person_id: string;
  person_type: 'learner' | 'staff';
  name: string;
  code: string | null;
  institution_id: string | null;
  institution_name: string | null;
  terms_billed: number;
  total_terms: number;
  status: 'billed' | 'partial' | 'unbilled' | 'staff_deferred';
}
export interface CoverageResult {
  summary: { applicable: number; billed: number; partial: number; unbilled: number; staffDeferred: number };
  people: CoveragePerson[];
}

export async function fetchCoverage(id: string): Promise<CoverageResult> {
  const res = await fetch(`/api/admin/fees/${id}/coverage`, { cache: 'no-store', credentials: 'same-origin' });
  return (await json(res)).data as CoverageResult;
}
