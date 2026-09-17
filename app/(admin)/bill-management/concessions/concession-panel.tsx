'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { inr } from '../columns';
import { getConcessionColumns, STATUS_LABEL } from './concession-columns';
import { RuleDialog } from './rule-dialog';
import {
  applyConcessionTo, fetchConcessions, updateRule,
  type ConcessionKind, type ConcessionRow, type ConcessionRule,
} from './concessions-api';

const KIND_LABEL: Record<ConcessionKind, string> = {
  final_year: 'Final Year 50%',
  scheme_75: '7.5% Scheme',
};

export function ConcessionPanel({ year }: { year: string }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canApply = can(TMS_PERMISSIONS.FEES_CONCESSION_APPLY);
  const [kind, setKind] = useState<ConcessionKind>('final_year');
  const [confirmRows, setConfirmRows] = useState<ConcessionRow[] | null>(null);
  const [resetSel, setResetSel] = useState<(() => void) | null>(null);
  const [applying, setApplying] = useState(false);
  const [ruleDialog, setRuleDialog] = useState<{ rule: ConcessionRule | null } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fee-concessions', year, kind],
    queryFn: () => fetchConcessions(year, kind),
    enabled: !!year,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo(() => getConcessionColumns(), []);
  const institutionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.institutionName) s.add(r.institutionName);
    return [...s].sort().map((n) => ({ label: n, value: n }));
  }, [rows]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['fee-concessions', year] });
    void qc.invalidateQueries({ queryKey: ['bill-management', year] });
    void qc.invalidateQueries({ queryKey: ['bill-management-unbilled', year] });
  };

  async function apply() {
    if (!confirmRows) return;
    setApplying(true);
    try {
      const results = await applyConcessionTo(year, kind, confirmRows.map((r) => r.personId));
      const done = results.filter((r) => ['repriced', 'ledger_aligned', 'override_only', 'unchanged'].includes(r.outcome)).length;
      const review = results.filter((r) => r.outcome === 'review');
      const failed = results.filter((r) => r.outcome === 'error');
      if (done) toast.success(`Concession applied to ${done} learner(s).`);
      if (review.length) toast(`${review.length} need accounts review: ${review.map((r) => r.name).join(', ')}`, { icon: '⚠️' });
      if (failed.length) toast.error(`${failed.length} failed: ${failed.map((r) => `${r.name} (${r.message})`).join('; ')}`);
      setConfirmRows(null);
      resetSel?.();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not apply the concession');
    } finally {
      setApplying(false);
    }
  }

  const reduction = (confirmRows ?? []).reduce(
    (s, r) => s + Math.max(0, (r.billAmount ?? r.fullTotal ?? 0) - (r.targetTotal ?? 0)), 0);
  const scheme = kind === 'scheme_75' ? data?.rules.find((r) => r.is_active) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
        {(Object.keys(KIND_LABEL) as ConcessionKind[]).map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); setConfirmRows(null); setResetSel(null); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              kind === k ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['needs_fix', 'applied', 'review', 'unresolved'] as const).map((s) => (
          <div key={s} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="text-xs text-gray-500 dark:text-gray-400">{STATUS_LABEL[s]}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isLoading ? '…' : data?.counts[s] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {kind === 'final_year' ? 'Final-year cohort rules' : '7.5% scheme amount'}
          </h3>
          {canApply && (kind === 'final_year' || !scheme) && (
            <button type="button" onClick={() => setRuleDialog({ rule: null })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              <Plus className="h-4 w-4" /> {kind === 'final_year' ? 'Add cohort rule' : 'Set amount'}
            </button>
          )}
        </div>
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {(data?.rules ?? []).length === 0 && (
            <li className="py-2 text-sm text-gray-500 dark:text-gray-400">No rules for this year yet.</li>
          )}
          {(data?.rules ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <span className={`font-medium ${r.is_active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 line-through'}`}>{r.label}</span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">
                  {r.kind === 'final_year' ? `admission ${r.admission_year} · pays ${r.percent}%` : `${inr(r.annual_amount ?? 0)} per year`}
                </span>
              </div>
              {canApply && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRuleDialog({ rule: r })}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button type="button"
                    onClick={async () => {
                      try {
                        await updateRule(r.id, { ...r, is_active: !r.is_active });
                        refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Could not update the rule');
                      }
                    }}
                    className="text-xs font-medium text-gray-600 hover:underline dark:text-gray-300">
                    {r.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isError ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900">
          Couldn&apos;t load concessions. Please try again.
        </div>
      ) : (
        <DataTable
          key={kind}
          columns={columns}
          data={rows}
          entityName="learners"
          isLoading={isLoading}
          getRowId={(r) => r.personId}
          enableRowSelection={canApply}
          canSelectRow={(r) => r.status === 'needs_fix'}
          searchPlaceholder="Search name or roll number..."
          filters={[
            {
              columnId: 'status',
              title: 'Status',
              options: (['needs_fix', 'applied', 'review', 'unresolved'] as const).map((s) => ({ label: STATUS_LABEL[s], value: s })),
            },
            ...(institutionOptions.length ? [{ columnId: 'institution', title: 'College', options: institutionOptions }] : []),
          ]}
          toolbarActions={({ selectedRows, resetSelection }) =>
            canApply ? (
              <button type="button"
                disabled={selectedRows.length === 0}
                onClick={() => { setConfirmRows(selectedRows); setResetSel(() => resetSelection); }}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                Apply concession{selectedRows.length ? ` (${selectedRows.length})` : ''}
              </button>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={confirmRows !== null}
        onOpenChange={(o) => { if (!o) setConfirmRows(null); }}
        title={`Apply ${KIND_LABEL[kind]} to ${confirmRows?.length ?? 0} learner(s)?`}
        description={
          <>
            Fee exceptions are saved and unpaid bills are corrected. Total reduction: {inr(reduction)}.
            Learners who have already paid a different amount are skipped for accounts review.
          </>
        }
        confirmLabel="Apply"
        loading={applying}
        onConfirm={apply}
      />

      <RuleDialog
        open={ruleDialog !== null}
        year={year}
        kind={kind}
        rule={ruleDialog?.rule ?? null}
        onClose={() => setRuleDialog(null)}
        onSaved={refresh}
      />
    </div>
  );
}
