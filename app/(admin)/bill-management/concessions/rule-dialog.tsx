'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectMenu } from '@/components/ui/select-menu';
import { fetchMasters } from '../../fees/fee-api';
import { createRule, updateRule, type ConcessionKind, type ConcessionRule } from './concessions-api';

const inputCls =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

export function RuleDialog({
  open, year, kind, rule, onClose, onSaved,
}: {
  open: boolean;
  year: string;
  kind: ConcessionKind;
  rule: ConcessionRule | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const [institutionId, setInstitutionId] = useState('');
  const [programId, setProgramId] = useState('');
  const [admissionYear, setAdmissionYear] = useState('');
  const [percent, setPercent] = useState('50');
  const [annualAmount, setAnnualAmount] = useState('500');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInstitutionId(rule?.institution_id ?? '');
    setProgramId(rule?.program_id ?? '');
    setAdmissionYear(rule?.admission_year ? String(rule.admission_year) : '');
    setPercent(rule?.percent != null ? String(rule.percent) : '50');
    setAnnualAmount(rule?.annual_amount != null ? String(rule.annual_amount) : '500');
    setLabel(rule?.label ?? '');
  }, [open, rule]);

  const { data: institutions = [] } = useQuery({
    queryKey: ['masters', 'institutions'],
    queryFn: () => fetchMasters('institutions'),
    enabled: open && kind === 'final_year',
  });
  const { data: programmes = [] } = useQuery({
    queryKey: ['masters', 'programmes', institutionId],
    queryFn: () => fetchMasters('programmes', { institution_id: institutionId }),
    enabled: open && kind === 'final_year' && !!institutionId,
  });

  async function save() {
    setSaving(true);
    try {
      const input = kind === 'final_year'
        ? {
            kind, label,
            institution_id: institutionId || null,
            program_id: programId || null,
            admission_year: admissionYear ? Number(admissionYear) : null,
            percent: percent ? Number(percent) : null,
            is_active: rule?.is_active ?? true,
          }
        : { kind, label, annual_amount: annualAmount ? Number(annualAmount) : null, is_active: rule?.is_active ?? true };
      if (rule) await updateRule(rule.id, input);
      else await createRule(year, input);
      toast.success(rule ? 'Rule updated.' : 'Rule added.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the rule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {rule ? 'Edit' : 'Add'} {kind === 'final_year' ? 'final-year cohort rule' : '7.5% scheme amount'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-300">Label</span>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === 'final_year' ? 'Pharmacy BPHARM 2022-2026' : '7.5% scholarship - Rs 500 per year'} />
          </label>
          {kind === 'final_year' ? (
            <>
              <div className="text-sm">
                <span className="text-gray-600 dark:text-gray-300">College</span>
                <SelectMenu
                  value={institutionId}
                  onValueChange={(v) => { setInstitutionId(v); setProgramId(''); }}
                  options={institutions.map((i) => ({ value: i.id, label: i.name }))}
                  placeholder="Select college…"
                  ariaLabel="College"
                />
              </div>
              <div className="text-sm">
                <span className="text-gray-600 dark:text-gray-300">Program (optional)</span>
                <SelectMenu
                  value={programId}
                  onValueChange={setProgramId}
                  options={[{ value: '', label: 'All programs' }, ...programmes.map((p) => ({ value: p.id, label: p.name }))]}
                  placeholder="All programs"
                  ariaLabel="Program"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Admission year</span>
                  <input className={inputCls} inputMode="numeric" value={admissionYear}
                    onChange={(e) => setAdmissionYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2022" />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Pay (%)</span>
                  <input className={inputCls} inputMode="decimal" value={percent}
                    onChange={(e) => setPercent(e.target.value)} />
                </label>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Learners admitted in this year at this college pay this percentage of their normal transport fee.
              </p>
            </>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Annual amount (Rs), charged in Term 1</span>
              <input className={inputCls} inputMode="decimal" value={annualAmount}
                onChange={(e) => setAnnualAmount(e.target.value)} />
            </label>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving || !label.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
