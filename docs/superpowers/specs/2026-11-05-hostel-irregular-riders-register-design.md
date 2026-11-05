# Hostel / irregular bus riders + learner monthly attendance — design

Approved by the owner in chat on 2026-11-05.

## Why
Boarding staff scan the JKKN ID cards of hostel students (and day scholars who are
not registered for transport) when they ride the bus. Today the scan is refused
("Learner has no allocated route", `decideBus` in lib/boarding/wrong-bus.ts) and
NOTHING is saved, so the office cannot tell how many hostel students use the bus.
The office also has no way to read one learner's attendance month by month.

Scale (2026-11-05): 5,667 active learners, 2,005 on transport, 758 with an active
hostel allocation, only 6 of those on a bus list.

## Goals
1. A scan of ANY learner card is saved: present, on the scanning staffer's bus.
2. Each mark stores who the rider was at that moment: `rider_kind`
   `transport` | `hosteller` | `non_transport`. Labels: **Transport**, **Hostel**,
   **Irregular**.
3. The scan screen and voice say "<Name>, hostel" / "<Name>, no transport"; the bus
   list shows a Hostel / Irregular badge.
4. Admin **Learner register**: pick a month, filter bus / rider type; one row per
   learner with days travelled, morning, evening, both-trip days, absent,
   auto-absent, without booking; count of hostel students using the bus; Excel export.
5. Learner detail page (reuse of the 2026-10-30 work) and the student portal show
   attendance per month with **days present = distinct dates with a present trip**.

## Non-goals / anti-goals
- Hostel / irregular riders are NOT added to any bus roster: they must never get
  auto-absent marks (that would mark ~750 hostellers absent every day).
- They do not count toward the "was this bus marked" coverage percentage.
- No billing for these trips.

## Decisions
- rider_kind rule (owner: labels; builder: rule): `transport` when bus_required AND an
  allocated route; else `hosteller` when an active `hostel_allocations` row exists
  (join `hostel_allocations.learner_id = learners_profiles.profile_id`); else
  `non_transport`. The 6 registered hostellers count as Transport.
- Old rows are backfilled from each learner's CURRENT status (owner choice).
- A no-bus learner is recorded on the staffer's single bus as a walk-up (no booking).
  Still refused for super admins (no bus) and staff on several buses.
- Manual marks never send rider_kind; the stored value is kept (same as is_walk_up).
- "Marked by staff" metrics keep excluding `method='auto'`.
