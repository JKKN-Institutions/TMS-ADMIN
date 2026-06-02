import * as XLSX from 'xlsx';

// Import/export helpers for the Vehicles module (mirrors drivers/driver-export).
// The template columns match the Add Vehicle form fields so an
// export → edit in Excel → re-import round-trip works with no translation.
// NOTE: exportVehicles() is added in the Export step; this file currently backs
// the bulk-upload template only.

function today() {
  return new Date().toISOString().split('T')[0];
}

// A starter spreadsheet showing the expected columns + one example row. The
// import endpoint (app/api/admin/vehicles/import) upserts by registration_number.
export function downloadVehicleTemplate() {
  const example = {
    registration_number: 'TN01AB1234',
    model: 'Tata Starbus',
    capacity: 40,
    fuel_type: 'diesel', // diesel | petrol | electric | cng
    status: 'active', // active | maintenance | retired
    mileage: 12.5,
    last_maintenance: '2026-01-15',
    next_maintenance: '2026-07-15',
    insurance_expiry: '2027-03-31',
    fitness_expiry: '2027-03-31',
    purchase_date: '2022-06-01',
    chassis_number: 'MA3FKA1BHGM123456',
    engine_number: '497TCIC123456',
    gps_device_id: '', // leave blank — assign a GPS device from the vehicle form
    live_tracking_enabled: false,
  };
  const ws = XLSX.utils.json_to_sheet([example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');
  XLSX.writeFile(wb, `vehicles-import-template-${today()}.xlsx`);
}
