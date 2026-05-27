'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { DriverListItem, DriverOps } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type FormState = Omit<DriverOps, 'experienceYears' | 'rating' | 'totalTrips'> & {
  experienceYears: string; rating: string; totalTrips: string;
};

function toForm(ops: DriverOps | null): FormState {
  return {
    licenseNumber: ops?.licenseNumber ?? '', licenseExpiry: ops?.licenseExpiry ?? '',
    experienceYears: String(ops?.experienceYears ?? 0), rating: String(ops?.rating ?? 0),
    totalTrips: String(ops?.totalTrips ?? 0), driverStatus: ops?.driverStatus ?? 'active',
    address: ops?.address ?? '', emergencyContactName: ops?.emergencyContactName ?? '',
    emergencyContactPhone: ops?.emergencyContactPhone ?? '', aadharNumber: ops?.aadharNumber ?? '',
    medicalCertificateExpiry: ops?.medicalCertificateExpiry ?? '', locationSharingEnabled: ops?.locationSharingEnabled ?? false,
    assignedRouteId: ops?.assignedRouteId ?? '', notes: ops?.notes ?? '',
  };
}

export function DriverEditDialog({ driver, open, onOpenChange }: {
  driver: DriverListItem | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(toForm(null));
  useEffect(() => { if (driver) setForm(toForm(driver.ops)); }, [driver]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/drivers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: driver!.id, fields: form }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      return json;
    },
    onSuccess: () => { toast.success('Driver details saved'); qc.invalidateQueries({ queryKey: ['drivers'] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof FormState, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Driver — {driver?.name}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-3 max-h-[70vh] overflow-auto"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">License No.<input className="input" value={form.licenseNumber ?? ''} onChange={(e) => set('licenseNumber', e.target.value)} /></label>
            <label className="text-sm">License Expiry<input type="date" className="input" value={form.licenseExpiry ?? ''} onChange={(e) => set('licenseExpiry', e.target.value)} /></label>
            <label className="text-sm">Experience (yrs)<input type="number" min="0" className="input" value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} /></label>
            <label className="text-sm">Rating<input type="number" step="0.1" min="0" max="5" className="input" value={form.rating} onChange={(e) => set('rating', e.target.value)} /></label>
            <label className="text-sm">Total Trips<input type="number" min="0" className="input" value={form.totalTrips} onChange={(e) => set('totalTrips', e.target.value)} /></label>
            <label className="text-sm">Driver Status
              <select className="input" value={form.driverStatus} onChange={(e) => set('driverStatus', e.target.value)}>
                <option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On Leave</option>
              </select>
            </label>
            <label className="text-sm">Emergency Contact Name<input className="input" value={form.emergencyContactName ?? ''} onChange={(e) => set('emergencyContactName', e.target.value)} /></label>
            <label className="text-sm">Emergency Contact Phone<input className="input" value={form.emergencyContactPhone ?? ''} onChange={(e) => set('emergencyContactPhone', e.target.value)} /></label>
            <label className="text-sm">Aadhar No.<input className="input" value={form.aadharNumber ?? ''} onChange={(e) => set('aadharNumber', e.target.value)} /></label>
            <label className="text-sm">Medical Cert. Expiry<input type="date" className="input" value={form.medicalCertificateExpiry ?? ''} onChange={(e) => set('medicalCertificateExpiry', e.target.value)} /></label>
          </div>
          <label className="text-sm block">Address<input className="input w-full" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></label>
          <label className="text-sm block">Notes<textarea className="input w-full" rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.locationSharingEnabled} onChange={(e) => set('locationSharingEnabled', e.target.checked)} /> Location sharing enabled
          </label>
          <DialogFooter>
            <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save'}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
