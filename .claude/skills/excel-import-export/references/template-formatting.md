# Template Formatting Patterns

This document covers Excel template generation with proper formatting and reference sheets.

## Template Export Function

```typescript
import * as XLSX from 'xlsx'

export function exportTemplate(referenceData?: {
  institutions?: Array<{ institution_code: string; name: string }>
  departments?: Array<{ department_code: string; department_name: string }>
}): void {
  const wb = XLSX.utils.book_new()

  // Create sample data
  const sample = [{
    'Institution Code *': 'JKKN',
    'Entity Code *': 'CODE001',
    'Entity Name *': 'Sample Entity Name',
    'Display Name': 'Display Name (Optional)',
    'Description': 'Optional description text',
    'Status': 'Active'
  }]

  const ws = XLSX.utils.json_to_sheet(sample)

  // Apply column widths
  ws['!cols'] = [
    { wch: 20 },  // Institution Code
    { wch: 20 },  // Entity Code
    { wch: 30 },  // Entity Name
    { wch: 25 },  // Display Name
    { wch: 40 },  // Description
    { wch: 10 }   // Status
  ]

  // Style header row
  styleHeaderRow(ws, ['Institution Code *', 'Entity Code *', 'Entity Name *'])

  XLSX.utils.book_append_sheet(wb, ws, 'Template')

  // Add reference sheets
  if (referenceData?.institutions?.length) {
    addReferenceSheet(wb, 'Institution Codes', referenceData.institutions, [
      { key: 'institution_code', header: 'Institution Code', width: 20 },
      { key: 'name', header: 'Institution Name', width: 40 }
    ])
  }

  if (referenceData?.departments?.length) {
    addReferenceSheet(wb, 'Department Codes', referenceData.departments, [
      { key: 'department_code', header: 'Department Code', width: 20 },
      { key: 'department_name', header: 'Department Name', width: 40 }
    ])
  }

  XLSX.writeFile(wb, `template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
```

## Header Row Styling

```typescript
function styleHeaderRow(ws: XLSX.WorkSheet, mandatoryFields: string[]): void {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    if (!ws[cellAddress]) continue

    const cell = ws[cellAddress]
    const isMandatory = mandatoryFields.includes(cell.v as string)

    if (isMandatory) {
      // Red header for mandatory fields
      cell.s = {
        font: { color: { rgb: 'FF0000' }, bold: true },
        fill: { fgColor: { rgb: 'FFE6E6' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      }
    } else {
      // Gray header for optional fields
      cell.s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'F0F0F0' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      }
    }
  }
}
```

## Reference Sheet Creation

```typescript
interface ReferenceColumn {
  key: string
  header: string
  width: number
}

function addReferenceSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  data: Record<string, unknown>[],
  columns: ReferenceColumn[]
): void {
  const sheetData = data.map(item => {
    const row: Record<string, unknown> = {}
    columns.forEach(col => {
      row[col.header] = item[col.key]
    })
    return row
  })

  const ws = XLSX.utils.json_to_sheet(sheetData)

  // Set column widths
  ws['!cols'] = columns.map(col => ({ wch: col.width }))

  // Style header
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    if (ws[cellAddress]) {
      ws[cellAddress].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'E6E6FA' } },
        alignment: { horizontal: 'center' }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName)
}
```

## Complete Example

```typescript
import * as XLSX from 'xlsx'

export function exportDegreeTemplate(institutions: Institution[]): void {
  const wb = XLSX.utils.book_new()

  // Main template sheet
  const sample = [{
    'Institution Code *': 'JKKN',
    'Degree Code *': 'BSC',
    'Degree Name *': 'Bachelor of Science',
    'Display Name': 'B.Sc.',
    'Description': 'Undergraduate science program',
    'Duration Years': '3',
    'Status': 'Active'
  }]

  const ws = XLSX.utils.json_to_sheet(sample)
  ws['!cols'] = [
    { wch: 20 }, { wch: 15 }, { wch: 30 },
    { wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 10 }
  ]

  // Style headers
  const mandatoryFields = ['Institution Code *', 'Degree Code *', 'Degree Name *']
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    if (!ws[cellAddress]) continue

    const cell = ws[cellAddress]
    const isMandatory = mandatoryFields.includes(cell.v as string)

    cell.s = isMandatory
      ? { font: { color: { rgb: 'FF0000' }, bold: true }, fill: { fgColor: { rgb: 'FFE6E6' } } }
      : { font: { bold: true }, fill: { fgColor: { rgb: 'F0F0F0' } } }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Template')

  // Add institution reference sheet
  if (institutions.length > 0) {
    const refData = institutions.map(inst => ({
      'Institution Code': inst.institution_code,
      'Institution Name': inst.name
    }))

    const refWs = XLSX.utils.json_to_sheet(refData)
    refWs['!cols'] = [{ wch: 20 }, { wch: 40 }]

    // Style reference header
    const refRange = XLSX.utils.decode_range(refWs['!ref'] || 'A1')
    for (let col = refRange.s.c; col <= refRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
      if (refWs[cellAddress]) {
        refWs[cellAddress].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'E6E6FA' } }
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, refWs, 'Institution Codes')
  }

  XLSX.writeFile(wb, `degree_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
```

## Column Width Guidelines

| Content Type | Width (wch) |
|-------------|-------------|
| Short codes | 15-20 |
| Names | 30-40 |
| Descriptions | 40-50 |
| Status/Boolean | 10-12 |
| Dates | 12-15 |
| Numbers | 10-15 |
| Email | 25-30 |
| URL | 40-50 |

## Notes

- Always mark mandatory fields with asterisk (*) in header
- Use red color (RGB: FF0000) for mandatory field headers
- Use light red background (RGB: FFE6E6) for mandatory cells
- Use gray background (RGB: F0F0F0) for optional field headers
- Add reference sheets for all foreign key fields
- Include sample data that demonstrates valid values
