'use client';

import { use, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Play, Loader2, Users, CheckCircle2, AlertTriangle, Clock, FileText, Building2, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { DataTable } from '@/components/ui/data-table';
import { getCoverageColumns } from './coverage-columns';
import { exportCoverage } from './coverage-export';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  fetchFeeStructure, fetchCoverage, fetchMasters, runGeneration,
  type GeneratePreview, type CoverageResult,
} from '../fee-api';
import { feeStatusBadge, audienceBadge, inr } from '../columns';

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function FeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: fee, isLoading, isError } = useQuery({
    queryKey: ['fee-structure', id],
    queryFn: () => fetchFeeStructure(id),
  });

  const [canManage, setCanManage] = useState(false);
  const [canGenerate, setCanGenerate] = useState(false);
  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) {
      const role = JSON.parse(u).role as string;
      setCanManage(['super_admin', 'transport_manager', 'transport_head', 'finance_admin'].includes(role));
      setCanGenerate(['super_admin', 'transport_head', 'finance_admin'].includes(role));
    }
  }, []);

  // Resolve institution names for display (institution_ids is the only condition).
  const [institutionNames, setInstitutionNames] = useState<string[]>([]);
  useEffect(() => {
    if (!fee) return;
    let alive = true;
    (async () => {
      let names: string[] = [];
      try {
        const ids = fee.institution_ids ?? [];
        if (ids.length) {
          const opts = await fetchMasters('institutions');
          const byId = new Map(opts.map((o) => [o.id, o.name]));
          names = ids.map((id) => byId.get(id) ?? id);
        }
      } catch { /* tolerate */ }
      if (alive) setInstitutionNames(names);
    })();
    return () => { alive = false; };
  }, [fee]);

  // Coverage
  const { data: coverage, isLoading: coverageLoading, refetch: refetchCoverage } = useQuery<CoverageResult>({
    queryKey: ['fee-coverage', id],
    queryFn: () => fetchCoverage(id),
    enabled: !!fee,
  });
  const coverageColumns = useMemo(() => getCoverageColumns(), []);
  // Institution filter options derived from the rows actually present.
  const institutionFilterOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of coverage?.people ?? []) if (p.institution_name) names.add(p.institution_name);
    return Array.from(names).sort().map((n) => ({ label: n, value: n }));
  }, [coverage]);

  // Generation
  const [preview, setPreview] = useState<GeneratePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmGen, setConfirmGen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const data = (await runGeneration(id, 'dry_run')) as GeneratePreview;
      setPreview(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const doGenerate = async () => {
    setGenerating(true);
    try {
      const res = (await runGeneration(id, 'generate')) as { learnerBilled: number; staffDeferred: number; skipped: number; unresolved: number };
      toast.success(`Generated ${res.learnerBilled} learner bill(s); ${res.staffDeferred} staff deferred; ${res.skipped} skipped${res.unresolved ? `; ${res.unresolved} unresolved` : ''}`);
      setConfirmGen(false);
      setPreview(null);
      await refetchCoverage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const crumbs = (name: string) => [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Fees', href: '/fees' },
    { label: name },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/fees" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }
  if (isError || !fee) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/fees" title="Fee structure not found" />
        <Link href="/fees" className="text-green-600 hover:underline">Back to fees</Link>
      </div>
    );
  }

  const isStudent = fee.audience === 'student';

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(fee.name)}
        backHref="/fees"
        title={fee.name}
        subtitle="Transport fee structure"
        actions={
          canManage ? (
            <Link href={`/fees/${fee.id}/edit`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : null
        }
      />

      <SectionCard title="Overview">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Transport Year" value={fee.transport_year_name ?? '—'} />
          <Field label="Applies to" value={audienceBadge(fee.audience)} />
          <Field label="Status" value={feeStatusBadge(fee.status)} />
          {fee.fee_mode === 'tiered' ? (
            <>
              <Field
                label="Fee mode"
                value={
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                    Tiered by year of study
                  </span>
                }
              />
              <Field label="Year bands" value={`${(fee.bands ?? []).length}`} />
            </>
          ) : (
            <>
              <Field label="Total Fee" value={inr(fee.total_amount)} />
              <Field label="Terms" value={`${fee.split_count}`} />
            </>
          )}
          <Field label="Notes" value={fee.notes || '—'} />
        </div>
      </SectionCard>

      <SectionCard title="Conditions">
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Institutions</p>
              {institutionNames.length > 0 && (
                <span className="text-xs text-gray-400">{institutionNames.length} selected</span>
              )}
            </div>
            {institutionNames.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {institutionNames.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                    {n}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm font-medium text-gray-500">
                Any institution <span className="text-gray-400">— all bus-required {isStudent ? 'learners' : 'staff'} are included</span>
              </p>
            )}
          </div>

          {isStudent && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Learner statuses billed</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(fee.lifecycle_statuses && fee.lifecycle_statuses.length ? fee.lifecycle_statuses : ['active']).map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium capitalize text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
                  >
                    {s.replace(/[-_]/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!isStudent && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Staff roles</p>
              {fee.staff_role_keys && fee.staff_role_keys.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {fee.staff_role_keys.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium capitalize text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300"
                    >
                      {r.replace(/[-_]/g, ' ')}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm font-medium text-gray-500">All roles</p>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {fee.fee_mode === 'tiered' ? (
        <SectionCard title="Year bands">
          <div className="space-y-5">
            {(fee.bands ?? []).map((b, bi) => (
              <div key={bi} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {b.label || `Years ${b.study_years.join(', ')}`}
                  </span>
                  <span className="text-xs text-gray-500">
                    Year{b.study_years.length === 1 ? '' : 's'} {b.study_years.join(', ')} · {inr(b.total_amount)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                        <th className="py-2 pr-4">#</th>
                        <th className="py-2 pr-4">Term</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Due date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(b.terms ?? []).map((t) => (
                        <tr key={t.term_no} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-4 text-gray-500">{t.term_no}</td>
                          <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">{t.term_label || `Term ${t.term_no}`}</td>
                          <td className="py-2 pr-4">{inr(t.amount)}</td>
                          <td className="py-2 pr-4">{fmtDate(t.due_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Terms">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Term</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Due date</th>
                </tr>
              </thead>
              <tbody>
                {(fee.terms ?? []).map((t) => (
                  <tr key={t.term_no} className="border-b border-gray-100">
                    <td className="py-2 pr-4 text-gray-500">{t.term_no}</td>
                    <td className="py-2 pr-4 font-medium text-gray-900">{t.term_label || `Term ${t.term_no}`}</td>
                    <td className="py-2 pr-4">{inr(t.amount)}</td>
                    <td className="py-2 pr-4">{fmtDate(t.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Generate panel */}
      {canGenerate && (
        <SectionCard title="Generate bills">
          <p className="mb-3 text-xs text-gray-500">Manually create transport bills for everyone matching the conditions</p>
          {fee.status !== 'active' ? (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Set this structure to <strong>Active</strong> before generating bills.
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={runPreview}
                disabled={previewing}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Run preview (dry run)
              </button>

              {preview && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Applicable" value={preview.applicable} />
                    <Stat label="New bills to create" value={preview.toGeneratePairs} />
                    <Stat label="Already billed (skip)" value={preview.alreadyBilledPairs} />
                    {preview.feeMode === 'tiered' ? (
                      <Stat label="Unresolved" value={preview.unresolved} />
                    ) : (
                      <Stat label="Fee / person" value={inr(preview.totalPerPerson ?? 0)} />
                    )}
                  </div>
                  {preview.feeMode === 'tiered' && preview.bands && (
                    <div className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3">
                      {preview.bands.map((b, i) => (
                        <p key={i} className="text-xs text-gray-600">
                          <span className="font-medium text-gray-800">{b.label || `Years ${b.study_years.join(', ')}`}</span>
                          {' — '}{b.applicable} learner(s) · {inr(b.totalPerPerson)} · {b.termsPerPerson} term(s)
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-gray-500">
                    {preview.learnerCount} learner(s), {preview.staffCount} staff
                    {preview.feeMode === 'flat' && preview.termsPerPerson != null && ` · ${preview.termsPerPerson} term(s) each`}.
                    {preview.unresolved > 0 && ` ⚠️ ${preview.unresolved} learner(s) have no admission year / no matching band — skipped.`}
                    {preview.staffDeferred && ' Staff are recorded for coverage only (real staff billing is phase 2).'}
                    {preview.conflictCount > 0 && ` ⚠️ ${preview.conflictCount} person(s) already billed by another structure for this year.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirmGen(true)}
                    disabled={preview.toGeneratePairs === 0}
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" /> Generate {preview.toGeneratePairs} bill(s)
                  </button>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Coverage — aggregate summary in the card, per-person breakdown in the table below */}
      <SectionCard title="Coverage">
        <p className="mb-4 text-xs text-gray-500">Who is billed for this transport year</p>
        {coverageLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : coverage ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Applicable" value={coverage.summary.applicable} icon={<Users className="h-4 w-4 text-blue-500" />} />
            <Stat label="Billed" value={coverage.summary.billed} icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} />
            <Stat label="Partial" value={coverage.summary.partial} icon={<Clock className="h-4 w-4 text-amber-500" />} />
            <Stat label="Unbilled" value={coverage.summary.unbilled} icon={<AlertTriangle className="h-4 w-4 text-gray-400" />} />
            <Stat label="Staff deferred" value={coverage.summary.staffDeferred} icon={<Clock className="h-4 w-4 text-purple-500" />} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">Coverage unavailable.</p>
        )}
      </SectionCard>

      {coverage &&
        (coverage.people.length > 0 ? (
          <DataTable
            columns={coverageColumns}
            data={coverage.people}
            entityName="people"
            getRowId={(p) => p.person_id}
            enableRowSelection
            searchPlaceholder="Search name, code or institution..."
            filters={[
              ...(institutionFilterOptions.length
                ? [{ columnId: 'institution', title: 'Institution', options: institutionFilterOptions }]
                : []),
              {
                columnId: 'person_type',
                title: 'Type',
                options: [
                  { label: 'Learner', value: 'learner' },
                  { label: 'Staff', value: 'staff' },
                ],
              },
              {
                columnId: 'status',
                title: 'Status',
                options: [
                  { label: 'Billed', value: 'billed' },
                  { label: 'Partial', value: 'partial' },
                  { label: 'Unbilled', value: 'unbilled' },
                  { label: 'Staff deferred', value: 'staff_deferred' },
                ],
              },
            ]}
            toolbarActions={({ selectedRows }) => (
              <button
                type="button"
                onClick={() => exportCoverage(selectedRows.length ? selectedRows : coverage.people, fee.name)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Download className="h-4 w-4" />
                Export{selectedRows.length ? ` (${selectedRows.length})` : ''}
              </button>
            )}
          />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            No one currently matches this structure’s conditions.
          </div>
        ))}

      <ConfirmDialog
        open={confirmGen}
        onOpenChange={(open) => { if (!open) setConfirmGen(false); }}
        title="Generate transport bills?"
        description={
          preview
            ? `This creates ${preview.toGeneratePairs} bill(s) for ${preview.learnerCount} learner(s)${preview.staffCount ? ` and records ${preview.staffCount} staff for coverage` : ''}. Already-billed people are skipped. This writes to the billing system.`
            : ''
        }
        confirmLabel="Generate"
        onConfirm={doGenerate}
        loading={generating}
      />
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon?: ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon}{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}
