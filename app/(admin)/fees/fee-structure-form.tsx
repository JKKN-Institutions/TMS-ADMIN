'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Plus, Trash2, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchMasters, fetchTransportYearOptions, type MasterOption } from './fee-api';
import type { FeeAudience, FeeStatus } from '@/lib/fees/types';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';
import { inr } from './columns';

interface TermRow { term_label: string; amount: string; due_date: string }

export interface FeeFormInitial {
  name: string;
  transport_year_id: string;
  audience: FeeAudience;
  status: FeeStatus;
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  semester_id: string;
  quota_id: string;
  staff_role_keys: string[];
  total_amount: string;
  notes: string;
  terms: TermRow[];
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

// Map a master/reference list to dropdown options, prefixed with a clearable
// "Any" entry so an optional condition filter can be reset back to "any".
const toOptions = (list: MasterOption[], anyLabel = 'Any'): SelectMenuOption[] => [
  { value: '', label: anyLabel },
  ...list.map((o) => ({ value: o.id, label: o.name })),
];

export function FeeStructureForm({ mode, feeId, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    transport_year_id: initial?.transport_year_id ?? '',
    audience: (initial?.audience ?? 'student') as FeeAudience,
    status: (initial?.status ?? 'draft') as FeeStatus,
    institution_id: initial?.institution_id ?? '',
    degree_id: initial?.degree_id ?? '',
    department_id: initial?.department_id ?? '',
    programme_id: initial?.programme_id ?? '',
    semester_id: initial?.semester_id ?? '',
    quota_id: initial?.quota_id ?? '',
    staff_role_keys: initial?.staff_role_keys ?? ([] as string[]),
    total_amount: initial?.total_amount ?? '',
    notes: initial?.notes ?? '',
  });
  const [terms, setTerms] = useState<TermRow[]>(
    initial?.terms && initial.terms.length ? initial.terms : [blankTerm(1)]
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [transportYears, setTransportYears] = useState<MasterOption[]>([]);
  const [institutions, setInstitutions] = useState<MasterOption[]>([]);
  const [degrees, setDegrees] = useState<MasterOption[]>([]);
  const [departments, setDepartments] = useState<MasterOption[]>([]);
  const [programmes, setProgrammes] = useState<MasterOption[]>([]);
  const [semesters, setSemesters] = useState<MasterOption[]>([]);
  const [quotas, setQuotas] = useState<MasterOption[]>([]);
  const [staffRoles, setStaffRoles] = useState<MasterOption[]>([]);

  const set = (k: keyof typeof form, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  // base option lists
  useEffect(() => {
    fetchTransportYearOptions().then(setTransportYears).catch(() => {});
    fetchMasters('institutions').then(setInstitutions).catch(() => {});
    fetchMasters('quotas').then(setQuotas).catch(() => {});
    fetchMasters('staff-roles').then(setStaffRoles).catch(() => {});
  }, []);

  // cascading dropdowns
  useEffect(() => {
    if (!form.institution_id) { setDegrees([]); return; }
    fetchMasters('degrees', { institution_id: form.institution_id }).then(setDegrees).catch(() => {});
  }, [form.institution_id]);
  useEffect(() => {
    if (!form.institution_id) { setDepartments([]); return; }
    // students narrow departments by degree; staff narrow by institution only
    fetchMasters('departments', {
      institution_id: form.institution_id,
      degree_id: form.audience === 'student' ? form.degree_id : undefined,
    }).then(setDepartments).catch(() => {});
  }, [form.institution_id, form.degree_id, form.audience]);
  useEffect(() => {
    if (!form.department_id) { setProgrammes([]); return; }
    fetchMasters('programmes', {
      institution_id: form.institution_id, degree_id: form.degree_id, department_id: form.department_id,
    }).then(setProgrammes).catch(() => {});
  }, [form.department_id, form.degree_id, form.institution_id]);
  useEffect(() => {
    if (!form.programme_id) { setSemesters([]); return; }
    fetchMasters('semesters', { program_id: form.programme_id }).then(setSemesters).catch(() => {});
  }, [form.programme_id]);

  const totalNum = Number(form.total_amount) || 0;
  const termsSum = terms.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const sumMatches = Math.abs(termsSum - totalNum) < 0.01;

  const setTerm = (i: number, k: keyof TermRow, v: string) =>
    setTerms((ts) => ts.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
  const addTerm = () => setTerms((ts) => [...ts, blankTerm(ts.length + 1)]);
  const removeTerm = (i: number) => setTerms((ts) => (ts.length > 1 ? ts.filter((_, idx) => idx !== i) : ts));
  const distributeEqually = () => {
    if (!totalNum || terms.length === 0) return;
    const each = Math.floor((totalNum / terms.length) * 100) / 100;
    const remainder = Math.round((totalNum - each * terms.length) * 100) / 100;
    setTerms((ts) => ts.map((t, i) => ({ ...t, amount: String(i === ts.length - 1 ? each + remainder : each) })));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.transport_year_id) next.transport_year_id = 'Transport year is required';
    if (!form.total_amount || totalNum <= 0) next.total_amount = 'Total fee must be greater than 0';
    if (terms.some((t) => !t.amount || Number(t.amount) < 0)) next.terms = 'Every term needs a valid amount';
    else if (terms.some((t) => !t.due_date)) next.terms = 'Every term needs a due date';
    else if (!sumMatches) next.terms = `Term amounts (${inr(termsSum)}) must equal the total (${inr(totalNum)})`;
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
      const isStudent = form.audience === 'student';
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        transport_year_id: form.transport_year_id,
        audience: form.audience,
        status: form.status,
        institution_id: form.institution_id || null,
        degree_id: isStudent ? form.degree_id || null : null,
        department_id: form.department_id || null,
        programme_id: isStudent ? form.programme_id || null : null,
        semester_id: isStudent ? form.semester_id || null : null,
        quota_id: isStudent ? form.quota_id || null : null,
        staff_role_keys: !isStudent && form.staff_role_keys.length ? form.staff_role_keys : null,
        total_amount: totalNum,
        split_count: terms.length,
        notes: form.notes.trim() || null,
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
  const isStudent = form.audience === 'student';
  const selectCls = (err?: string) => `input ${err ? 'border-red-500' : ''}`;

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
              placeholder="e.g. Transport Fee 2026-2027 (Engineering)"
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
        <p className="mb-4 text-xs text-gray-500">Leave a field blank to mean “any”. Only bus-required, active people matching these are billed.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Institution</label>
            <SelectMenu
              value={form.institution_id}
              onValueChange={(v) => { set('institution_id', v); set('degree_id',''); set('department_id',''); set('programme_id',''); set('semester_id',''); }}
              options={toOptions(institutions)}
              placeholder="Any"
              ariaLabel="Institution"
              disabled={saving}
            />
          </div>
          {isStudent && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Degree</label>
              <SelectMenu
                value={form.degree_id}
                onValueChange={(v) => { set('degree_id', v); set('department_id',''); set('programme_id',''); set('semester_id',''); }}
                options={toOptions(degrees)}
                placeholder="Any"
                ariaLabel="Degree"
                disabled={saving || !form.institution_id}
              />
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Department</label>
            <SelectMenu
              value={form.department_id}
              onValueChange={(v) => { set('department_id', v); set('programme_id',''); set('semester_id',''); }}
              options={toOptions(departments)}
              placeholder="Any"
              ariaLabel="Department"
              disabled={saving || !form.institution_id}
            />
          </div>
          {isStudent && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Programme</label>
                <SelectMenu
                  value={form.programme_id}
                  onValueChange={(v) => { set('programme_id', v); set('semester_id',''); }}
                  options={toOptions(programmes)}
                  placeholder="Any"
                  ariaLabel="Programme"
                  disabled={saving || !form.department_id}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Semester</label>
                <SelectMenu
                  value={form.semester_id}
                  onValueChange={(v) => set('semester_id', v)}
                  options={toOptions(semesters)}
                  placeholder="Any"
                  ariaLabel="Semester"
                  disabled={saving || !form.programme_id}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Quota</label>
                <SelectMenu
                  value={form.quota_id}
                  onValueChange={(v) => set('quota_id', v)}
                  options={toOptions(quotas)}
                  placeholder="Any"
                  ariaLabel="Quota"
                  disabled={saving}
                />
              </div>
            </>
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
      </div>

      {/* ── Fee & terms ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Fee &amp; terms</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={distributeEqually} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50" disabled={saving || !totalNum}>
              <Wand2 className="h-3.5 w-3.5" /> Split equally
            </button>
            <button type="button" onClick={addTerm} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50" disabled={saving}>
              <Plus className="h-3.5 w-3.5" /> Add term
            </button>
          </div>
        </div>
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

        <div className="space-y-3">
          {terms.map((t, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_140px_180px_40px] sm:items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Term {i + 1} label</label>
                <input value={t.term_label} onChange={(e) => setTerm(i, 'term_label', e.target.value)} className="input" placeholder={`Term ${i + 1}`} disabled={saving} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Amount</label>
                <input type="number" min="0" step="0.01" value={t.amount} onChange={(e) => setTerm(i, 'amount', e.target.value)} className="input" placeholder="0.00" disabled={saving} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Due date</label>
                <input type="date" value={t.due_date} onChange={(e) => setTerm(i, 'due_date', e.target.value)} className="input" disabled={saving} />
              </div>
              <button type="button" onClick={() => removeTerm(i)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={saving || terms.length <= 1} aria-label="Remove term">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className={`mt-3 text-sm ${sumMatches ? 'text-green-600' : 'text-red-500'}`}>
          Terms total: <span className="font-semibold">{inr(termsSum)}</span> / {inr(totalNum)}
          {!sumMatches && ' — must match the total fee'}
        </div>
        {errors.terms && <p className="mt-1 text-xs text-red-500">{errors.terms}</p>}
      </div>

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
