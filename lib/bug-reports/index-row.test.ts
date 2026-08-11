import { describe, it, expect } from 'vitest';
import { buildIndexRow, rowsFromListResponse } from './index-row';

const submitted = (bug: Record<string, unknown>) => ({ success: true, data: { bug_report: bug } });

const FALLBACK = { email: 'signed.in@jkkn.ac.in', name: 'Signed In' };

describe('buildIndexRow', () => {
  it('extracts a row from the platform submit envelope', () => {
    const row = buildIndexRow(
      submitted({
        id: 'abc-123',
        display_id: 'BUG-42',
        description: 'Map does not load',
        category: 'bug',
        priority: 'high',
        status: 'new',
        page_url: 'https://tms.jkkn.ac.in/student/live-track',
        created_at: '2026-08-10T04:00:00Z',
        metadata: { title: 'Live track blank', reporter_email: 'Kavi@jkkn.ac.in', reporter_name: 'Kavi' },
      }),
      FALLBACK
    );
    expect(row).toEqual({
      id: 'abc-123',
      display_id: 'BUG-42',
      title: 'Live track blank',
      category: 'bug',
      priority: 'high',
      status: 'open', // 'new' folded into 'open'
      portal: 'student', // derived from page_url
      page_url: 'https://tms.jkkn.ac.in/student/live-track',
      reporter_email: 'kavi@jkkn.ac.in', // lowercased
      reporter_name: 'Kavi',
      created_at: '2026-08-10T04:00:00Z',
    });
  });

  it('accepts the un-nested envelope shape too', () => {
    const row = buildIndexRow({ success: true, data: { id: 'x1', page_url: 'https://t/driver/x' } }, FALLBACK);
    expect(row?.id).toBe('x1');
    expect(row?.portal).toBe('driver');
  });

  it('falls back to the authenticated identity when the platform echoes no reporter', () => {
    const row = buildIndexRow(submitted({ id: 'x2', page_url: 'https://t/' }), FALLBACK);
    expect(row?.reporter_email).toBe('signed.in@jkkn.ac.in');
    expect(row?.reporter_name).toBe('Signed In');
  });

  it('prefers the platform reporter over the fallback', () => {
    const row = buildIndexRow(
      submitted({ id: 'x3', page_url: 'https://t/', reporter_email: 'real@jkkn.ac.in' }),
      FALLBACK
    );
    expect(row?.reporter_email).toBe('real@jkkn.ac.in');
  });

  it('derives the title from the description when none was given', () => {
    const row = buildIndexRow(
      submitted({ id: 'x4', page_url: 'https://t/', description: 'Line one\nLine two' }),
      FALLBACK
    );
    expect(row?.title).toBe('Line one');
  });

  it('never yields a blank title', () => {
    expect(buildIndexRow(submitted({ id: 'x5', page_url: 'https://t/' }), FALLBACK)?.title).toBe(
      'Untitled report'
    );
  });

  it('returns null when there is no id to key on', () => {
    expect(buildIndexRow(submitted({ page_url: 'https://t/' }), FALLBACK)).toBeNull();
    expect(buildIndexRow({ success: true, data: {} }, FALLBACK)).toBeNull();
    expect(buildIndexRow({ success: false }, FALLBACK)).toBeNull();
    expect(buildIndexRow(null, FALLBACK)).toBeNull();
    expect(buildIndexRow('not json', FALLBACK)).toBeNull();
  });

  it('returns null when the platform reported failure', () => {
    expect(buildIndexRow({ success: false, data: { bug_report: { id: 'x6' } } }, FALLBACK)).toBeNull();
  });

  it('backfills a real historical record captured from the live API', () => {
    // Verbatim shape of BUG-470 as returned by
    // GET /api/v1/public/bug-reports/me?reporter_email=… — note reporter_email
    // and title live under `metadata`, and there is no top-level `priority`.
    const rows = rowsFromListResponse(
      {
        success: true,
        data: {
          bug_reports: [
            {
              id: 'a68c500a-c102-49ce-8700-dbcb4e932f36',
              display_id: 'BUG-470',
              status: 'new',
              category: 'bug',
              description: 'Testing TMS Application',
              page_url: 'http://localhost:3000/vehicles',
              created_at: '2026-07-06T05:09:56.251134+00:00',
              metadata: { title: 'Testing', reporter_name: 'Sangeetha Jicate', reporter_email: 'sangeetha_v@jkkn.ac.in' },
              application: { id: '8431c0cd', name: 'TMS', slug: 'tms' },
            },
          ],
          pagination: { page: 1, limit: 5, total: 1, total_pages: 1 },
        },
      },
      'sangeetha_v@jkkn.ac.in'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'a68c500a-c102-49ce-8700-dbcb4e932f36',
      display_id: 'BUG-470',
      title: 'Testing',
      status: 'open',
      portal: 'admin', // /vehicles is an admin route
      reporter_email: 'sangeetha_v@jkkn.ac.in',
      reporter_name: 'Sangeetha Jicate',
    });
    // No top-level priority in the live shape — must not invent one.
    expect(rows[0].priority).toBeNull();
  });

  it('maps a student-portal report to the student portal', () => {
    const rows = rowsFromListResponse(
      { success: true, data: { bug_reports: [{ id: 'b1', page_url: 'https://tms.jkkn.ac.in/student/bookings' }] } },
      'x@jkkn.ac.in'
    );
    expect(rows[0].portal).toBe('student');
    expect(rows[0].reporter_email).toBe('x@jkkn.ac.in');
  });

  it('returns an empty array for a reporter with no reports', () => {
    expect(rowsFromListResponse({ success: true, data: { bug_reports: [], pagination: {} } }, 'x@y.z')).toEqual([]);
    expect(rowsFromListResponse({ success: false }, 'x@y.z')).toEqual([]);
    expect(rowsFromListResponse(null, 'x@y.z')).toEqual([]);
  });

  it('skips unusable records without discarding the rest of the batch', () => {
    const rows = rowsFromListResponse(
      { success: true, data: { bug_reports: [{ /* no id */ page_url: 'https://t/' }, { id: 'ok', page_url: 'https://t/' }] } },
      'x@y.z'
    );
    expect(rows.map((r) => r.id)).toEqual(['ok']);
  });

  it('returns null when no reporter email can be determined at all', () => {
    // reporter_email is the index's join key back to the platform's detail
    // endpoint — a row without one could never be re-fetched, so don't store it.
    expect(buildIndexRow(submitted({ id: 'x7', page_url: 'https://t/' }), { email: null, name: null })).toBeNull();
  });
});
