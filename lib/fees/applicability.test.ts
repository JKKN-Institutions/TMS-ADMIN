import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from './__testing__/fake-supabase';
import { resolveApplicablePeople } from './applicability';
import { DEFAULT_LIFECYCLE_STATUSES } from './types';

// The fake client does not filter — it records the ops a query issued. That is
// what we want here: the whole bug was in WHICH lifecycle states get pushed
// down to PostgREST, so assert on the `in` argument itself.
const LEARNER_SOURCE = 'tms_billable_learner';

function lifecycleFilterOf(svc: ReturnType<typeof makeFakeSupabase>): unknown[] {
  const call = svc.calls.find((c) => c.table === LEARNER_SOURCE);
  const op = call?.ops.find(([name, args]) => name === 'in' && args[0] === 'lifecycle_status');
  return op?.[1][1] as unknown[];
}

const EMPTY = () =>
  makeFakeSupabase({ [LEARNER_SOURCE]: [], staff: [], admission_years: [] });

describe('resolveApplicablePeople — learner lifecycle gate', () => {
  it('bills the states a bus-pass applicant can sit in, not just active', async () => {
    // Regression: MyJKKN's Bus Pass Request flips bus_required for new
    // admissions in 'reserved' / 'admitted' / 'account'. An 'active'-only
    // default dropped them from every automatic run, silently — no error, no
    // unresolved count, no generation-run row.
    const svc = EMPTY();
    await resolveApplicablePeople(svc as never, {
      audience: 'student',
      institution_ids: null,
      staff_role_keys: null,
      lifecycle_statuses: null,
    });

    const statuses = lifecycleFilterOf(svc);
    expect(statuses).toEqual([...DEFAULT_LIFECYCLE_STATUSES]);
    expect(statuses).toEqual(
      expect.arrayContaining(['active', 'admitted', 'account', 'reserved'])
    );
  });

  it('never bills enquiry-stage or departed learners by default', async () => {
    // An overdue transport bill locks the learner out of the portal, so the
    // default must not reach people who never enrolled or have left.
    const svc = EMPTY();
    await resolveApplicablePeople(svc as never, {
      audience: 'student',
      institution_ids: null,
      staff_role_keys: null,
      lifecycle_statuses: null,
    });

    const statuses = lifecycleFilterOf(svc) as string[];
    for (const excluded of ['enquiry', 'enquiry_submitted', 'rejected', 'graduated', 'inactive']) {
      expect(statuses).not.toContain(excluded);
    }
  });

  it('an explicit lifecycle_statuses list still overrides the default', async () => {
    const svc = EMPTY();
    await resolveApplicablePeople(svc as never, {
      audience: 'student',
      institution_ids: null,
      staff_role_keys: null,
      lifecycle_statuses: ['active'],
    });

    expect(lifecycleFilterOf(svc)).toEqual(['active']);
  });

  it('reads the bus-pass-applicant view, never learners_profiles directly', async () => {
    // Querying the table would bill anyone flagged bus_required by the ADMISSION
    // FORM as well -- 267 learners who never applied for transport.
    const svc = EMPTY();
    await resolveApplicablePeople(svc as never, {
      audience: 'student',
      institution_ids: null,
      staff_role_keys: null,
      lifecycle_statuses: null,
    });

    const tables = svc.calls.map((c) => c.table);
    expect(tables).toContain(LEARNER_SOURCE);
    expect(tables).not.toContain('learners_profiles');
  });
});
