---
name: import-export-advanced
description: >
  Advanced import/export skill for implementing Excel template generation with cascading dropdowns,
  bulk import with validation, and export functionality. This skill should be used when:
  (1) Adding import/export functionality to entity pages,
  (2) Creating Excel templates with dropdown validation (enum fields),
  (3) Implementing cascading/dependent dropdowns (hierarchical relationships like Institution -> Degree -> Department),
  (4) Building bulk upload with row-level validation and error reporting,
  (5) Creating export functionality (Excel/CSV/JSON formats).
  Automatically triggers when user mentions 'import', 'export', 'bulk upload', 'template', 'Excel',
  'XLSX', 'cascading dropdown', 'dependent dropdown', or 'hierarchical import'.
---

# Advanced Import/Export Skill

This skill provides comprehensive patterns for implementing import/export functionality with advanced features including cascading dropdowns, enum validation, and hierarchical data handling.

## When to Use This Skill

Use this skill when implementing any of the following:
- Excel template generation with dropdown validation
- Cascading/dependent dropdowns (1-level, 2-level, or 3-level hierarchies)
- Bulk import APIs with validation
- Import dialog components with error reporting
- Export functionality (Excel, CSV, JSON)
- Data table toolbar with Import/Export buttons

## Quick Reference: Implementation Checklist

For each module implementing import/export:

1. [ ] **Identify Field Types** (see Field Analysis section)
2. [ ] **Create Mapping Utility** (`lib/utils/mappings/[entity]-excel-mappings.ts`)
3. [ ] **Create Template API** (`app/api/organizations/[entity]/template/route.ts`)
4. [ ] **Create Import API** (`app/api/organizations/[entity]/import/route.ts`)
5. [ ] **Create ImportDialog Component** (`app/(routes)/.../[entity]/_components/import-dialog.tsx`)
6. [ ] **Update Data Table** (add Import/Export toolbar buttons)
7. [ ] **Remove Old Components** (delete legacy bulk-upload, export, download-template files)
8. [ ] **Verify Build** (`npx tsc --noEmit`)

## Step 1: Field Type Analysis

Before implementation, analyze the entity's fields to determine dropdown types:

### 1.1 Enum Fields (Simple Dropdowns)

Fields with fixed values that don't depend on other selections.

**Examples:**
- `status`: Active, Inactive
- `institution_type`: Self, Autonomous, Aided
- `program_type`: UG, PG, Ph.D
- `pattern_type`: Year, Semester
- `is_part_time`: Yes, No

**Implementation:** Use inline list validation with direct values from mapping file.

### 1.2 Foreign Key Fields (Cascading Dropdowns)

Fields that reference other tables and may depend on parent selections.

**Hierarchy Levels:**
- **1-Level**: Direct FK lookup (e.g., Institution Code dropdown)
- **2-Level**: Child depends on parent (e.g., Degree depends on Institution)
- **3-Level**: Grandchild depends on parent and grandparent (e.g., Department depends on Degree, which depends on Institution)

**Implementation:** Use OFFSET + MATCH formula for cascading validation.

### 1.3 Field Analysis Template

```
Entity: [ENTITY_NAME]
Table: [TABLE_NAME]

ENUM FIELDS (Simple Dropdowns):
- [field_name]: [Value1, Value2, Value3] -> Column [X]

FOREIGN KEY FIELDS:
- [parent_field]: References [parent_table] -> Column [X] (Level 1)
- [child_field]: References [child_table], depends on [parent_field] -> Column [Y] (Level 2)
- [grandchild_field]: References [grandchild_table], depends on [child_field] -> Column [Z] (Level 3)

FREE TEXT FIELDS:
- [field_name]: [description] -> Column [X]
```

## Step 2: Create Mapping Utility

Create a mapping file for enum fields.

**File:** `lib/utils/mappings/[entity]-excel-mappings.ts`

**Reference:** See `references/mapping-utility-pattern.md` for complete template.

**Key Exports:**
```typescript
// Display values for Excel dropdowns
export const EXCEL_[ENUM_NAME] = ['Value1', 'Value2', 'Value3'];

// Mapping functions
export function mapLabelToValue(label: string, type: string): string | null;
export function mapValueToLabel(value: string, type: string): string;
export function isValidLabel(label: string, type: string): boolean;
export function getValidLabels(type: string): string[];
```

## Step 3: Create Template API

The template API generates an Excel file with:
- Properly formatted headers
- Sample data row (yellow background)
- Dropdown validation for enum fields
- Cascading dropdowns for FK fields
- Hidden Lists sheet with reference data
- Instructions sheet

**File:** `app/api/organizations/[entity]/template/route.ts`

**Reference:** See `references/template-api-pattern.md` for complete implementation.

### 3.1 Cascading Dropdown Formula (OFFSET + MATCH)

For cascading dropdowns, use the OFFSET + MATCH formula pattern:

```typescript
// 2-Level Cascade: Column B depends on Column A
// Lists sheet: Row 1 has parent codes as headers, data below has child codes
const childOffsetFormula = `OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${endColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${endColLetter}$1,0)-1,100,1)),1)`;

// 3-Level Cascade: Column C depends on Column B
// Lists sheet has two sections: Section 1 for Level 1->2, Section 2 for Level 2->3
const grandchildOffsetFormula = `OFFSET(Lists!$${section2Start}$1,1,MATCH(B${row},Lists!$${section2Start}$1:$${section2End}$1,0)-1,COUNTA(OFFSET(Lists!$${section2Start}$1,1,MATCH(B${row},Lists!$${section2Start}$1:$${section2End}$1,0)-1,100,1)),1)`;
```

### 3.2 Lists Sheet Structure

**For 2-Level Cascade:**
```
| InstA | InstB | InstC | [sep] | AllInstitutions | Status | EnumField |
|-------|-------|-------|-------|-----------------|--------|-----------|
| Deg1  | Deg4  | Deg6  |       | InstA           | Active | Value1    |
| Deg2  | Deg5  |       |       | InstB           | Inactive| Value2   |
| Deg3  |       |       |       | InstC           |        | Value3    |
```

**For 3-Level Cascade:**
```
| InstA | InstB | [sep] | Deg1 | Deg2 | Deg3 | [sep] | AllInst | Status | Enum |
|-------|-------|-------|------|------|------|-------|---------|--------|------|
| Deg1  | Deg3  |       | Dp1  | Dp4  | Dp6  |       | InstA   | Active | V1   |
| Deg2  |       |       | Dp2  | Dp5  |      |       | InstB   | Inact  | V2   |
|       |       |       | Dp3  |      |      |       |         |        |      |
```

### 3.3 Column Reference Calculation

```typescript
// Helper function for column letters
const getColLetter = (colNum: number): string => {
  let letter = '';
  while (colNum > 0) {
    const rem = (colNum - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    colNum = Math.floor((colNum - 1) / 26);
  }
  return letter;
};

// Calculate reference column positions
// IMPORTANT: Count sections properly - separator adds 1 column
const section1EndCol = parentsWithChildren.length;
const section2StartCol = section1EndCol + 1;
const section2EndCol = section2StartCol + childrenWithGrandchildren.length - 1;
const refStartCol = section2EndCol + 2; // +2 for separator column
```

## Step 4: Create Import API

The import API handles:
- File upload and parsing (Excel/CSV)
- Row-by-row validation
- Enum field validation via mapping functions
- FK hierarchy validation
- Duplicate detection (within file and database)
- Batch insertion with error collection

**File:** `app/api/organizations/[entity]/import/route.ts`

**Reference:** See `references/import-api-pattern.md` for complete implementation.

### 4.1 Validation Flow

```
1. Parse Excel file
2. For each row:
   a. Validate required fields
   b. Map enum labels to values (using mapping utility)
   c. Validate FK hierarchy (parent exists, child belongs to parent)
   d. Check duplicates within file
   e. Collect errors or add to valid rows
3. Check duplicates against database
4. Insert valid rows
5. Return ImportResult with success/error counts
```

### 4.2 Hierarchy Validation Pattern

```typescript
// Level 1: Validate parent exists
const { data: institution } = await supabase
  .from('institutions')
  .select('id')
  .eq('counselling_code', row.institution_code)
  .maybeSingle();

if (!institution) {
  errors.push({ row, field: 'institution_code', message: 'Institution not found' });
  continue;
}

// Level 2: Validate child belongs to parent
const { data: degree } = await supabase
  .from('degrees')
  .select('id')
  .eq('degree_id', row.degree_id)
  .eq('institution_id', institution.id)
  .maybeSingle();

if (!degree) {
  errors.push({ row, field: 'degree_id', message: 'Degree not found for this institution' });
  continue;
}

// Level 3: Validate grandchild belongs to child
const { data: department } = await supabase
  .from('departments')
  .select('id')
  .eq('department_code', row.department_code)
  .eq('degree_id', degree.id)
  .maybeSingle();
```

## Step 5: Create ImportDialog Component

The ImportDialog component provides:
- Drag & drop file upload
- Progress tracking
- Error display with row numbers
- Template download shortcut
- Success/failure summary

**File:** `app/(routes)/.../[entity]/_components/import-dialog.tsx`

**Reference:** See `references/import-dialog-pattern.md` for complete component.

### 5.1 Key Props

```typescript
interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}
```

### 5.2 API Endpoints

```typescript
// Import endpoint
const response = await fetch('/api/organizations/[entity]/import', {
  method: 'POST',
  body: formData  // FormData with 'file' field
});

// Template endpoint
const response = await fetch('/api/organizations/[entity]/template');
```

## Step 6: Update Data Table

Add Import/Export buttons to the data table toolbar.

**Reference:** See `references/data-table-toolbar-pattern.md` for integration pattern.

### 6.1 Required State

```typescript
const [importOpen, setImportOpen] = useState(false);
const [refreshTrigger, setRefreshTrigger] = useState(0);
```

### 6.2 Toolbar Structure

```tsx
<div className='flex items-center gap-2'>
  <Button onClick={() => router.push('/path/to/new')}>
    <Plus className='mr-2 h-4 w-4' /> Add [Entity]
  </Button>

  <Button variant='outline' onClick={() => setImportOpen(true)}>
    <Upload className='mr-2 h-4 w-4' /> Import
  </Button>

  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant='outline'>
        <Download className='mr-2 h-4 w-4' /> Export <ChevronDown className='ml-2 h-4 w-4' />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end'>
      <DropdownMenuItem onClick={handleExportExcel}>
        <FileSpreadsheet className='mr-2 h-4 w-4' /> Export as Excel
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleExportCSV}>
        <FileText className='mr-2 h-4 w-4' /> Export as CSV
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleExportJSON}>
        <FileJson className='mr-2 h-4 w-4' /> Export as JSON
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleDownloadTemplate}>
        <Download className='mr-2 h-4 w-4' /> Download Template
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>

<ImportDialog
  open={importOpen}
  onOpenChange={setImportOpen}
  onImportComplete={handleImportComplete}
/>
```

## Step 7: Remove Old Components

Delete legacy components after migration:

```bash
# Files to delete (if they exist)
rm app/(routes)/.../[entity]/_components/bulk-upload-[entity].tsx
rm app/(routes)/.../[entity]/_components/export-[entity].tsx
rm app/(routes)/.../[entity]/_components/download-[entity]-template.tsx
```

Also remove old imports from filter components.

## Common Patterns Reference

### Standard Response Format

```typescript
interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
  duplicateCodes?: string[];
}
```

### Excel Styling Constants

```typescript
// Header style (blue background, white text)
row.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

// Sample row style (yellow background, dark text)
row.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };

// Data row style
row.font = { name: 'Arial', size: 10, color: { argb: 'FF374151' } };
```

### Required Imports

```typescript
// Template API
import ExcelJS from 'exceljs';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Import API
import * as XLSX from 'xlsx';
import { z } from 'zod';

// ImportDialog
import { Dialog, DialogContent, ... } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import toast from 'react-hot-toast';

// Data Table
import { DropdownMenu, ... } from '@/components/ui/dropdown-menu';
import { Upload, Download, ChevronDown, FileSpreadsheet, FileText, FileJson } from 'lucide-react';
```

## Troubleshooting

### Dropdown Shows Wrong Values

**Symptom:** A dropdown column shows values from wrong column (e.g., Status values in Institution Code column)

**Cause:** Column reference calculation is off by 1 or more

**Fix:** Verify column counting in Lists sheet:
```typescript
// Count all columns correctly
// Section 1 columns + Section 2 columns + separator(1) + reference columns
const allInstColNum = section2EndCol + 2; // +2 accounts for separator
```

### Cascading Dropdown Not Working

**Symptom:** Child dropdown doesn't filter based on parent selection

**Cause:** OFFSET formula references wrong columns or Lists sheet structure is incorrect

**Fix:**
1. Verify Lists sheet has parent codes as headers (Row 1)
2. Verify child codes are in correct columns below headers
3. Check MATCH formula range matches header row range
4. Test formula manually in Excel first

### Import Fails with FK Error

**Symptom:** Import fails saying FK not found even when data looks correct

**Cause:** Case sensitivity or whitespace issues

**Fix:** Normalize input in import API:
```typescript
const code = String(getCellValue(row.getCell(1).value)).trim().toUpperCase();
```

## File References

For complete implementation examples, see the reference files:
- `references/mapping-utility-pattern.md` - Enum mapping utility template
- `references/template-api-pattern.md` - Template API with cascading dropdowns
- `references/import-api-pattern.md` - Import API with validation
- `references/import-dialog-pattern.md` - ImportDialog component
- `references/data-table-toolbar-pattern.md` - Data table integration
