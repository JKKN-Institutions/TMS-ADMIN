'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { DriverListItem, DriverOps } from '@/types';
import { emptyPerson, personFromDriver, toDateInput } from '@/lib/drivers/person-form';
import { validatePerson, type DriverPersonInput, type FieldErrors } from '@/lib/drivers/staff-fields';
import { displayStatus, employeeActiveFor, normalizeDriverStatus } from '@/lib/drivers/status-rule';
import { SectionCard } from './driver-page-header';
import DriverPersonFields from './driver-person-fields';

/** The TMS-only details. All string-backed for controlled inputs; numbers are coerced server-side. */
interface TransportState {
  licenseNumber: string;
  licenseExpiry: string;
  experienceYears: string;
  driverStatus: string;
  assignedRouteId: string;
  aadharNumber: string;
  medicalCertificateExpiry: string;
  notes: string;
}

type TransportErrors = Partial<Record<keyof TransportState, string>>;

function toTransport(ops: DriverOps | null, driver?: DriverListItem): TransportState {
  return {
    licenseNumber: ops?.licenseNumber ?? '',
    licenseExpiry: toDateInput(ops?.licenseExpiry),
    experienceYears: String(ops?.experienceYears ?? 0),
    // One status: an employee who is inactive in MyJKKN shows as Inactive here too.
    driverStatus: driver ? displayStatus(driver) : (ops?.driverStatus ?? 'active'),
    assignedRouteId: ops?.assignedRouteId ?? '',
    aadharNumber: ops?.aadharNumber ?? '',
    medicalCertificateExpiry: toDateInput(ops?.medicalCertificateExpiry),
    notes: ops?.notes ?? '',
  };
}

/** What the server took an inactive driver off. */
interface Released {
  routes: { id: string; label: string }[];
  mobilesHeld: number;
  warning?: string;
}

class SaveError extends Error {
  fields?: Record<string, string>;
  field?: string;
  constructor(message: string, fields?: Record<string, string>, field?: string) {
    super(message);
    this.fields = fields;
    this.field = field;
  }
}

async function send(url: string, method: 'POST' | 'PATCH', body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new SaveError(json.error || 'Save failed', json.fields, json.field);
  }
  return json;
}

/** Upload the photo; returns null on success, else the reason to show. */
async function uploadPhoto(id: string, file: File): Promise<string | null> {
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`/api/admin/drivers/${id}/photo`, { method: 'POST', body });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) return null;
    return typeof json.error === 'string' && json.error ? json.error : 'Upload failed';
  } catch {
    return 'Upload failed';
  }
}

const TRANSPORT_KEYS: (keyof TransportState)[] = [
  'licenseNumber', 'licenseExpiry', 'experienceYears', 'driverStatus',
  'assignedRouteId', 'aadharNumber', 'medicalCertificateExpiry', 'notes',
];

function scrollToField(domId: string) {
  const el = document.getElementById(domId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (el as HTMLElement).focus?.({ preventScroll: true });
}

/**
 * Shared driver form.
 * - create-new      -> POST /api/admin/drivers/onboard  (new staff record + transport details)
 * - create-existing -> POST /api/admin/drivers          (existing staff member + transport details)
 * - edit            -> PATCH /api/admin/drivers/<id>    (staff record when allowed + transport details)
 */
export default function DriverForm({
  mode,
  staffId,
  driver,
}: {
  mode: 'create-new' | 'create-existing' | 'edit';
  staffId?: string;
  driver?: DriverListItem;
}) {
  const router = useRouter();
  const qc = useQueryClient();

  const showPerson = mode === 'create-new' || (mode === 'edit' && !!driver?.canFullEdit);
  const personMode = mode === 'create-new' ? 'create' : 'edit';
  // The Create page mounts the new and existing forms together: their transport input ids must differ.
  const tp = mode === 'create-existing' ? 'dtx' : 'dt';

  const [person, setPerson] = useState<DriverPersonInput>(() =>
    mode === 'edit' && driver ? personFromDriver(driver) : emptyPerson(),
  );
  const [transport, setTransport] = useState<TransportState>(() =>
    toTransport(driver?.ops ?? null, mode === 'edit' ? driver : undefined),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [transportErrors, setTransportErrors] = useState<TransportErrors>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const setP = (k: keyof DriverPersonInput, v: string | boolean) => {
    setPerson((p) => ({ ...p, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  const setT = (k: keyof TransportState, v: string) => {
    // An inactive driver holds no route.
    setTransport((p) => ({ ...p, [k]: v, ...(k === 'driverStatus' && v === 'inactive' ? { assignedRouteId: '' } : {}) }));
    setTransportErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

  // Routes for the "Assigned route" dropdown. The driver portal reads this column
  // (tms_driver.assigned_route_id), so the value MUST be a real route UUID.
  const [routes, setRoutes] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/routes');
        const json = await res.json();
        if (active && json.success) {
          setRoutes(
            (json.data as { id: string; route_number: string | null; route_name: string | null }[]).map((r) => ({
              id: r.id,
              label: `${r.route_number ?? '?'} · ${r.route_name ?? ''}`.trim(),
            })),
          );
        }
      } catch {
        /* non-fatal — the dropdown just stays empty */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /** Show server-side errors under the inputs; returns true when at least one input took it. */
  const showFieldErrors = (fields?: Record<string, string>, field?: string, message?: string): boolean => {
    const map: Record<string, string> = { ...(fields ?? {}) };
    if (field && message) map[field] = message;
    const personErrs: Record<string, string> = {};
    const transportErrs: Record<string, string> = {};
    for (const [k, msg] of Object.entries(map)) {
      if ((TRANSPORT_KEYS as string[]).includes(k)) transportErrs[k] = msg;
      else if (showPerson) personErrs[k] = msg;
    }
    const personKeys = Object.keys(personErrs);
    const transportKeys = Object.keys(transportErrs);
    if (personKeys.length === 0 && transportKeys.length === 0) return false;
    setErrors(personErrs as FieldErrors);
    setTransportErrors(transportErrs as TransportErrors);
    const first = personKeys[0] ? `dp-${personKeys[0]}` : `${tp}-${transportKeys[0]}`;
    setTimeout(() => scrollToField(first), 0);
    return true;
  };

  const inactiveChosen = transport.driverStatus === 'inactive';
  // The status decides the employee flag MyJKKN reads; the server applies the same rule.
  const personToSend = { ...person, isActive: employeeActiveFor(normalizeDriverStatus(transport.driverStatus)) };

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create-existing') {
        await send('/api/admin/drivers', 'POST', { staffId, fields: transport });
        return { id: staffId as string, staffCode: null as string | null, warning: undefined as string | undefined };
      }
      if (mode === 'create-new') {
        const json = await send('/api/admin/drivers/onboard', 'POST', { person: personToSend, transport });
        const d = json.data as { id: string; staffCode: string | null; warning?: string };
        return { id: d.id, staffCode: d.staffCode ?? null, warning: d.warning };
      }
      const id = (driver as DriverListItem).id;
      // baseUpdatedAt lets the server refuse the save if the record changed since this form loaded.
      const saved = await send(
        `/api/admin/drivers/${id}`,
        'PATCH',
        showPerson ? { person: personToSend, transport, baseUpdatedAt: driver?.person.updatedAt ?? null } : { transport },
      );
      // Set when this save made the driver inactive (or finished taking them off a route).
      const released = (saved.data as { released?: Released } | undefined)?.released;
      return { id, staffCode: null as string | null, warning: undefined as string | undefined, released };
    },
    onSuccess: async (result) => {
      const { id, staffCode, warning } = result;
      const released = 'released' in result ? result.released : undefined;
      const photoError = photoFile && showPerson ? await uploadPhoto(id, photoFile) : null;
      const photoFailed = photoError !== null;

      qc.invalidateQueries({ queryKey: ['drivers'] });
      qc.invalidateQueries({ queryKey: ['driver', id] });
      // Making a driver inactive takes them off their route and bus.
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });

      if (mode === 'create-new') {
        if (photoFailed) toast.error(`Driver created, but the photo was not uploaded: ${photoError}`);
        if (warning) {
          toast(warning, { duration: 8000 });
          router.push(`/drivers/${id}/edit`);
          return;
        }
        if (!photoFailed) toast.success(staffCode ? `Driver created — Staff ID ${staffCode}` : 'Driver created');
      } else if (mode === 'create-existing') {
        toast.success('Driver created');
      } else {
        if (photoFailed) toast.error(`Details saved, but the photo was not uploaded: ${photoError}`);
        else toast.success('Driver details saved');
        if (released?.routes.length) {
          toast(`Taken off ${released.routes.map((r) => r.label).join(', ')}. Choose another driver for that route.`, { duration: 8000 });
        }
        if (released?.warning) toast.error(released.warning, { duration: 8000 });
        if (released && released.mobilesHeld > 0) {
          toast(
            released.mobilesHeld === 1
              ? 'They still hold 1 phone. Collect it in Driver Mobiles.'
              : `They still hold ${released.mobilesHeld} phones. Collect them in Driver Mobiles.`,
            { duration: 8000 },
          );
        }
      }
      router.push(`/drivers/${id}`);
    },
    onError: (e: Error) => {
      const err = e as SaveError;
      if (showFieldErrors(err.fields, err.field, err.message)) {
        toast.error('Please fix the highlighted fields');
        return;
      }
      toast.error(err.message);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showPerson) {
      const check = validatePerson(personToSend, personMode);
      if (!check.ok) {
        showFieldErrors(check.errors as Record<string, string>);
        toast.error('Please fix the highlighted fields');
        return;
      }
    }
    setErrors({});
    setTransportErrors({});
    mutation.mutate();
  };

  const tField = (k: keyof TransportState) => ({
    id: `${tp}-${k}`,
    'aria-invalid': transportErrors[k] ? true : undefined,
    'aria-describedby': transportErrors[k] ? `${tp}-${k}-error` : undefined,
    className: 'input',
    value: transport[k],
    onChange: (e: { target: { value: string } }) => setT(k, e.target.value),
  });
  const tError = (k: keyof TransportState) =>
    transportErrors[k] ? (
      <p id={`${tp}-${k}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
        {transportErrors[k]}
      </p>
    ) : null;

  const busy = mutation.isPending;
  const createLabel = mode === 'edit' ? 'Save changes' : 'Create Driver';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {showPerson && (
        <DriverPersonFields
          mode={personMode}
          value={person}
          errors={errors}
          staffCode={driver?.person.staffCode ?? null}
          institutionEmail={driver?.person.institutionEmail ?? null}
          onChange={setP}
          photo={{ currentUrl: driver?.person.photoUrl ?? null, file: photoFile, onPick: setPhotoFile }}
        />
      )}

      <SectionCard title="Transport details">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-w-0 text-sm">
            <label htmlFor={`${tp}-licenseNumber`} className="text-gray-600">Licence no.</label>
            <input {...tField('licenseNumber')} className="input mt-1" />
            {tError('licenseNumber')}
          </div>
          <div className="min-w-0 text-sm">
            <label htmlFor={`${tp}-licenseExpiry`} className="text-gray-600">Licence expiry</label>
            <input type="date" {...tField('licenseExpiry')} className="input mt-1" />
            {tError('licenseExpiry')}
          </div>
          <div className="min-w-0 text-sm">
            <label htmlFor={`${tp}-experienceYears`} className="text-gray-600">Experience (years)</label>
            <input type="number" min="0" {...tField('experienceYears')} className="input mt-1" />
            {tError('experienceYears')}
          </div>
          <div className="min-w-0 text-sm">
            <label htmlFor={`${tp}-driverStatus`} className="text-gray-600">Driver status</label>
            <select {...tField('driverStatus')} className="input mt-1">
              <option value="active">Active</option>
              <option value="on_leave">On leave</option>
              {/* A brand-new driver is created active; inactive is for someone who has left. */}
              {mode === 'edit' && <option value="inactive">Inactive</option>}
            </select>
            {tError('driverStatus')}
            {mode === 'edit' && inactiveChosen && driver?.canFullEdit && (
              <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                Inactive also makes this person inactive in MyJKKN, signs them out of every JKKN app and takes them off
                their route.
              </p>
            )}
            {mode === 'edit' && inactiveChosen && driver && !driver.canFullEdit && (
              <p className="mt-1.5 text-xs text-gray-500">
                This person&apos;s record is managed in MyJKKN, so this status applies to TMS only.
              </p>
            )}
          </div>
          <div className="min-w-0 text-sm">
            <label htmlFor={`${tp}-assignedRouteId`} className="text-gray-600">Assigned route</label>
            <select
              {...tField('assignedRouteId')}
              className="input mt-1"
              disabled={mode === 'edit' && inactiveChosen && !!driver?.canFullEdit}
            >
              <option value="">Unassigned</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
            {tError('assignedRouteId')}
          </div>
          <div className="min-w-0 text-sm">
            <label htmlFor={`${tp}-aadharNumber`} className="text-gray-600">Aadhar no.</label>
            <input {...tField('aadharNumber')} className="input mt-1" />
            {tError('aadharNumber')}
          </div>
          <div className="min-w-0 text-sm">
            <label htmlFor={`${tp}-medicalCertificateExpiry`} className="text-gray-600">Medical certificate expiry</label>
            <input type="date" {...tField('medicalCertificateExpiry')} className="input mt-1" />
            {tError('medicalCertificateExpiry')}
          </div>
          <div className="min-w-0 text-sm md:col-span-2">
            <label htmlFor={`${tp}-notes`} className="text-gray-600">Notes</label>
            <textarea rows={2} {...tField('notes')} className="input mt-1" />
            {tError('notes')}
          </div>
        </div>
      </SectionCard>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => router.back()} disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          disabled={busy}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? (mode === 'edit' ? 'Saving…' : 'Creating…') : createLabel}
        </button>
      </div>
    </form>
  );
}
