import * as XLSX from 'xlsx';

/**
 * Downloads a starter workbook in the JKKN route layout that
 * lib/routes/parse-route-workbook understands: one sheet per route, a merged
 * title row, a header row, then stops ending in COLLEGE. Two example routes are
 * included so the multi-sheet shape is obvious.
 */
export function downloadRouteTemplate() {
  const wb = XLSX.utils.book_new();

  const makeSheet = (routeName: string, routeNo: number, stops: [string, string, string][]) => {
    const aoa: (string | number)[][] = [
      [`BUS ROUTE NAME : ${routeName}     BUS ROUTE NUMBAR : ${routeNo}`],
      ['S.NO', 'STOPING PLACE', 'MORNING TIME', 'EVENING TIME'],
      ...stops.map(([name, morning, evening], i) => [i + 1, name, morning, evening]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [XLSX.utils.decode_range('A1:D1')];
    XLSX.utils.book_append_sheet(wb, ws, `${routeName} NO ${routeNo}`.slice(0, 31));
  };

  makeSheet('SAMPLE TOWN', 99, [
    ['FIRST STOP', '7-30 AM', '6-30 PM'],
    ['SECOND STOP', '7-45 AM', '6-15 PM'],
    ['THIRD STOP', '8-00 AM', '5-50 PM'],
    ['COLLEGE', '8-45 AM', '5-00 PM'],
  ]);
  makeSheet('OTHER TOWN', 98, [
    ['VILLAGE A', '7-10 AM', '6-40 PM'],
    ['VILLAGE B', '7-25 AM', '6-20 PM'],
    ['COLLEGE', '8-30 AM', '5-05 PM'],
  ]);

  XLSX.writeFile(wb, 'route-import-template.xlsx');
}
