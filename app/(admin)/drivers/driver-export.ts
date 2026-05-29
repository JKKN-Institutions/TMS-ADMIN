import * as XLSX from 'xlsx';
import type { DriverListItem } from '@/types';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

// Column keys match the import endpoint so an export → edit → import round-trip works.
// `staffId` and `email` are the match keys; the rest are TMS operational fields.
function driverToRow(d: DriverListItem) {
  return {
    staffId: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    employmentType: d.employmentType,
    dateOfJoining: d.dateOfJoining ?? '',
    designation: d.designation,
    licenseNumber: d.ops?.licenseNumber ?? '',
    licenseExpiry: d.ops?.licenseExpiry ?? '',
    experienceYears: d.ops?.experienceYears ?? 0,
    rating: d.ops?.rating ?? 0,
    totalTrips: d.ops?.totalTrips ?? 0,
    driverStatus: d.ops?.driverStatus ?? '',
    address: d.ops?.address ?? '',
    emergencyContactName: d.ops?.emergencyContactName ?? '',
    emergencyContactPhone: d.ops?.emergencyContactPhone ?? '',
    aadharNumber: d.ops?.aadharNumber ?? '',
    medicalCertificateExpiry: d.ops?.medicalCertificateExpiry ?? '',
    locationSharingEnabled: d.ops?.locationSharingEnabled ?? false,
    assignedRouteId: d.ops?.assignedRouteId ?? '',
    notes: d.ops?.notes ?? '',
  };
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportDrivers(drivers: DriverListItem[], format: ExportFormat) {
  const rows = drivers.map(driverToRow);
  const filename = `drivers-export-${today()}`;

  if (format === 'json') {
    triggerDownload(`${filename}.json`, JSON.stringify(rows, null, 2), 'application/json');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
  XLSX.writeFile(wb, `${filename}.${format}`, format === 'csv' ? { bookType: 'csv' } : undefined);
}

// A starter spreadsheet showing the expected columns + one example row.
export function downloadDriverTemplate() {
  const example = {
    staffId: '(existing driver staff id — or leave blank and fill email)',
    email: 'driver@example.com',
    licenseNumber: 'DL-1234567890',
    licenseExpiry: '2030-12-31',
    experienceYears: 5,
    rating: 4.5,
    totalTrips: 120,
    driverStatus: 'active',
    address: '123 Main St',
    emergencyContactName: 'Contact Name',
    emergencyContactPhone: '9876543210',
    aadharNumber: '',
    medicalCertificateExpiry: '2027-06-30',
    locationSharingEnabled: true,
    assignedRouteId: '',
    notes: 'Optional notes',
  };
  const ws = XLSX.utils.json_to_sheet([example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
  XLSX.writeFile(wb, `drivers-import-template-${today()}.xlsx`);
}
