# Mapping Utility Pattern

This file provides the complete pattern for creating enum mapping utilities for Excel import/export.

## File Location

`lib/utils/mappings/[entity]-excel-mappings.ts`

## Complete Template

```typescript
/**
 * [Entity] Excel Field Mappings
 *
 * This module provides mappings between Excel display values and database values
 * for [entity] enum fields.
 *
 * ENUM FIELDS:
 * - [field1]: [Description]
 * - [field2]: [Description]
 * - is_active: Active/Inactive status
 */

// ============================================================
// FIELD 1: [Field Name] Mapping
// Database values: [list db values]
// Excel display: [list display values]
// ============================================================

export const FIELD1_MAPPING: Record<string, string> = {
  'display_value_1': 'db_value_1',
  'display value 1': 'db_value_1', // Alternative format
  'db_value_1': 'db_value_1',      // Allow DB value as input
  'display_value_2': 'db_value_2',
  'display value 2': 'db_value_2',
  'db_value_2': 'db_value_2'
};

// Display values for Excel dropdown (order matters - first is default)
export const EXCEL_FIELD1 = ['Display Value 1', 'Display Value 2'];

// ============================================================
// FIELD 2: [Field Name] Mapping (if applicable)
// ============================================================

export const FIELD2_MAPPING: Record<string, string> = {
  // Add mappings
};

export const EXCEL_FIELD2 = ['Value1', 'Value2'];

// ============================================================
// IS_ACTIVE: Status Mapping (standard across all entities)
// ============================================================

export const IS_ACTIVE_MAPPING: Record<string, string> = {
  'active': 'true',
  'inactive': 'false',
  'yes': 'true',
  'no': 'false',
  'true': 'true',
  'false': 'false',
  '1': 'true',
  '0': 'false'
};

// Display values for Excel dropdown
export const EXCEL_IS_ACTIVE = ['Active', 'Inactive'];

// ============================================================
// MAPPING FUNCTIONS
// ============================================================

/**
 * Map Excel display label to database value
 *
 * @param label - The Excel display value (case-insensitive)
 * @param type - The field type identifier
 * @returns Database value or null if not found
 *
 * @example
 * mapLabelToValue('UG', 'programType') // returns 'UG'
 * mapLabelToValue('Active', 'isActive') // returns 'true'
 */
export function mapLabelToValue(
  label: string,
  type: 'field1' | 'field2' | 'isActive'
): string | null {
  if (!label) return null;

  const normalized = label.toLowerCase().trim();

  switch (type) {
    case 'field1':
      return FIELD1_MAPPING[normalized] || null;

    case 'field2':
      return FIELD2_MAPPING[normalized] || null;

    case 'isActive':
      return IS_ACTIVE_MAPPING[normalized] || null;

    default:
      return null;
  }
}

/**
 * Map database value to Excel display label
 *
 * @param value - The database value
 * @param type - The field type identifier
 * @returns Excel display value
 *
 * @example
 * mapValueToLabel('UG', 'programType') // returns 'UG'
 * mapValueToLabel(true, 'isActive') // returns 'Active'
 */
export function mapValueToLabel(
  value: string | boolean | null | undefined,
  type: 'field1' | 'field2' | 'isActive'
): string {
  if (value === null || value === undefined) return '';

  const strValue = String(value).toLowerCase().trim();

  switch (type) {
    case 'field1':
      // Return the display value that maps to this db value
      const field1Entry = Object.entries(FIELD1_MAPPING).find(
        ([_, dbVal]) => dbVal === strValue
      );
      return field1Entry
        ? EXCEL_FIELD1.find(v => v.toLowerCase() === field1Entry[0]) || strValue
        : strValue;

    case 'field2':
      const field2Entry = Object.entries(FIELD2_MAPPING).find(
        ([_, dbVal]) => dbVal === strValue
      );
      return field2Entry
        ? EXCEL_FIELD2.find(v => v.toLowerCase() === field2Entry[0]) || strValue
        : strValue;

    case 'isActive':
      return strValue === 'true' ? 'Active' : 'Inactive';

    default:
      return String(value);
  }
}

/**
 * Check if a label is valid for a given field type
 *
 * @param label - The label to validate
 * @param type - The field type identifier
 * @returns true if valid, false otherwise
 */
export function isValidLabel(
  label: string,
  type: 'field1' | 'field2' | 'isActive'
): boolean {
  return mapLabelToValue(label, type) !== null;
}

/**
 * Get all valid display labels for a field type
 *
 * @param type - The field type identifier
 * @returns Array of valid display labels
 */
export function getValidLabels(
  type: 'field1' | 'field2' | 'isActive'
): string[] {
  switch (type) {
    case 'field1':
      return EXCEL_FIELD1;
    case 'field2':
      return EXCEL_FIELD2;
    case 'isActive':
      return EXCEL_IS_ACTIVE;
    default:
      return [];
  }
}
```

## Real Example: Program Excel Mappings

```typescript
/**
 * Program Excel Field Mappings
 */

// PROGRAM TYPE
export const PROGRAM_TYPE_MAPPING: Record<string, string> = {
  'ug': 'UG',
  'pg': 'PG',
  'ph.d': 'Ph.D',
  'phd': 'Ph.D',
  'ph.d.': 'Ph.D'
};

export const EXCEL_PROGRAM_TYPES = ['UG', 'PG', 'Ph.D'];

// PATTERN TYPE
export const PATTERN_TYPE_MAPPING: Record<string, string> = {
  'year': 'Year',
  'semester': 'Semester'
};

export const EXCEL_PATTERN_TYPES = ['Year', 'Semester'];

// PART TIME
export const PART_TIME_MAPPING: Record<string, string> = {
  'yes': 'true',
  'no': 'false',
  'true': 'true',
  'false': 'false'
};

export const EXCEL_PART_TIME = ['Yes', 'No'];

// IS ACTIVE
export const IS_ACTIVE_MAPPING: Record<string, string> = {
  'active': 'true',
  'inactive': 'false',
  'yes': 'true',
  'no': 'false',
  'true': 'true',
  'false': 'false'
};

export const EXCEL_IS_ACTIVE = ['Active', 'Inactive'];

export function mapLabelToValue(
  label: string,
  type: 'programType' | 'patternType' | 'partTime' | 'isActive'
): string | null {
  if (!label) return null;
  const normalized = label.toLowerCase().trim();

  switch (type) {
    case 'programType':
      return PROGRAM_TYPE_MAPPING[normalized] || null;
    case 'patternType':
      return PATTERN_TYPE_MAPPING[normalized] || null;
    case 'partTime':
      return PART_TIME_MAPPING[normalized] || null;
    case 'isActive':
      return IS_ACTIVE_MAPPING[normalized] || null;
    default:
      return null;
  }
}

export function mapValueToLabel(
  value: string | boolean | null | undefined,
  type: 'programType' | 'patternType' | 'partTime' | 'isActive'
): string {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'programType':
      return String(value); // Already stored as display value
    case 'patternType':
      return String(value); // Already stored as display value
    case 'partTime':
      return String(value) === 'true' ? 'Yes' : 'No';
    case 'isActive':
      return String(value) === 'true' ? 'Active' : 'Inactive';
    default:
      return String(value);
  }
}

export function isValidLabel(
  label: string,
  type: 'programType' | 'patternType' | 'partTime' | 'isActive'
): boolean {
  return mapLabelToValue(label, type) !== null;
}

export function getValidLabels(
  type: 'programType' | 'patternType' | 'partTime' | 'isActive'
): string[] {
  switch (type) {
    case 'programType':
      return EXCEL_PROGRAM_TYPES;
    case 'patternType':
      return EXCEL_PATTERN_TYPES;
    case 'partTime':
      return EXCEL_PART_TIME;
    case 'isActive':
      return EXCEL_IS_ACTIVE;
    default:
      return [];
  }
}
```

## Usage in Import API

```typescript
import {
  mapLabelToValue,
  isValidLabel,
  getValidLabels
} from '@/lib/utils/mappings/[entity]-excel-mappings';

// Validate and map enum field
const programTypeLabel = getCellValue(row.getCell(6).value);
const programType = mapLabelToValue(programTypeLabel, 'programType');

if (programTypeLabel && !programType) {
  errors.push({
    row: rowNumber,
    field: 'program_type',
    message: `Invalid program type "${programTypeLabel}". Valid values: ${getValidLabels('programType').join(', ')}`
  });
}
```

## Usage in Template API

```typescript
import {
  EXCEL_PROGRAM_TYPES,
  EXCEL_PATTERN_TYPES,
  EXCEL_PART_TIME,
  EXCEL_IS_ACTIVE
} from '@/lib/utils/mappings/[entity]-excel-mappings';

// Reference columns in Lists sheet
rowData.push(EXCEL_IS_ACTIVE[i] || '');      // Status column
rowData.push(EXCEL_PROGRAM_TYPES[i] || '');  // Program Type column
rowData.push(EXCEL_PATTERN_TYPES[i] || '');  // Pattern Type column
rowData.push(EXCEL_PART_TIME[i] || '');      // Part Time column
```
