# Driver Portal UI Refresh — Design

**Date:** 2026-06-23
**Goal:** Bring the driver portal's UI in line with the admin look, using the existing
admin/student shell as the reference.

## Context

- `app/(admin)/layout.tsx` is the rich shell: `sidebar-modern` (collapsible, search, grouped
  nav, tooltips), shared `AdminHeader`, mobile `BottomNav`, branded loading, `react-hot-toast`.
- `app/student/layout.tsx` is **already that admin shell adapted for a single-area
  self-service portal** — same global CSS classes (`sidebar-modern`, `app-header`,
  `content-body fade-in`, `sidebar-nav-item`), collapsible sidebar persisted to localStorage,
  branded loading, an `app-header` with collapse toggle + theme switcher + profile menu, a
  mobile `StudentBottomNav`, `comingSoon` handling, and an `isStudent/isSuperAdmin` guard.
- `app/driver/layout.tsx` is a minimal hand-rolled shell (plain aside, flat nav, text header).
  The driver area is a structural peer of the student area (`isDriver` guard,
  `driverNavigation` with `comingSoon` items).

**Decision:** mirror the student layout 1:1 for the driver area. The visual identity lives in
shared global CSS classes, so "match the admin UI" reduces to rendering `driverNavigation`
through the same shell. No new CSS, no refactor of the working student portal.

## Scope (approved)

Shell refresh **+** light dashboard polish. Building out the `comingSoon` pages
(My Routes, Passengers, Live Location, Profile) is explicitly out of scope.

## Changes

1. **`components/portal-user-menu.tsx` (new)** — extract the role-agnostic `ThemeToggle` and
   `ProfileMenu` (currently inlined in the student layout) so the driver layout reuses them
   instead of making a third copy. Student layout left untouched for now; may adopt later.

2. **`lib/driver/navigation.ts` (extend)** — add `deriveDriverPageTitle(path)` mirroring
   `deriveStudentPageTitle`, and optional `shortName` fields for the mobile bar.

3. **`components/driver-bottom-nav.tsx` (new)** — mirror of `student-bottom-nav.tsx`, driven by
   `driverNavigation`. Only Dashboard is live, so the primary bar shows **Dashboard + More**;
   the "More" sheet lists all items with `comingSoon` ones disabled.

4. **`app/driver/layout.tsx` (rewrite)** — student shell with driver specifics: green `Bus`
   logo + "JKKN Transport · Driver"; one "MENU" section over `driverNavigation` (disabled
   `comingSoon` items); `btn-secondary` Sign Out; `app-header` with collapse toggle +
   `deriveDriverPageTitle` + `ThemeToggle` + `ProfileMenu` (**no** notifications bell — no
   driver notifications route yet); branded loading; existing `isDriver/isSuperAdmin` auth
   guard kept; collapse persisted to `tms-driver-sidebar-collapsed`; `<DriverBottomNav />` on
   mobile.

5. **`app/driver/dashboard/page.tsx` (polish)** — drop the redundant in-page `<h1>` (header
   supplies the title); render the four metrics (Status, Rating, Total trips, Experience) as
   admin-style stat tiles; keep the Assigned Route + Route Timetable cards. Data/query logic
   unchanged.

## Non-goals / risks

- No change to the student or admin layouts.
- No new global CSS — reuse existing classes.
- Verification is headless (tsc on changed files + dev-server route probe); a live
  authenticated render must be done in the user's browser (agent Chrome is unauthenticated).
