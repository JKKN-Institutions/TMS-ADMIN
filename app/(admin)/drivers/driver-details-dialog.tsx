'use client';

import type { DriverListItem } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value || '—'}</span>
    </div>
  );
}

export function DriverDetailsDialog({ driver, open, onOpenChange }: {
  driver: DriverListItem | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const ops = driver?.ops;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Driver Details</DialogTitle></DialogHeader>
        {driver && (
          <div className="space-y-1 max-h-[70vh] overflow-auto">
            <div className="flex items-center gap-3 pb-3">
              {driver.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={driver.avatarUrl} alt={driver.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">{driver.name.slice(0,2).toUpperCase()}</div>
              )}
              <div><p className="font-semibold text-gray-900">{driver.name}</p><p className="text-sm text-gray-500">{driver.designation}</p></div>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase pt-2">Staff</p>
            <Row label="Email" value={driver.email} />
            <Row label="Phone" value={driver.phone} />
            <Row label="Employment Type" value={driver.employmentType} />
            <Row label="Date of Joining" value={driver.dateOfJoining ?? '—'} />
            <p className="text-xs font-semibold text-gray-400 uppercase pt-3">Operational (TMS)</p>
            <Row label="License No." value={ops?.licenseNumber ?? '—'} />
            <Row label="License Expiry" value={ops?.licenseExpiry ?? '—'} />
            <Row label="Experience (yrs)" value={ops ? ops.experienceYears : '—'} />
            <Row label="Driver Status" value={ops?.driverStatus ?? '—'} />
            <Row label="Total Trips" value={ops ? ops.totalTrips : '—'} />
            <Row label="Rating" value={ops ? ops.rating : '—'} />
            <Row label="Emergency Contact" value={ops?.emergencyContactName ? `${ops.emergencyContactName} (${ops.emergencyContactPhone ?? '—'})` : '—'} />
            <Row label="Medical Cert. Expiry" value={ops?.medicalCertificateExpiry ?? '—'} />
            <Row label="Location Sharing" value={ops ? (ops.locationSharingEnabled ? 'Enabled' : 'Disabled') : '—'} />
            <Row label="Notes" value={ops?.notes ?? '—'} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
