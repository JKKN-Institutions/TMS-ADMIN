import { describe, it, expect } from 'vitest';
import { decideMark, canClearMark, type MarkInputFacts } from './attendance-ownership';

const ME = 'staff-a';
const OTHER = 'staff-b';

const facts = (over: Partial<MarkInputFacts> = {}): MarkInputFacts => ({
  existing: null,
  requestedStatus: 'present',
  actorId: ME,
  isOverrideHolder: false,
  isSuperAdmin: false,
  viaScan: false,
  ...over,
});

describe('decideMark', () => {
  it('writes when no row exists yet', () => {
    expect(decideMark(facts())).toEqual({ action: 'write' });
  });

  it('lets the original marker change their own mark', () => {
    expect(
      decideMark(facts({ existing: { status: 'absent', scannedBy: ME }, requestedStatus: 'present' })),
    ).toEqual({ action: 'write' });
  });

  it('no-ops when the marker re-asserts the status already on their own row', () => {
    expect(
      decideMark(facts({ existing: { status: 'present', scannedBy: ME }, requestedStatus: 'present' })),
    ).toEqual({ action: 'noop', reason: 'already_that_status' });
  });

  // The stale-screen case. Staff B's roster still reads "unmarked" and they tap
  // Present, but Staff A marked Present 40s ago. Denying would punish someone who
  // did nothing wrong and never saw a lock icon.
  it('no-ops rather than denying when another staff asks for the status already there', () => {
    expect(
      decideMark(facts({ existing: { status: 'present', scannedBy: OTHER }, requestedStatus: 'present' })),
    ).toEqual({ action: 'noop', reason: 'already_that_status' });
  });

  it("denies a plain staff member changing someone else's mark by hand", () => {
    expect(
      decideMark(facts({ existing: { status: 'present', scannedBy: OTHER }, requestedStatus: 'absent' })),
    ).toEqual({ action: 'deny', reason: 'locked' });
  });

  it("lets a QR scan override someone else's absent mark", () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'absent', scannedBy: OTHER },
          requestedStatus: 'present',
          viaScan: true,
        }),
      ),
    ).toEqual({ action: 'override', from: 'absent', previousBy: OTHER });
  });

  it("lets an override holder change someone else's mark", () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'present', scannedBy: OTHER },
          requestedStatus: 'absent',
          isOverrideHolder: true,
        }),
      ),
    ).toEqual({ action: 'override', from: 'present', previousBy: OTHER });
  });

  it("lets a super admin change someone else's mark", () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'present', scannedBy: OTHER },
          requestedStatus: 'absent',
          isSuperAdmin: true,
        }),
      ),
    ).toEqual({ action: 'override', from: 'present', previousBy: OTHER });
  });

  // scanned_by is `on delete set null`, so deleting a staff profile orphans every
  // row they marked. Without this branch those rows freeze, editable by nobody.
  it('treats a row whose marker profile was deleted as unowned, not frozen', () => {
    expect(
      decideMark(facts({ existing: { status: 'present', scannedBy: null }, requestedStatus: 'absent' })),
    ).toEqual({ action: 'write' });
  });

  it('reads viaScan as a property of THIS write, not of the existing row', () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'present', scannedBy: OTHER },
          requestedStatus: 'absent',
          viaScan: false,
        }),
      ),
    ).toEqual({ action: 'deny', reason: 'locked' });
  });
});

// Gate B's half of the owner/coverer rule. Gate A (lib/boarding/mark-scope.ts)
// puts BOTH the owner and an accepted coverer in scope for the same learner —
// so once they are both allowed to touch the row, something has to arbitrate
// which of them may replace the other's mark. This is that something.
describe('decideMark — owner vs coverer', () => {
  it("lets the learner's own owner replace a coverer's differing mark", () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'absent', scannedBy: OTHER },
          requestedStatus: 'present',
          isLearnerOwner: true,
        }),
      ),
    ).toEqual({ action: 'override', from: 'absent', previousBy: OTHER });
  });

  // The asymmetry is the point. Cover transfers DUTY, not authority over data
  // already written: if the owner marked it, the owner was there.
  it("refuses a coverer replacing the owner's mark", () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'absent', scannedBy: OTHER },
          requestedStatus: 'present',
          isLearnerOwner: false,
        }),
      ),
    ).toEqual({ action: 'deny', reason: 'locked' });
  });

  // Same-status still short-circuits ahead of ownership, so an owner tapping a
  // stale screen gets a quiet no-op rather than a spurious override record.
  it('no-ops for the owner when the status already matches', () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'present', scannedBy: OTHER },
          requestedStatus: 'present',
          isLearnerOwner: true,
        }),
      ),
    ).toEqual({ action: 'noop', reason: 'already_that_status' });
  });

  // Absent isLearnerOwner must behave exactly as false: every call site that
  // predates the shares rollout omits it, and a truthy default would silently
  // hand every staff member the owner's override.
  it('treats an omitted isLearnerOwner as not-the-owner', () => {
    expect(
      decideMark(facts({ existing: { status: 'absent', scannedBy: OTHER }, requestedStatus: 'present' })),
    ).toEqual({ action: 'deny', reason: 'locked' });
  });
});

describe('canClearMark', () => {
  const clear = (over: Partial<Parameters<typeof canClearMark>[0]> = {}) =>
    canClearMark({
      existing: null,
      actorId: ME,
      isOverrideHolder: false,
      isSuperAdmin: false,
      ...over,
    });

  it('allows clearing when there is nothing to clear', () => {
    expect(clear()).toBe(true);
  });

  it('allows the original marker to clear their own mark', () => {
    expect(clear({ existing: { status: 'present', scannedBy: ME } })).toBe(true);
  });

  it("refuses a plain staff member clearing someone else's mark", () => {
    expect(clear({ existing: { status: 'present', scannedBy: OTHER } })).toBe(false);
  });

  it('allows an override holder or a super admin to clear any mark', () => {
    expect(clear({ existing: { status: 'present', scannedBy: OTHER }, isOverrideHolder: true })).toBe(true);
    expect(clear({ existing: { status: 'present', scannedBy: OTHER }, isSuperAdmin: true })).toBe(true);
  });

  it('treats an orphaned mark as clearable by anyone', () => {
    expect(clear({ existing: { status: 'present', scannedBy: null } })).toBe(true);
  });
});
