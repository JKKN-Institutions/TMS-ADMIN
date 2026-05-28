# Import API Pattern

This file provides the complete pattern for creating import APIs with hierarchical validation.

## File Location

`app/api/organizations/[entity]/import/route.ts`

## Complete Template

```typescript
// app/api/organizations/[entity]/import/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import {
  mapLabelToValue,
  isValidLabel,
  getValidLabels
} from '@/lib/utils/mappings/[entity]-excel-mappings';

/**
 * POST /api/organizations/[entity]/import
 *
 * Imports entities from an Excel file with validation
 *
 * Features:
 * - Excel file parsing
 * - Row-by-row validation
 * - Enum field mapping
 * - Hierarchical FK validation
 * - Duplicate detection (file + database)
 * - Detailed error reporting
 */

// ============================================================
// TYPE DEFINITIONS
// ============================================================

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

// ============================================================
// VALIDATION SCHEMA
// ============================================================

const entityRowSchema = z.object({
  // Foreign keys (for hierarchical validation)
  institution_code: z.string().min(1, 'Institution code is required'),
  degree_id: z.string().min(1, 'Degree ID is required'),
  department_code: z.string().min(1, 'Department code is required'),

  // Primary identifier
  entity_id: z
    .string()
    .min(2, 'Entity ID must be at least 2 characters')
    .max(50, 'Entity ID must be at most 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Entity ID can only contain letters, numbers, underscore, and hyphen'),

  // Required fields
  entity_name: z
    .string()
    .min(2, 'Entity name must be at least 2 characters')
    .max(255, 'Entity name must be at most 255 characters'),

  // Optional enum fields
  enum_field1: z.string().optional(),
  enum_field2: z.string().optional(),

  // Optional text fields
  display_name: z.string().max(100).optional(),
  order: z.number().optional(),

  // Status
  is_active: z.boolean().default(true)
});

type EntityRow = z.infer<typeof entityRowSchema>;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Safely extract cell value from Excel cell
 */
function getCellValue(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) return '';
  if (typeof cellValue === 'object') {
    if (cellValue.richText) {
      return cellValue.richText.map((t: any) => t.text).join('');
    }
    if (cellValue.text) return String(cellValue.text);
    if (cellValue.result !== undefined) return String(cellValue.result);
    return '';
  }
  return String(cellValue).trim();
}

/**
 * Parse a single Excel row into entity object
 */
function parseExcelRow(row: XLSX.CellObject[], rowNumber: number): {
  data: Partial<EntityRow> | null;
  errors: ImportError[];
} {
  const errors: ImportError[] = [];

  // Extract values from columns (A=0, B=1, etc.)
  const institutionCode = getCellValue(row[0]?.v);
  const degreeId = getCellValue(row[1]?.v);
  const departmentCode = getCellValue(row[2]?.v);
  const entityId = getCellValue(row[3]?.v);
  const entityName = getCellValue(row[4]?.v);
  const enumField1Label = getCellValue(row[5]?.v);
  const displayName = getCellValue(row[6]?.v);
  const orderStr = getCellValue(row[7]?.v);
  const enumField2Label = getCellValue(row[8]?.v);
  const isActiveLabel = getCellValue(row[9]?.v);

  // Skip completely empty rows
  if (!institutionCode && !entityId && !entityName) {
    return { data: null, errors: [] };
  }

  // Validate required fields
  if (!institutionCode) {
    errors.push({ row: rowNumber, field: 'institution_code', message: 'Institution code is required' });
  }
  if (!degreeId) {
    errors.push({ row: rowNumber, field: 'degree_id', message: 'Degree ID is required' });
  }
  if (!departmentCode) {
    errors.push({ row: rowNumber, field: 'department_code', message: 'Department code is required' });
  }
  if (!entityId) {
    errors.push({ row: rowNumber, field: 'entity_id', message: 'Entity ID is required' });
  }
  if (!entityName) {
    errors.push({ row: rowNumber, field: 'entity_name', message: 'Entity name is required' });
  }

  // Map enum fields
  let enumField1: string | undefined;
  if (enumField1Label) {
    const mapped = mapLabelToValue(enumField1Label, 'enumField1');
    if (mapped) {
      enumField1 = mapped;
    } else {
      errors.push({
        row: rowNumber,
        field: 'enum_field1',
        message: `Invalid value "${enumField1Label}". Valid values: ${getValidLabels('enumField1').join(', ')}`
      });
    }
  }

  let enumField2: string | undefined;
  if (enumField2Label) {
    const mapped = mapLabelToValue(enumField2Label, 'enumField2');
    if (mapped) {
      enumField2 = mapped;
    } else {
      errors.push({
        row: rowNumber,
        field: 'enum_field2',
        message: `Invalid value "${enumField2Label}". Valid values: ${getValidLabels('enumField2').join(', ')}`
      });
    }
  }

  // Map is_active
  let isActive = true; // Default to active
  if (isActiveLabel) {
    const mapped = mapLabelToValue(isActiveLabel, 'isActive');
    if (mapped !== null) {
      isActive = mapped === 'true';
    } else {
      errors.push({
        row: rowNumber,
        field: 'is_active',
        message: `Invalid status "${isActiveLabel}". Valid values: Active, Inactive`
      });
    }
  }

  // Parse numeric fields
  let order: number | undefined;
  if (orderStr) {
    const parsed = parseInt(orderStr, 10);
    if (isNaN(parsed)) {
      errors.push({
        row: rowNumber,
        field: 'order',
        message: `Invalid order "${orderStr}". Must be a number.`
      });
    } else {
      order = parsed;
    }
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  return {
    data: {
      institution_code: institutionCode,
      degree_id: degreeId,
      department_code: departmentCode,
      entity_id: entityId,
      entity_name: entityName,
      enum_field1: enumField1,
      display_name: displayName || undefined,
      order,
      enum_field2: enumField2,
      is_active: isActive
    },
    errors: []
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(request: NextRequest): Promise<NextResponse<ImportResult>> {
  try {
    // ============================================================
    // 1. AUTHENTICATION
    // ============================================================
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: 'Unauthorized' }]
      }, { status: 401 });
    }

    // ============================================================
    // 2. PARSE FILE
    // ============================================================
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: 'No file provided' }]
      }, { status: 400 });
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' }]
      }, { status: 400 });
    }

    // Parse Excel file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Get rows as array of arrays
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: ''
    });

    // Skip header row
    const dataRows = rows.slice(1).filter(row =>
      row.some(cell => cell !== null && cell !== undefined && cell !== '')
    );

    if (dataRows.length === 0) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: 'No data rows found in the file' }]
      }, { status: 400 });
    }

    // ============================================================
    // 3. PARSE AND VALIDATE ROWS
    // ============================================================
    const allErrors: ImportError[] = [];
    const validRows: { rowNumber: number; data: EntityRow }[] = [];
    const codeMap = new Map<string, number[]>(); // Track duplicates within file

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2; // +2 for header row and 0-based index
      const row = dataRows[i];

      // Convert row array to cell objects for parseExcelRow
      const cellObjects = row.map((value: any) => ({ v: value }));
      const { data, errors } = parseExcelRow(cellObjects, rowNumber);

      if (errors.length > 0) {
        allErrors.push(...errors);
        continue;
      }

      if (!data) continue; // Empty row

      // Track duplicates within file
      const uniqueKey = `${data.department_code}:${data.entity_id}`;
      if (!codeMap.has(uniqueKey)) {
        codeMap.set(uniqueKey, []);
      }
      codeMap.get(uniqueKey)!.push(rowNumber);

      // Validate with Zod schema
      const validation = entityRowSchema.safeParse(data);
      if (!validation.success) {
        validation.error.errors.forEach(err => {
          allErrors.push({
            row: rowNumber,
            field: err.path.join('.'),
            message: err.message
          });
        });
        continue;
      }

      validRows.push({ rowNumber, data: validation.data });
    }

    // ============================================================
    // 4. CHECK DUPLICATES WITHIN FILE
    // ============================================================
    const duplicateCodes: string[] = [];
    codeMap.forEach((rowNumbers, code) => {
      if (rowNumbers.length > 1) {
        duplicateCodes.push(`Entity "${code.split(':')[1]}" appears in rows: ${rowNumbers.join(', ')}`);
      }
    });

    if (duplicateCodes.length > 0) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: duplicateCodes.length,
        totalRows: dataRows.length,
        errors: [],
        duplicateCodes
      });
    }

    // If there are validation errors, stop here
    if (allErrors.length > 0) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows: dataRows.length,
        errors: allErrors
      });
    }

    // ============================================================
    // 5. VALIDATE HIERARCHICAL RELATIONSHIPS
    // ============================================================
    const validatedRows: {
      rowNumber: number;
      data: EntityRow;
      institutionId: string;
      degreeId: string;
      departmentId: string;
    }[] = [];

    for (const { rowNumber, data } of validRows) {
      // Level 1: Validate institution exists
      const { data: institution, error: instError } = await supabase
        .from('institutions')
        .select('id')
        .eq('counselling_code', data.institution_code)
        .maybeSingle();

      if (instError || !institution) {
        allErrors.push({
          row: rowNumber,
          field: 'institution_code',
          message: `Institution "${data.institution_code}" not found`
        });
        continue;
      }

      // Level 2: Validate degree exists AND belongs to institution
      const { data: degree, error: degreeError } = await supabase
        .from('degrees')
        .select('id')
        .eq('degree_id', data.degree_id)
        .eq('institution_id', institution.id)
        .maybeSingle();

      if (degreeError || !degree) {
        allErrors.push({
          row: rowNumber,
          field: 'degree_id',
          message: `Degree "${data.degree_id}" not found for institution "${data.institution_code}"`
        });
        continue;
      }

      // Level 3: Validate department exists AND belongs to degree
      const { data: department, error: deptError } = await supabase
        .from('departments')
        .select('id')
        .eq('department_code', data.department_code)
        .eq('degree_id', degree.id)
        .maybeSingle();

      if (deptError || !department) {
        allErrors.push({
          row: rowNumber,
          field: 'department_code',
          message: `Department "${data.department_code}" not found for degree "${data.degree_id}"`
        });
        continue;
      }

      // Check for duplicate in database
      const { data: existing } = await supabase
        .from('[entity_table]')
        .select('id')
        .eq('entity_id', data.entity_id)
        .eq('department_id', department.id)
        .maybeSingle();

      if (existing) {
        allErrors.push({
          row: rowNumber,
          field: 'entity_id',
          message: `Entity ID "${data.entity_id}" already exists in department "${data.department_code}"`
        });
        continue;
      }

      validatedRows.push({
        rowNumber,
        data,
        institutionId: institution.id,
        degreeId: degree.id,
        departmentId: department.id
      });
    }

    // If there are validation errors, stop here
    if (allErrors.length > 0) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows: dataRows.length,
        errors: allErrors
      });
    }

    // ============================================================
    // 6. INSERT VALID ROWS
    // ============================================================
    let successCount = 0;

    for (const { rowNumber, data, institutionId, degreeId, departmentId } of validatedRows) {
      const insertData = {
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        entity_id: data.entity_id,
        entity_name: data.entity_name,
        enum_field1: data.enum_field1,
        display_name: data.display_name,
        entity_order: data.order,
        enum_field2: data.enum_field2,
        is_active: data.is_active,
        created_by: user.id,
        updated_by: user.id
      };

      const { error: insertError } = await supabase
        .from('[entity_table]')
        .insert(insertData);

      if (insertError) {
        console.error(`[import] Row ${rowNumber} insert error:`, insertError);
        allErrors.push({
          row: rowNumber,
          message: `Database error: ${insertError.message}`
        });
      } else {
        successCount++;
      }
    }

    // ============================================================
    // 7. RETURN RESULT
    // ============================================================
    return NextResponse.json({
      success: allErrors.length === 0,
      successCount,
      errorCount: allErrors.length,
      totalRows: dataRows.length,
      errors: allErrors
    });

  } catch (error) {
    console.error('[import] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      successCount: 0,
      errorCount: 1,
      totalRows: 0,
      errors: [{ row: 0, message: `Server error: ${errorMessage}` }]
    }, { status: 500 });
  }
}
```

## Key Validation Patterns

### 1. Enum Field Validation

```typescript
const enumLabel = getCellValue(row[5]?.v);
if (enumLabel) {
  const mapped = mapLabelToValue(enumLabel, 'enumField1');
  if (mapped) {
    data.enum_field1 = mapped;
  } else {
    errors.push({
      row: rowNumber,
      field: 'enum_field1',
      message: `Invalid value "${enumLabel}". Valid values: ${getValidLabels('enumField1').join(', ')}`
    });
  }
}
```

### 2. Hierarchical FK Validation

```typescript
// Level 1 -> Level 2 -> Level 3 validation
// Each level must exist AND belong to its parent

// Institution (Level 1)
const { data: institution } = await supabase
  .from('institutions')
  .select('id')
  .eq('counselling_code', row.institution_code)
  .maybeSingle();

if (!institution) {
  errors.push({ row, field: 'institution_code', message: 'Not found' });
  continue;
}

// Degree (Level 2) - must belong to Institution
const { data: degree } = await supabase
  .from('degrees')
  .select('id')
  .eq('degree_id', row.degree_id)
  .eq('institution_id', institution.id)  // FK check
  .maybeSingle();

if (!degree) {
  errors.push({ row, field: 'degree_id', message: 'Not found for this institution' });
  continue;
}

// Department (Level 3) - must belong to Degree
const { data: department } = await supabase
  .from('departments')
  .select('id')
  .eq('department_code', row.department_code)
  .eq('degree_id', degree.id)  // FK check
  .maybeSingle();
```

### 3. Duplicate Detection

```typescript
// Within file
const codeMap = new Map<string, number[]>();
rows.forEach((row, index) => {
  const uniqueKey = `${row.parent_id}:${row.entity_id}`;
  if (!codeMap.has(uniqueKey)) {
    codeMap.set(uniqueKey, []);
  }
  codeMap.get(uniqueKey)!.push(index + 2);
});

const duplicates = Array.from(codeMap.entries())
  .filter(([_, rows]) => rows.length > 1)
  .map(([code, rows]) => `Code "${code}" in rows: ${rows.join(', ')}`);

// Against database
const { data: existing } = await supabase
  .from('entities')
  .select('id')
  .eq('entity_id', row.entity_id)
  .eq('parent_id', parentId)
  .maybeSingle();

if (existing) {
  errors.push({ row, field: 'entity_id', message: 'Already exists' });
}
```

### 4. Safe Cell Value Extraction

```typescript
function getCellValue(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) return '';

  // Handle rich text
  if (typeof cellValue === 'object') {
    if (cellValue.richText) {
      return cellValue.richText.map((t: any) => t.text).join('');
    }
    if (cellValue.text) return String(cellValue.text);
    if (cellValue.result !== undefined) return String(cellValue.result);
    return '';
  }

  return String(cellValue).trim();
}
```
