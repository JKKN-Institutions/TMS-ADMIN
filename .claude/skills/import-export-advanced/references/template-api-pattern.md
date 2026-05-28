# Template API Pattern

This file provides the complete pattern for creating Excel template APIs with cascading dropdowns.

## File Location

`app/api/organizations/[entity]/template/route.ts`

## Complete Template (3-Level Cascading)

```typescript
// app/api/organizations/[entity]/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {
  EXCEL_ENUM_FIELD1,
  EXCEL_ENUM_FIELD2,
  EXCEL_IS_ACTIVE
} from '@/lib/utils/mappings/[entity]-excel-mappings';

/**
 * GET /api/organizations/[entity]/template
 *
 * Generates an Excel template with cascading dropdown validation
 *
 * Features:
 * - Pre-formatted columns with proper widths
 * - N-level cascading dropdowns (configurable)
 * - Enum dropdowns for fixed-value fields
 * - Sample row with placeholder data
 * - Instructions sheet
 */
export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ============================================================
    // 2. FETCH REFERENCE DATA FOR CASCADING DROPDOWNS
    // ============================================================

    // Level 1: Top-level parent (e.g., Institutions)
    const { data: level1Data, error: level1Error } = await supabase
      .from('institutions')
      .select('counselling_code, name')
      .eq('is_active', true)
      .order('counselling_code');

    if (level1Error) {
      console.error('[template] Error fetching level 1 data:', level1Error);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: level1Error.message },
        { status: 500 }
      );
    }

    const level1Codes = level1Data?.map((i) => i.counselling_code).filter(Boolean) || [];

    // Level 2: Children of Level 1 (e.g., Degrees with institution reference)
    const { data: level2Data, error: level2Error } = await supabase
      .from('degrees')
      .select('degree_id, degree_name, institution_id, institutions!inner(counselling_code)')
      .eq('is_active', true)
      .order('degree_id');

    if (level2Error) {
      console.error('[template] Error fetching level 2 data:', level2Error);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: level2Error.message },
        { status: 500 }
      );
    }

    // Level 3: Grandchildren of Level 1 (e.g., Departments with degree reference)
    const { data: level3Data, error: level3Error } = await supabase
      .from('departments')
      .select('department_code, department_name, degree_id, degrees!inner(degree_id)')
      .eq('is_active', true)
      .order('department_code');

    if (level3Error) {
      console.error('[template] Error fetching level 3 data:', level3Error);
      return NextResponse.json(
        { error: 'Failed to fetch departments', message: level3Error.message },
        { status: 500 }
      );
    }

    // ============================================================
    // 3. BUILD HIERARCHICAL GROUPINGS
    // ============================================================

    // Group level 2 by level 1 (degrees by institution)
    const level2ByLevel1 = new Map<string, string[]>();
    level2Data?.forEach((d: any) => {
      const parentCode = d.institutions?.counselling_code;
      if (parentCode) {
        if (!level2ByLevel1.has(parentCode)) {
          level2ByLevel1.set(parentCode, []);
        }
        level2ByLevel1.get(parentCode)!.push(d.degree_id);
      }
    });

    // Group level 3 by level 2 (departments by degree)
    const level3ByLevel2 = new Map<string, string[]>();
    level3Data?.forEach((d: any) => {
      const parentCode = d.degrees?.degree_id;
      if (parentCode) {
        if (!level3ByLevel2.has(parentCode)) {
          level3ByLevel2.set(parentCode, []);
        }
        level3ByLevel2.get(parentCode)!.push(d.department_code);
      }
    });

    // ============================================================
    // 4. CREATE EXCEL WORKBOOK
    // ============================================================
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Main Data Sheet
    // ============================================================
    const worksheet = workbook.addWorksheet('[Entity]');

    // Define columns - adjust for your entity
    worksheet.columns = [
      { header: 'Counselling Code', key: 'counselling_code', width: 20 },    // A - Level 1 FK
      { header: 'Degree ID', key: 'degree_id', width: 20 },                  // B - Level 2 FK (cascade)
      { header: 'Department Code', key: 'department_code', width: 20 },      // C - Level 3 FK (cascade)
      { header: '[Entity] ID', key: 'entity_id', width: 20 },                // D - Primary identifier
      { header: '[Entity] Name', key: 'entity_name', width: 40 },            // E - Name
      { header: 'Enum Field 1', key: 'enum_field1', width: 15 },             // F - Enum dropdown
      { header: 'Display Name', key: 'display_name', width: 25 },            // G - Optional
      { header: 'Order', key: 'order', width: 12 },                          // H - Numeric
      { header: 'Enum Field 2', key: 'enum_field2', width: 15 },             // I - Enum dropdown
      { header: 'Is Active', key: 'is_active', width: 12 }                   // J - Status dropdown
    ];

    // Style header row
    worksheet.getRow(1).font = {
      bold: true,
      size: 11,
      name: 'Arial',
      color: { argb: 'FFFFFFFF' }
    };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }  // Blue background
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 22;

    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ============================================================
    // 5. ADD SAMPLE ROW
    // ============================================================
    const sampleLevel1 = level1Codes[0] || 'INST001';
    const sampleLevel2Items = level2ByLevel1.get(sampleLevel1) || [];
    const sampleLevel2 = sampleLevel2Items[0] || level2Data?.[0]?.degree_id || 'BTECH';
    const sampleLevel3Items = level3ByLevel2.get(sampleLevel2) || [];
    const sampleLevel3 = sampleLevel3Items[0] || level3Data?.[0]?.department_code || 'CSE';

    worksheet.addRow({
      counselling_code: sampleLevel1,
      degree_id: sampleLevel2,
      department_code: sampleLevel3,
      entity_id: 'ENTITY01',
      entity_name: 'Sample Entity Name',
      enum_field1: EXCEL_ENUM_FIELD1[0],
      display_name: 'Sample',
      order: 1,
      enum_field2: EXCEL_ENUM_FIELD2[0],
      is_active: 'Active'
    });

    // Style sample row (yellow background)
    worksheet.getRow(2).font = {
      name: 'Arial',
      size: 10,
      color: { argb: 'FF1F2937' }
    };
    worksheet.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFBEB' }  // Yellow background
    };
    worksheet.getRow(2).alignment = { vertical: 'middle' };

    // Add note to sample row
    const noteCell = worksheet.getCell('A2');
    noteCell.note = {
      texts: [
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row\n' },
        { font: { size: 9 }, text: 'Replace this row with your actual data.\nYou can delete this row after adding your data.' }
      ]
    };

    // Style data rows
    for (let row = 3; row <= 100; row++) {
      worksheet.getRow(row).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF374151' }
      };
    }

    // ============================================================
    // SHEET 2: Lists (Reference Data for Dropdowns)
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Get parents that have children
    const level1WithLevel2 = level1Codes.filter(code =>
      level2ByLevel1.has(code) && level2ByLevel1.get(code)!.length > 0
    );

    // Get level 2 items that have level 3 children
    const level2WithLevel3 = Array.from(level3ByLevel2.keys());

    // Calculate section boundaries
    const section1EndCol = level1WithLevel2.length;
    const section2StartCol = section1EndCol + 1;
    const section2EndCol = section2StartCol + level2WithLevel3.length - 1;
    const refStartCol = section2EndCol + 2;  // +2 for separator

    // Build header row for Lists sheet
    const headerRow: string[] = [
      ...level1WithLevel2,    // Section 1: Level 1 codes as headers
      ...level2WithLevel3,    // Section 2: Level 2 codes as headers
      '',                     // Separator
      'AllLevel1',            // Reference: All level 1 codes
      'Status',               // Reference: Status values
      'EnumField1',           // Reference: Enum field 1 values
      'EnumField2'            // Reference: Enum field 2 values
    ];
    listsSheet.addRow(headerRow);
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Calculate max data rows
    const maxLevel2PerLevel1 = Math.max(
      ...Array.from(level2ByLevel1.values()).map(arr => arr.length),
      1
    );
    const maxLevel3PerLevel2 = Math.max(
      ...Array.from(level3ByLevel2.values()).map(arr => arr.length),
      1
    );
    const maxRefValues = Math.max(
      level1Codes.length,
      EXCEL_IS_ACTIVE.length,
      EXCEL_ENUM_FIELD1.length,
      EXCEL_ENUM_FIELD2.length
    );
    const maxDataRows = Math.max(maxLevel2PerLevel1, maxLevel3PerLevel2, maxRefValues);

    // Add data rows
    for (let i = 0; i < maxDataRows; i++) {
      const rowData: string[] = [];

      // Section 1: Level 2 items for each Level 1
      level1WithLevel2.forEach(level1Code => {
        const children = level2ByLevel1.get(level1Code) || [];
        rowData.push(children[i] || '');
      });

      // Section 2: Level 3 items for each Level 2
      level2WithLevel3.forEach(level2Code => {
        const children = level3ByLevel2.get(level2Code) || [];
        rowData.push(children[i] || '');
      });

      // Separator
      rowData.push('');

      // Reference columns
      rowData.push(level1Codes[i] || '');       // AllLevel1
      rowData.push(EXCEL_IS_ACTIVE[i] || '');   // Status
      rowData.push(EXCEL_ENUM_FIELD1[i] || ''); // EnumField1
      rowData.push(EXCEL_ENUM_FIELD2[i] || ''); // EnumField2

      listsSheet.addRow(rowData);
    }

    // Set column widths
    for (let i = 1; i <= headerRow.length; i++) {
      listsSheet.getColumn(i).width = 15;
    }

    // ============================================================
    // 6. DATA VALIDATION (Dropdowns)
    // ============================================================

    const validationEndRow = 100;

    // Helper to get column letter
    const getColLetter = (colNum: number): string => {
      let letter = '';
      while (colNum > 0) {
        const rem = (colNum - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        colNum = Math.floor((colNum - 1) / 26);
      }
      return letter;
    };

    // Calculate column letters for reference sections
    // IMPORTANT: Count correctly - separator adds 1 column
    const allLevel1ColNum = section2EndCol + 2;  // After separator
    const allLevel1ColLetter = getColLetter(allLevel1ColNum);
    const statusColLetter = getColLetter(allLevel1ColNum + 1);
    const enum1ColLetter = getColLetter(allLevel1ColNum + 2);
    const enum2ColLetter = getColLetter(allLevel1ColNum + 3);

    // Section boundary letters for OFFSET formulas
    const section1EndColLetter = getColLetter(section1EndCol);
    const section2StartColLetter = getColLetter(section2StartCol);
    const section2EndColLetter = getColLetter(section2EndCol);

    // Apply validation cell-by-cell
    for (let row = 2; row <= validationEndRow; row++) {
      // Column A: Level 1 dropdown (simple list)
      if (level1Codes.length > 0) {
        worksheet.getCell(`A${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${allLevel1ColLetter}$2:$${allLevel1ColLetter}$${level1Codes.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select from the dropdown'
        };
      }

      // Column B: Level 2 dropdown (CASCADES from Column A)
      if (level1WithLevel2.length > 0) {
        const level2OffsetFormula = `OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${section1EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${section1EndColLetter}$1,0)-1,100,1)),1)`;

        worksheet.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [level2OffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Level 1 first, then choose from dropdown'
        };
      }

      // Column C: Level 3 dropdown (CASCADES from Column B)
      if (level2WithLevel3.length > 0) {
        const level3OffsetFormula = `OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,100,1)),1)`;

        worksheet.getCell(`C${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [level3OffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Level 2 first, then choose from dropdown'
        };
      }

      // Column F: Enum Field 1 dropdown
      worksheet.getCell(`F${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${enum1ColLetter}$2:$${enum1ColLetter}$${EXCEL_ENUM_FIELD1.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_ENUM_FIELD1.join(', ')}`
      };

      // Column I: Enum Field 2 dropdown
      worksheet.getCell(`I${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${enum2ColLetter}$2:$${enum2ColLetter}$${EXCEL_ENUM_FIELD2.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_ENUM_FIELD2.join(', ')}`
      };

      // Column J: Is Active dropdown
      worksheet.getCell(`J${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${statusColLetter}$2:$${statusColLetter}$${EXCEL_IS_ACTIVE.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_IS_ACTIVE.join(', ')}`
      };
    }

    // ============================================================
    // SHEET 3: Instructions
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK [ENTITY] IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Counselling Code: Select from dropdown (existing institution)',
      '   - Degree ID: Select from CASCADING dropdown (filters based on Institution)',
      '   - Department Code: Select from CASCADING dropdown (filters based on Degree)',
      '   - [Entity] ID: Unique identifier',
      '   - [Entity] Name: Full name',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Enum Field 1: Select from dropdown',
      '   - Display Name: Short display name',
      '   - Order: Numeric order for sorting',
      '   - Enum Field 2: Select from dropdown',
      '   - Is Active: Active/Inactive (defaults to Active if blank)',
      '',
      '3. CASCADING DROPDOWN BEHAVIOR:',
      '   - Step 1: Select Counselling Code (Column A) FIRST',
      '   - Step 2: Select Degree ID (Column B) - shows ONLY degrees for that institution',
      '   - Step 3: Select Department Code (Column C) - shows ONLY departments for that degree',
      '   - If you change a parent selection, you MUST re-select child values',
      '',
      '4. DATA VALIDATION:',
      '   - NEVER type values manually - always use dropdowns',
      '   - Invalid values will be rejected during import',
      '',
      '5. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      'For support, contact your system administrator.'
    ];

    instructions.forEach((line, index) => {
      const row = instructionsSheet.addRow([line]);
      if (index === 0) {
        row.font = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF1E3A8A' } };
      } else if (line.match(/^\d+\./)) {
        row.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF1F2937' } };
      } else {
        row.font = { size: 10, name: 'Arial', color: { argb: 'FF374151' } };
      }
    });

    // Hide Lists sheet
    listsSheet.state = 'hidden';

    // ============================================================
    // 7. GENERATE AND RETURN FILE
    // ============================================================
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=[entity]-template-${new Date().toISOString().split('T')[0]}.xlsx`
      }
    });
  } catch (error) {
    console.error('[organizations/[entity]/template] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate template', message: errorMessage },
      { status: 500 }
    );
  }
}
```

## OFFSET Formula Explained

The OFFSET formula creates dynamic cascading dropdowns:

```
OFFSET(Lists!$A$1, 1, MATCH(A2,Lists!$A$1:$Z$1,0)-1, COUNTA(OFFSET(Lists!$A$1,1,MATCH(A2,Lists!$A$1:$Z$1,0)-1,100,1)), 1)
```

**Breakdown:**
1. `Lists!$A$1` - Starting reference point (top-left of Lists sheet)
2. `1` - Move down 1 row (skip header)
3. `MATCH(A2,Lists!$A$1:$Z$1,0)-1` - Find column where parent value is header, subtract 1 for 0-based offset
4. `COUNTA(...)` - Count non-empty cells in that column (dynamic height)
5. `1` - Width of 1 column

**Lists Sheet Structure:**
```
| ParentA | ParentB | ParentC |  <- Headers (Row 1)
| Child1  | Child4  | Child6  |  <- Data starts (Row 2)
| Child2  | Child5  |         |
| Child3  |         |         |
```

When user selects "ParentB" in Column A:
- MATCH finds "ParentB" at column 2
- OFFSET returns the range containing Child4, Child5
