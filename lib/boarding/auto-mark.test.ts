// lib/boarding/auto-mark.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO_METHOD, isAutoMark, AUTO_ABSENT_MIGRATION } from './auto-mark';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';

describe('isAutoMark', () => {
  it('is true only for the auto method', () => {
    expect(isAutoMark(AUTO_METHOD)).toBe(true);
    expect(isAutoMark('manual')).toBe(false);
    expect(isAutoMark('id_card')).toBe(false);
    expect(isAutoMark(null)).toBe(false);
    expect(isAutoMark(undefined)).toBe(false);
  });
});

describe('auto-absent SQL roster', () => {
  it('uses exactly ACTIVE_LIFECYCLE_STATUSES, so it lists the same riders as the Attendance screen', () => {
    const sql = readFileSync(join(process.cwd(), AUTO_ABSENT_MIGRATION), 'utf8');
    const m = sql.match(/lifecycle_status::text in \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const inSql = m![1].split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    expect(inSql).toEqual([...ACTIVE_LIFECYCLE_STATUSES].sort());
  });
});
