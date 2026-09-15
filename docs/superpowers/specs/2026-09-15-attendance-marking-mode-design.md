# Attendance marking mode (Scan only / Manual only / Both) — design

Date: 2026-09-15 · Branch: `feat/attendance-auto-absent` (stacked on auto-absent, ships together) · Status: awaiting approval

## Problem

The boarding Attendance page always offers both ways of marking: the Scan
button (JKKN ID card) and the manual P / A / B buttons. The transport office
wants to choose in Settings which methods staff may use, and have the
Attendance page follow that choice immediately.

Measured (last 7 days): 6,697 manual marks vs 58 ID-card + 71 QR scans (98%
manual). All 1,822 active bus riders hold an active JKKN card, so scan-only
locks no rider out.

## Decisions (confirmed by the user)

1. Three modes: **Scan only**, **Manual only**, **Scan + manual** (default = today).
2. One setting for both trips.
3. Scan only: staff may still **undo their own scan**; the **transport head
   (`tms.attendance.override`) and super admin** may still mark manually.
   By symmetry, in Manual only they may still scan.
4. Stacked on the auto-absent branch and shipped together — in Scan only,
   absences come from the auto-absent job at window close.

## Design

### Storage

`admin_settings` row `setting_type = 'attendance'`, `settings_data = { "markingMode": "scan_only" | "manual_only" | "both" }`
(PK `setting_type`, RLS on, service-role access — same as `scheduling`).
No DDL. A missing row or unknown value reads as `both`.

### Domain module — `lib/boarding/marking-mode.ts` (pure + thin loader)

- `MarkingMode`, `MARKING_MODES`, `DEFAULT_MARKING_MODE = 'both'`, `MARKING_MODE_LABEL`.
- `parseMarkingMode(raw: unknown): MarkingMode`.
- `allowedMethods(mode, exempt): { manual: boolean; scan: boolean }` — exempt
  (super admin / override holder) is always `{true, true}`.
- `readMarkingMode(svc): Promise<MarkingMode | null>` (null on read error, for
  the Settings save guard) and `loadMarkingMode(svc)` (falls back to `both`:
  a failed read restores today's behaviour, never locks staff out of both).

### Settings (admin)

- `GET/PUT /api/admin/attendance-windows` gains `markingMode`. PUT accepts an
  optional `markingMode`; absent = keep stored (older screens). Invalid → 400.
  Upserts the `attendance` row, logs it in the activity description, and uses
  the existing `publishAttendanceSettingsChanged()` so open boarding screens
  re-read at once.
- `components/admin/attendance-window-settings.tsx` gets a "Marking method"
  card with three radio options above the window cards, saved by the same
  button ("Save attendance settings").

### Boarding read

`GET /api/boarding/attendance-window` adds
`marking: { mode, manual, scan }` computed for the caller (exempt ⇒ both true).
The page caches it offline next to the windows (`saveMarking/loadMarking` in
`lib/boarding/offline/snapshot.ts`; no saved copy ⇒ both allowed, matching the
server fallback).

### Enforcement (server — the real gate)

- `POST /api/boarding/attendance`: when `!allowedMethods(mode, exempt).manual`:
  legacy request → `409 { reason: 'manual_off' }`; offline-aware request (carries
  `tappedAt`) → `200` with every mark in `results` as `rejected / manual_off`, so
  the outbox settles them instead of retrying.
- `POST /api/boarding/scan`: when `!scan` → `409 { ok:false, reason:'scan_off' }`.
- `DELETE /api/boarding/attendance` (Undo) is unaffected in every mode.
- `lib/boarding/offline/protocol.ts`: `MarkRejectReason` gains `manual_off`,
  `scan_off` with plain-words text; `sync.ts` maps both (mark 409 + scan).

### Attendance page UI

- Scan button shown only when `marking.scan`.
- `getRosterColumns` gains `manualAllowed`. When false and `canMark`, the Action
  cell shows only the Undo icon, on rows the viewer may clear (`can_clear`) whose
  method is a scan (`id_card` / `qr_scan`) — "undo own scan". Never on auto rows.
- The P/A/B legend block is shown only when manual is allowed; a one-line mode
  banner explains the current rule ("Scan only: scan each student's ID card.
  Students not scanned are marked absent when attendance closes." / "Manual only: …").
- `/boarding/routes/[routeId]`: its onward MarkControl renders only when manual
  is allowed (read-only pill otherwise).

### Error handling

Settings save refuses when the stored mode cannot be read. Client pages fall
back to "both allowed" when the setting is unreadable; the server still
enforces the stored value, and a refused mark surfaces its reason text.

### Testing

- vitest `lib/boarding/marking-mode.test.ts`: parse, `allowedMethods` matrix incl. exempt.
- vitest `lib/boarding/offline/sync.test.ts`: `manual_off` mark 409 and `scan_off` scan are rejected with those reasons (not retried).
- vitest `lib/boarding/offline/snapshot.test.ts`: marking save/load round trip.
- tsc filtered to touched files; `next build`.
- Live: set mode via SQL on a test read (no write needed); user browser smoke test.

### Known limits

- A phone with a stale cached mode may show a control the server refuses; the
  refusal text explains it and the live push/2-minute re-read corrects it.
- Staff in Scan only cannot record an absence by hand; absences come from the
  auto-absent job (its schedule must be applied for this mode to be useful).
