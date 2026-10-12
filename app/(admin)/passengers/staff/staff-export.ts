import type { StaffPassenger } from '@/lib/passengers/types';

// xlsx and jspdf are dynamically imported only when an export is clicked,
// keeping them out of the Staff list page's first-load JS.

export type StaffExportFormat = 'xlsx' | 'pdf';

const COLUMNS: { header: string; value: (s: StaffPassenger) => string }[] = [
  { header: 'S.No', value: () => '' }, // filled per row below
  { header: 'Name', value: (s) => s.name },
  { header: 'Staff ID', value: (s) => s.staffId ?? '' },
  { header: 'Email', value: (s) => s.email ?? '' },
  { header: 'Phone', value: (s) => s.phone ?? '' },
  { header: 'Designation', value: (s) => s.designation ?? '' },
  { header: 'Institution', value: (s) => s.institutionName ?? '' },
  { header: 'Department', value: (s) => s.departmentName ?? '' },
  { header: 'Route', value: (s) => s.routeLabel ?? '' },
  { header: 'Stop', value: (s) => s.stopLabel ?? '' },
  { header: 'Assignment', value: (s) => (s.assigned ? 'Assigned' : 'Unassigned') },
  { header: 'Status', value: (s) => (s.isActive ? 'Active' : 'Inactive') },
];

function toRows(staff: StaffPassenger[]): string[][] {
  return staff.map((s, i) => COLUMNS.map((c, j) => (j === 0 ? String(i + 1) : c.value(s))));
}

function today() {
  return new Date().toISOString().split('T')[0];
}

async function exportExcel(staff: StaffPassenger[], filename: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header), ...toRows(staff)]);
  ws['!cols'] = COLUMNS.map((c) => ({ wch: c.header === 'S.No' ? 6 : c.header === 'Email' || c.header === 'Route' ? 32 : 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Staff');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

async function exportPdf(staff: StaffPassenger[], filename: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const assigned = staff.filter((s) => s.assigned).length;

  doc.setFontSize(14);
  doc.text('Staff — Transport', 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    `Generated ${new Date().toLocaleString('en-IN')}  ·  ${staff.length} staff  ·  ${assigned} assigned  ·  ${staff.length - assigned} unassigned`,
    40,
    52
  );

  autoTable(doc, {
    head: [COLUMNS.map((c) => c.header)],
    body: toRows(staff),
    startY: 64,
    margin: { left: 24, right: 24 },
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 28, halign: 'right' } },
    didDrawPage: () => {
      const pageSize = doc.internal.pageSize;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageSize.getWidth() - 60, pageSize.getHeight() - 14);
    },
  });

  doc.save(`${filename}.pdf`);
}

export async function exportStaff(staff: StaffPassenger[], format: StaffExportFormat) {
  const filename = `staff-export-${today()}`;
  if (format === 'pdf') await exportPdf(staff, filename);
  else await exportExcel(staff, filename);
}
