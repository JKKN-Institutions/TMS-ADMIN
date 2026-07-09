# Student "Book Bus" FAB

- **Date:** 2026-07-09
- **Branch:** feat/weekly-booking-window
- **Status:** Approved (design). Small change — implemented inline (not the subagent pipeline).

## Goal

Add a floating action button (FAB) in the student portal that is a one-tap
shortcut to the bus-booking page (`/student/bookings`).

## Decisions (approved)

- **Where:** all student pages EXCEPT `/student/bookings` (redundant there).
- **Viewports:** all screen sizes.
- **Placement:** bottom-right, stacked directly ABOVE the bug-reporter widget.
- **Style:** round icon-only FAB, `bg-green-600`, white `CalendarCheck` icon
  (same icon as the "Book Bus" nav item), tooltip + aria-label "Book bus".

## Design

### New component: `components/booking/book-bus-fab.tsx` (client)

- `'use client'`.
- `usePathname()`: if the path is `/student/bookings` or starts with
  `/student/bookings/`, return `null` (auto-hide on the bookings page).
- Renders a `fixed` round button:
  - Position: `fixed bottom-24 right-5 z-40` — ~96px up so it clears the
    ~56px bug widget (SDK default, ~bottom-5 right-5) with a gap, forming a
    vertical stack; above the mobile bottom nav too.
  - Visual: `h-14 w-14 rounded-full bg-green-600 text-white shadow-lg`,
    hover `bg-green-700`, focus ring; `CalendarCheck` icon `h-6 w-6`.
  - a11y: `aria-label="Book bus"`, `title="Book bus"`.
  - Action: navigate to `/student/bookings` using the same
    `useRouter().push()` pattern the sidebar links use.

### Wiring: `app/student/layout.tsx`

- Import `BookBusFab`.
- Render `<BookBusFab />` once inside the authenticated return, adjacent to
  `<StudentBottomNav />` (inside `<BugReporterWrapper>`), so it shows on every
  student page for signed-in students only.

## Non-goals

- No change to the bug-reporter widget, the student nav config, or any other
  portal (admin/driver/boarding get no FAB).
- No new route, API, or DB change.

## Verification

- `npx tsc --noEmit` → no errors in the two changed files.
- Manual (user's authenticated browser): FAB shows on student pages, stacks
  above the bug icon, hides on `/student/bookings`, does not overlap the mobile
  bottom nav. The single pixel value `bottom-24` may need a small nudge once
  seen live.

## Files touched

| File | Change |
|------|--------|
| `components/booking/book-bus-fab.tsx` | New FAB component (create). |
| `app/student/layout.tsx` | Import + render `<BookBusFab />`. |
