'use client';

import { use, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Play, Loader2, Users, CheckCircle2, AlertTriangle, Clock, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  fetchFeeStructure, fetchCoverage, fetchMasters, runGeneration,
  type GeneratePreview, type CoverageResult, type MasterOption,
} from '../fee-api';
import { feeStatusBadge, audienceBadge, inr } from '../columns';

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const COVERAGE_STYLE: Record<string, string> = {
  billed: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  unbilled: 'bg-gray-100 text-gray-700',
  staff_deferred: 'bg-purple-100 text-purple-800',
};

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

  // Resolve condition dimension names for display.
  const [cond, setCond] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!fee) return;
    let alive = true;
    (async () => {
      const labels: Record<string, string> = {};
      const find = (opts: MasterOption[], v: string | null) => (v ? opts.find((o) => o.id === v)?.name ?? v : '');
      try {
        if (fee.institution_id) labels.institution = find(await fetchMasters('institutions'), fee.institution_id);
        if (fee.audience === 'student') {
          if (fee.degree_id) labels.degree = find(await fetchMasters('degrees', { institution_id: fee.institution_id ?? undefined }), fee.degree_id);
          if (fee.department_id) labels.department = find(await fetchMasters('departments', { institution_id: fee.institution_id ?? undefined, degree_id: fee.degree_id ?? undefined }), fee.department_id);
          if (fee.programme_id) labels.programme = find(await fetchMasters('programmes', { institution_id: fee.institution_id ?? undefined, degree_id: fee.degree_id ?? undefined, department_id: fee.department_id ?? undefined }), fee.programme_id);
          if (fee.semester_id) labels.semester = find(await fetchMasters('semesters', { program_id: fee.programme_id ?? undefined }), fee.semester_id);
          if (fee.quota_id) labels.quota = find(await fetchMasters('quotas'), fee.quota_id);
        }
      } catch { /* tolerate */ }
      if (alive) setCond(labels);
    })();
    return () => { alive = false; };
  }, [fee]);

  // Coverage
  const { data: coverage, isLoading: coverageLoading, refetch: refetchCoverage } = useQuery<CoverageResult>({
    queryKey: ['fee-coverage', id],
    queryFn: () => fetchCoverage(id),
    enabled: !!fee,
  });

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
      const res = (await runGeneration(id, 'generate')) as { learnerBilled: number; staffDeferred: number; skipped: number };
      toast.success(`Generated ${res.learnerBilled} learner bill(s); ${res.staffDeferred} staff deferred; ${res.skipped} skipped`);
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
          <Field label="Total Fee" value={inr(fee.total_amount)} />
          <Field label="Terms" value={`${fee.split_count}`} />
          <Field label="Notes" value={fee.notes || '—'} />
        </div>
      </SectionCard>

      <SectionCard title="Conditions">
        <p className="mb-3 text-xs text-gray-500">Who this fee applies to (blank = any)</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Institution" value={cond.institution || 'Any'} />
          {isStudent ? (
            <>
              <Field label="Degree" value={cond.degree || 'Any'} />
              <Field label="Department" value={cond.department || 'Any'} />
              <Field label="Programme" value={cond.programme || 'Any'} />
              <Field label="Semester" value={cond.semester || 'Any'} />
              <Field label="Quota" value={cond.quota || 'Any'} />
            </>
          ) : (
            <Field
              label="Staff roles"
              value={fee.staff_role_keys && fee.staff_role_keys.length ? fee.staff_role_keys.join(', ') : 'All roles'}
            />
          )}
        </div>
      </SectionCard>

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
                    <Stat label="Fee / person" value={inr(preview.totalPerPerson)} />
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    {preview.learnerCount} learner(s), {preview.staffCount} staff · {preview.termsPerPerson} term(s) each.
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

      {/* Coverage */}
      <SectionCard title="Coverage">
        <p className="mb-3 text-xs text-gray-500">Who is billed for this transport year</p>
        {coverageLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
        ) : coverage ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Applicable" value={coverage.summary.applicable} icon={<Users className="h-4 w-4 text-blue-500" />} />
              <Stat label="Billed" value={coverage.summary.billed} icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} />
              <Stat label="Partial" value={coverage.summary.partial} icon={<Clock className="h-4 w-4 text-amber-500" />} />
              <Stat label="Unbilled" value={coverage.summary.unbilled} icon={<AlertTriangle className="h-4 w-4 text-gray-400" />} />
              <Stat label="Staff deferred" value={coverage.summary.staffDeferred} icon={<Clock className="h-4 w-4 text-purple-500" />} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Terms billed</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.people.map((p) => (
                    <tr key={p.person_id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium text-gray-900">{p.name}</td>
                      <td className="py-2 pr-4 text-gray-500">{p.code || '—'}</td>
                      <td className="py-2 pr-4 capitalize text-gray-600">{p.person_type}</td>
                      <td className="py-2 pr-4 text-gray-600">{p.terms_billed}/{p.total_terms}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${COVERAGE_STYLE[p.status]}`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {coverage.people.length === 0 && (
                    <tr><td colSpan={5} className="py-4 text-center text-gray-400">No one currently matches this structure’s conditions.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Coverage unavailable.</p>
        )}
      </SectionCard>

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
