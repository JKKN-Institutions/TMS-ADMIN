import * as XLSX from 'xlsx';
import type { TransportBillRow } from '@/lib/fees/bills';

// Export transport bill rows (selected, or all when none selected) to .xlsx.
// Mirrors the module export helpers (vehicle-export.ts / coverage-export.ts).

function today() {
  return new Date().toISOString().split('T')[0];
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toISOString().split('T')[0] : '');

export function exportBills(rows: TransportBillRow[], yearLabel?: string) {
  const data = rows.map((r) => ({
    Person: r.person_name,
    Code: r.code ?? '',
    Type: r.person_type === 'staff' ? 'Staff' : 'Learner',
    Institution: r.institution_name ?? '',
    Structure: r.structure_name ?? '',
    'Academic year': r.academic_year_name ?? '',
    Term: r.term_no,
    'Transport year': r.year_name ?? '',
    Amount: r.amount,
    Paid: r.paid_amount,
    Pending: r.pending_amount,
    'Due date': fmtDate(r.due_date),
    Status: r.status.replace(/_/g, ' '),
    'Payment date': fmtDate(r.payment_date),
  }));

  const header = [
    'Person', 'Code', 'Type', 'Institution', 'Structure', 'Academic year', 'Term', 'Transport year',
    'Amount', 'Paid', 'Pending', 'Due date', 'Status', 'Payment date',
  ];
  const ws = XLSX.utils.json_to_sheet(data, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bills');

  const safe = (yearLabel || 'all').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '').slice(0, 40);
  XLSX.writeFile(wb, `transport-bills-${safe}-${today()}.xlsx`);
}
