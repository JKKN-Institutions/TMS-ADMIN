// Write whitelist + validation for tms_fee_concession_rule. Mirrors the table's
// CHECK constraints so the API returns a readable 400 instead of a 23514.

import type { ConcessionKind } from './concession-math';

export interface RuleWrite {
  kind: ConcessionKind;
  institution_id: string | null;
  admission_year: number | null;
  program_id: string | null;
  percent: number | null;
  annual_amount: number | null;
  label: string;
  is_active: boolean;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseRuleInput(
  body: unknown
): { ok: true; value: RuleWrite; isActiveProvided: boolean } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const label = str(b.label);
  if (!label) return { ok: false, error: 'Label is required.' };
  // POST leaves is_active out and gets true (a new rule starts active). PUT
  // leaving it out must mean "don't touch it" — the caller checks this flag,
  // not just RuleWrite.is_active, so a PUT can't accidentally reactivate a rule.
  const isActiveProvided = b.is_active !== undefined;
  const is_active = isActiveProvided ? b.is_active === true : true;

  if (b.kind === 'final_year') {
    const institution_id = str(b.institution_id);
    const admission_year = num(b.admission_year);
    const percent = num(b.percent);
    if (!institution_id) return { ok: false, error: 'College is required.' };
    if (admission_year === null || !Number.isInteger(admission_year)) {
      return { ok: false, error: 'Admission year is required.' };
    }
    if (percent === null || percent <= 0 || percent >= 100) {
      return { ok: false, error: 'Percent must be between 0 and 100.' };
    }
    return { ok: true, isActiveProvided, value: {
      kind: 'final_year', institution_id, admission_year, program_id: str(b.program_id),
      percent, annual_amount: null, label, is_active,
    } };
  }

  if (b.kind === 'scheme_75') {
    const annual_amount = num(b.annual_amount);
    if (annual_amount === null || annual_amount <= 0) {
      return { ok: false, error: 'Annual amount must be greater than 0.' };
    }
    return { ok: true, isActiveProvided, value: {
      kind: 'scheme_75', institution_id: null, admission_year: null, program_id: null,
      percent: null, annual_amount, label, is_active,
    } };
  }

  return { ok: false, error: 'Unknown concession kind.' };
}
