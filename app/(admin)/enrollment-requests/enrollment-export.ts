import type { LearnerPassenger } from '@/lib/passengers/types';

// xlsx (~400KB) is dynamically imported only in the branches that build a
// workbook, so the Enrollment page's first-load JS stays unchanged for users who
// never export (and the JSON branch needs no library at all).

export type ExportFormat = 'csv' | 'xlsx' | 'json';

// Flat, human-readable row. The allocation columns are the point of this page,
// so route/stop and the allocated/unallocated verdict sit next to each other and
// the raw learner id is kept last as the stable key for any follow-up work.
function learnerToRow(l: LearnerPassenger) {
  return {
    name: l.name,
    rollNumber: l.rollNumber ?? '',
    registerNumber: l.registerNumber ?? '',
    email: l.email ?? '',
    mobile: l.mobile ?? '',
    institution: l.institutionName ?? '',
    department: l.departmentName ?? '',
    program: l.programName ?? '',
    semester: l.semesterName ?? '',
    lifecycleStatus: l.lifecycleStatus,
    allocation: l.assigned ? 'Allocated' : 'Unallocated',
    route: l.routeLabel ?? '',
    boardingStop: l.stopLabel ?? '',
    transportFee: l.transportFee ?? '',
    learnerId: l.id,
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

export async function exportEnrollment(learners: LearnerPassenger[], format: ExportFormat) {
  const rows = learners.map(learnerToRow);
  const filename = `transport-enrollment-${today()}`;

  if (format === 'json') {
    triggerDownload(`${filename}.json`, JSON.stringify(rows, null, 2), 'application/json');
    return;
  }

  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Enrollment');
  XLSX.writeFile(wb, `${filename}.${format}`, format === 'csv' ? { bookType: 'csv' } : undefined);
}
