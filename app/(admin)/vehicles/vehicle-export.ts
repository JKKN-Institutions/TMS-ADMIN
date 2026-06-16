import * as XLSX from 'xlsx';
import type { VehicleRow } from './columns';

// Import/export helpers for the Vehicles module. Template columns match the
// import endpoint's accepted keys so export → edit in Excel → re-import round-trips.

function today() {
  return new Date().toISOString().split('T')[0];
}

// Columns emitted by export AND understood by the import endpoint (snake_case).
// Excludes assigned_driver_* and *_document_url (managed in the form, not import).
const EXPORT_COLUMNS: (keyof VehicleRow)[] = [
  'registration_number', 'vehicle_type', 'manufacturer', 'model', 'model_year', 'color',
  'capacity', 'gross_vehicle_weight', 'fuel_type', 'status', 'mileage',
  'ownership_type', 'permit_number', 'permit_expiry_date', 'pollution_certificate_number',
  'pollution_expiry_date', 'road_tax_expiry_date', 'fitness_expiry',
  'insurance_provider', 'insurance_policy_number', 'insurance_expiry',
  'gps_device_id', 'live_tracking_enabled', 'gps_provider', 'sim_number',
  'last_maintenance', 'next_maintenance',
  'monthly_emi', 'fuel_card_number', 'operating_cost_per_km',
  'emergency_contact_name', 'emergency_contact_phone', 'first_aid_available', 'fire_extinguisher_expiry',
  'chassis_number', 'engine_number', 'remarks',
];

export function downloadVehicleTemplate() {
  const example: Record<string, unknown> = {
    registration_number: 'TN01AB1234', vehicle_type: 'bus', manufacturer: 'Tata', model: 'Starbus',
    model_year: 2022, color: 'White', capacity: 40, gross_vehicle_weight: 16200,
    fuel_type: 'diesel', status: 'active', mileage: 12.5,
    ownership_type: 'owned', permit_number: 'PMT123',
    permit_expiry_date: '2027-03-31', pollution_certificate_number: 'PUC123', pollution_expiry_date: '2026-12-31',
    road_tax_expiry_date: '2027-06-01', fitness_expiry: '2027-03-31',
    insurance_provider: 'United India', insurance_policy_number: 'POL123', insurance_expiry: '2027-03-31',
    gps_device_id: '', live_tracking_enabled: false,
    gps_provider: 'Mercyda', sim_number: '9000000000', last_maintenance: '2026-01-15',
    next_maintenance: '2026-07-15', monthly_emi: 0, fuel_card_number: '', operating_cost_per_km: 18.5,
    emergency_contact_name: 'Control Room', emergency_contact_phone: '9000000001', first_aid_available: true,
    fire_extinguisher_expiry: '2027-01-01', chassis_number: 'MA3FKA1BHGM123456', engine_number: '497TCIC123456',
    remarks: 'Spare bus',
  };
  const ws = XLSX.utils.json_to_sheet([example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');
  XLSX.writeFile(wb, `vehicles-import-template-${today()}.xlsx`);
}

// Export the current fleet to Excel using the same columns as the template.
export function exportVehicles(rows: VehicleRow[]) {
  const data = rows.map((v) => {
    const o: Record<string, unknown> = {};
    for (const c of EXPORT_COLUMNS) o[c] = v[c] ?? '';
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: EXPORT_COLUMNS as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');
  XLSX.writeFile(wb, `vehicles-export-${today()}.xlsx`);
}
