'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Plus, Trash2, Wand2, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchMasters, fetchTransportYearOptions, type MasterOption } from './fee-api';
import type { FeeAudience, FeeStatus, FeeMode } from '@/lib/fees/types';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';
import { SelectMenuMulti } from '@/components/ui/select-menu-multi';
import { inr } from './columns';

interface TermRow { term_label: string; amount: string; due_date: string }
interface BandRow { key: string; label: string; study_years: number[]; total_amount: string; terms: TermRow[] }

export interface FeeFormInitial {
  name: string;
  transport_year_id: string;
  audience: FeeAudience;
  status: FeeStatus;
  fee_mode: FeeMode;
  institution_ids: string[];
  staff_role_keys: string[];
  lifecycle_statuses: string[];
  total_amount: string;
  notes: string;
  terms: TermRow[];
  bands: Array<{ label: string; study_years: number[]; total_amount: string; terms: TermRow[] }>;
}

interface Props {
  mode: 'create' | 'edit';
  feeId?: string;
  initial?: Partial<FeeFormInitial>;
}

const blankTerm = (n: number): TermRow => ({ term_label: `Term ${n}`, amount: '', due_date: '' });

// Static enum options for the SelectMenu pickers (matches the routes/vehicles forms).
const AUDIENCE_OPTIONS: SelectMenuOption[] = [
  { value: 'student', label: 'Learners (students)' },
  { value: 'staff', label: 'Staff' },
];
const STATUS_OPTIONS: SelectMenuOption[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];
const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Year ${n}` }));
// Learner lifecycle states that can be billed. Empty selection = ['active'].
const LIFECYCLE_OPTIONS = [
  { value: 'active', label: 'Active (enrolled)' },
  { value: 'reserved', label: 'Reserved (incoming)' },
  { value: 'enquiry_submitted', label: 'Enquiry submitted' },
  { value: 'account', label: 'Account created' },
];

const equalSplit = (total: number, terms: TermRow[]): TermRow[] => {
  if (!total || terms.length === 0) return terms;
  const each = Math.floor((total / terms.length) * 100) / 100;
  const remainder = Math.round((total - each * terms.length) * 100) / 100;
  return terms.map((t, i) => ({ ...t, amount: String(i === terms.length - 1 ? each + remainder : each) }));
};

// Reusable term editor (used by the flat section and by each year band).
function TermList({
  terms, total, disabled, onChange, error,
}: { terms: TermRow[]; total: number; disabled: boolean; onChange: (t: TermRow[]) => void; error?: string }) {
  const termsSum = terms.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const sumMatches = Math.abs(termsSum - total) < 0.01;
  const setTerm = (i: number, k: keyof TermRow, v: string) =>
    onChange(terms.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2">
        <button type="button" onClick={() => onChange(equalSplit(total, terms))} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50" disabled={disabled || !total}>
          <Wand2 className="h-3.5 w-3.5" /> Split equally
        </button>
        <button type="button" onClick={() => onChange([...terms, blankTerm(terms.length + 1)])} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50" disabled={disabled}>
          <Plus className="h-3.5 w-3.5" /> Add term
        </button>
      </div>
      <div className="space-y-3">
        {terms.map((t, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_140px_180px_40px] sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Term {i + 1} label</label>
              <input value={t.term_label} onChange={(e) => setTerm(i, 'term_label', e.target.value)} className="input" placeholder={`Term ${i + 1}`} disabled={disabled} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Amount</label>
              <input type="number" min="0" step="0.01" value={t.amount} onChange={(e) => setTerm(i, 'amount', e.target.value)} className="input" placeholder="0.00" disabled={disabled} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Due date</label>
              <input type="date" value={t.due_date} onChange={(e) => setTerm(i, 'due_date', e.target.value)} className="input" disabled={disabled} />
            </div>
            <button type="button" onClick={() => onChange(terms.length > 1 ? terms.filter((_, idx) => idx !== i) : terms)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={disabled || terms.length <= 1} aria-label="Remove term">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className={`mt-3 text-sm ${sumMatches ? 'text-green-600' : 'text-red-500'}`}>
        Terms total: <span className="font-semibold">{inr(termsSum)}</span> / {inr(total)}
        {!sumMatches && ' — must match the total'}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function FeeStructureForm({ mode, feeId, initial }: Props) {
  const router = useRouter();
  const bandKey = useRef(0);
  const newBand = (years: number[] = []): BandRow => ({
    key: `b${bandKey.current++}`, label: '', study_years: years, total_amount: '', terms: [blankTerm(1)],
  });

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    transport_year_id: initial?.transport_year_id ?? '',
    audience: (initial?.audience ?? 'student') as FeeAudience,
    status: (initial?.status ?? 'draft') as FeeStatus,
    fee_mode: (initial?.fee_mode ?? 'flat') as FeeMode,
    institution_ids: initial?.institution_ids ?? ([] as string[]),
    staff_role_keys: initial?.staff_role_keys ?? ([] as string[]),
    lifecycle_statuses: initial?.lifecycle_statuses ?? ([] as string[]),
    total_amount: initial?.total_amount ?? '',
    notes: initial?.notes ?? '',
  });
  const [terms, setTerms] = useState<TermRow[]>(
    initial?.terms && initial.terms.length ? initial.terms : [blankTerm(1)]
  );
  const [bands, setBands] = useState<BandRow[]>(
    initial?.bands && initial.bands.length
      ? initial.bands.map((b) => ({ key: `b${bandKey.current++}`, label: b.label, study_years: b.study_years, total_amount: b.total_amount, terms: b.terms.length ? b.terms : [blankTerm(1)] }))
      : [newBand([1]), newBand([2, 3])]
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [transportYears, setTransportYears] = useState<MasterOption[]>([]);
  const [institutions, setInstitutions] = useState<MasterOption[]>([]);
  const [staffRoles, setStaffRoles] = useState<MasterOption[]>([]);

  const set = (k: keyof typeof form, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  useEffect(() => {
    fetchTransportYearOptions().then(setTransportYears).catch(() => {});
    fetchMasters('institutions').then(setInstitutions).catch(() => {});
    fetchMasters('staff-roles').then(setStaffRoles).catch(() => {});
  }, []);

  const isStudent = form.audience === 'student';
  const isTiered = isStudent && form.fee_mode === 'tiered';

  const totalNum = Number(form.total_amount) || 0;

  const updateBand = (i: number, patch: Partial<BandRow>) =>
    setBands((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.transport_year_id) next.transport_year_id = 'Transport year is required';

    if (isTiered) {
      const seen = new Set<number>();
      if (bands.length === 0) next.bands = 'Add at least one year band';
      bands.forEach((b, i) => {
        if (!b.study_years.length) next[`band${i}`] = 'Pick at least one year of study';
        for (const y of b.study_years) {
          if (seen.has(y)) next.bands = `Year ${y} is in more than one band — each year can belong to only one band`;
          seen.add(y);
        }
        const bt = Number(b.total_amount) || 0;
        if (!b.total_amount || bt <= 0) next[`band${i}`] = 'Band total must be greater than 0';
        else if (b.terms.some((t) => !t.amount || Number(t.amount) < 0)) next[`band${i}`] = 'Every term needs a valid amount';
        else if (b.terms.some((t) => !t.due_date)) next[`band${i}`] = 'Every term needs a due date';
        else if (Math.abs(b.terms.reduce((s, t) => s + (Number(t.amount) || 0), 0) - bt) > 0.01) next[`band${i}`] = 'Term amounts must equal the band total';
      });
    } else {
      if (!form.total_amount || totalNum <= 0) next.total_amount = 'Total fee must be greater than 0';
      const termsSum = terms.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      if (terms.some((t) => !t.amount || Number(t.amount) < 0)) next.terms = 'Every term needs a valid amount';
      else if (terms.some((t) => !t.due_date)) next.terms = 'Every term needs a due date';
      else if (Math.abs(termsSum - totalNum) >= 0.01) next.terms = `Term amounts (${inr(termsSum)}) must equal the total (${inr(totalNum)})`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const toggleRole = (key: string) =>
    setForm((f) => ({
      ...f,
      staff_role_keys: f.staff_role_keys.includes(key)
        ? f.staff_role_keys.filter((r) => r !== key)
        : [...f.staff_role_keys, key],
    }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSaving(true);
    try {
      const base: Record<string, unknown> = {
        name: form.name.trim(),
        transport_year_id: form.transport_year_id,
        audience: form.audience,
        status: form.status,
        fee_mode: isTiered ? 'tiered' : 'flat',
        institution_ids: form.institution_ids.length ? form.institution_ids : null,
        staff_role_keys: !isStudent && form.staff_role_keys.length ? form.staff_role_keys : null,
        lifecycle_statuses: isStudent && form.lifecycle_statuses.length ? form.lifecycle_statuses : null,
        notes: form.notes.trim() || null,
      };

      const payload: Record<string, unknown> = isTiered
        ? {
            ...base,
            bands: bands.map((b, bi) => ({
              band_order: bi + 1,
              label: b.label.trim() || null,
              study_years: [...b.study_years].sort((x, y) => x - y),
              total_amount: Number(b.total_amount),
              terms: b.terms.map((t, i) => ({
                term_no: i + 1,
                term_label: t.term_label.trim() || `Term ${i + 1}`,
                amount: Number(t.amount),
                due_date: t.due_date,
              })),
            })),
          }
        : {
            ...base,
            total_amount: totalNum,
            split_count: terms.length,
            terms: terms.map((t, i) => ({
              term_no: i + 1,
              term_label: t.term_label.trim() || `Term ${i + 1}`,
              amount: Number(t.amount),
              due_date: t.due_date,
            })),
          };

      const res = await fetch('/api/admin/fees', {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(mode === 'create' ? payload : { ...payload, id: feeId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      toast.success(mode === 'create' ? 'Fee structure created' : 'Fee structure updated');
      router.push(mode === 'create' ? '/fees' : `/fees/${feeId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelHref = mode === 'create' ? '/fees' : `/fees/${feeId}`;
  const selectCls = (err?: string) => `input ${err ? 'border-red-500' : ''}`;
  const modeBtn = (active: boolean) =>
    `flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'border-green-300 bg-green-50 text-green-800' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
    }`;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ── Basics ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Basics</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">Name *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={selectCls(errors.name)}
              placeholder="e.g. Transport Fee 2026-2027 (Arts Self)"
              disabled={saving}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Transport Year *</label>
            <SelectMenu
              value={form.transport_year_id}
              onValueChange={(v) => set('transport_year_id', v)}
              options={transportYears.map((y) => ({ value: y.id, label: y.name }))}
              placeholder="Select year…"
              ariaLabel="Transport year"
              disabled={saving}
              className={errors.transport_year_id ? 'border-red-500!' : ''}
            />
            {errors.transport_year_id && <p className="mt-1 text-xs text-red-500">{errors.transport_year_id}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Applies to *</label>
            <SelectMenu
              value={form.audience}
              onValueChange={(v) => set('audience', v as FeeAudience)}
              options={AUDIENCE_OPTIONS}
              ariaLabel="Applies to"
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-500">
              {isStudent ? 'Bills go under the “Transport Fee” category.' : 'Staff are recorded for coverage; real staff billing is phase 2.'}
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
            <SelectMenu
              value={form.status}
              onValueChange={(v) => set('status', v as FeeStatus)}
              options={STATUS_OPTIONS}
              ariaLabel="Status"
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-500">Bills can only be generated from an Active structure.</p>
          </div>
        </div>
      </div>

      {/* ── Conditions ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-1 text-sm font-semibold text-gray-900">Conditions</h3>
        <p className="mb-4 text-xs text-gray-500">Leave institutions empty to mean “any”. Only bus-required people in the chosen institution(s) — and matching the statuses below — are billed.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Institutions</label>
            <SelectMenuMulti
              value={form.institution_ids}
              onValueChange={(v) => set('institution_ids', v)}
              options={institutions.map((o) => ({ value: o.id, label: o.name }))}
              placeholder="Any institution"
              ariaLabel="Institutions"
              disabled={saving}
            />
            {form.institution_ids.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">{form.institution_ids.length} institution(s) selected</p>
            )}
          </div>
          {isStudent && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Learner statuses to bill</label>
              <SelectMenuMulti
                value={form.lifecycle_statuses}
                onValueChange={(v) => set('lifecycle_statuses', v)}
                options={LIFECYCLE_OPTIONS}
                placeholder="Active only (default)"
                ariaLabel="Learner lifecycle statuses"
                disabled={saving}
              />
              <p className="mt-1 text-xs text-gray-500">
                Empty = <strong>Active</strong> only. Add <strong>Reserved</strong> to bill incoming learners not yet enrolled.
              </p>
            </div>
          )}
        </div>
        {!isStudent && (
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Staff roles (leave none for all roles)</label>
            <div className="flex flex-wrap gap-2">
              {staffRoles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRole(r.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    form.staff_role_keys.includes(r.id)
                      ? 'border-purple-300 bg-purple-100 text-purple-800'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  disabled={saving}
                >
                  {r.name}
                </button>
              ))}
              {staffRoles.length === 0 && <span className="text-xs text-gray-400">No staff roles found</span>}
            </div>
          </div>
        )}

        {/* Fee-by-year toggle (learners only) */}
        {isStudent && (
          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">Fee by year of study</label>
            <div className="flex max-w-md gap-2">
              <button type="button" className={modeBtn(form.fee_mode === 'flat')} onClick={() => set('fee_mode', 'flat')} disabled={saving}>
                Same fee for all years
              </button>
              <button type="button" className={modeBtn(form.fee_mode === 'tiered')} onClick={() => set('fee_mode', 'tiered')} disabled={saving}>
                Different fee by year of study
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Tiered uses each learner’s year of study (derived from admission year). Learners with no admission year are reported as unresolved at generation.
            </p>
          </div>
        )}
      </div>

      {/* ── Fee & terms (flat) ── */}
      {!isTiered && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Fee &amp; terms</h3>
          <div className="mb-4 max-w-xs">
            <label className="mb-2 block text-sm font-medium text-gray-700">Total fee *</label>
            <input
              type="number" min="0" step="0.01"
              value={form.total_amount}
              onChange={(e) => set('total_amount', e.target.value)}
              className={selectCls(errors.total_amount)}
              placeholder="0.00"
              disabled={saving}
            />
            {errors.total_amount && <p className="mt-1 text-xs text-red-500">{errors.total_amount}</p>}
          </div>
          <TermList terms={terms} total={totalNum} disabled={saving} onChange={setTerms} error={errors.terms} />
        </div>
      )}

      {/* ── Year bands (tiered) ── */}
      {isTiered && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Layers className="h-4 w-4 text-green-600" /> Year bands
            </h3>
            <button type="button" onClick={() => setBands((bs) => [...bs, newBand([])])} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50" disabled={saving}>
              <Plus className="h-3.5 w-3.5" /> Add year band
            </button>
          </div>
          <p className="mb-4 text-xs text-gray-500">Each band sets the fee for one or more years of study. A year can belong to only one band.</p>
          {errors.bands && <p className="mb-3 text-xs text-red-500">{errors.bands}</p>}

          <div className="space-y-4">
            {bands.map((b, i) => (
              <div key={b.key} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Band {i + 1}</span>
                  <button type="button" onClick={() => setBands((bs) => (bs.length > 1 ? bs.filter((_, idx) => idx !== i) : bs))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={saving || bands.length <= 1} aria-label="Remove band">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700">Years of study *</label>
                    <SelectMenuMulti
                      value={b.study_years.map(String)}
                      onValueChange={(v) => updateBand(i, { study_years: v.map(Number).sort((x, y) => x - y) })}
                      options={YEAR_OPTIONS}
                      placeholder="Select year(s)…"
                      ariaLabel={`Band ${i + 1} years of study`}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Band total *</label>
                    <input type="number" min="0" step="0.01" value={b.total_amount} onChange={(e) => updateBand(i, { total_amount: e.target.value })} className="input" placeholder="0.00" disabled={saving} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-2 block text-xs font-medium text-gray-600">Label (optional)</label>
                  <input value={b.label} onChange={(e) => updateBand(i, { label: e.target.value })} className="input" placeholder={`e.g. ${b.study_years.length === 1 ? `Year ${b.study_years[0]}` : 'Years ' + b.study_years.join(' & ')}`} disabled={saving} />
                </div>
                <div className="mt-4">
                  <TermList terms={b.terms} total={Number(b.total_amount) || 0} disabled={saving} onChange={(t) => updateBand(i, { terms: t })} error={errors[`band${i}`]} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <label className="mb-2 block text-sm font-medium text-gray-700">Notes</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="input" rows={2} placeholder="Optional notes" disabled={saving} />
      </div>

      <div className="flex justify-end gap-3">
        <Link href={cancelHref} className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
          Cancel
        </Link>
        <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === 'create' ? 'Create Fee Structure' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
