import * as XLSX from 'xlsx';
import type { CoveragePerson } from '../fee-api';

// Export coverage rows (the selected ones, or all when none are selected) to an
// .xlsx workbook. Mirrors the module export helpers (e.g. vehicle-export.ts):
// client-side json_to_sheet → writeFile, human-readable column headers.

function today() {
  return new Date().toISOString().split('T')[0];
}

export function exportCoverage(rows: CoveragePerson[], feeName?: string) {
  const data = rows.map((p) => ({
    Name: p.name,
    Code: p.code ?? '',
    Institution: p.institution_name ?? '',
    Type: p.person_type === 'staff' ? 'Staff' : 'Learner',
    'Terms billed': `${p.terms_billed}/${p.total_terms}`,
    Status: p.status.replace(/_/g, ' '),
  }));

  const ws = XLSX.utils.json_to_sheet(data, {
    header: ['Name', 'Code', 'Institution', 'Type', 'Terms billed', 'Status'],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Coverage');

  const safe = (feeName || 'fee').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '').slice(0, 40);
  XLSX.writeFile(wb, `coverage-${safe}-${today()}.xlsx`);
}
