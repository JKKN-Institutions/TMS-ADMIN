-- Boarding stop change for FACULTY A (faculty@jkkn.ac.in),
-- staff 403db380-17b6-46dc-91ed-b8403deeaf9c, profile 1a3b4dc4-0590-4330-a711-4337062d3941.
--
-- Request: route 49 (JALAKANDAPURAM), stop NACHIYAR.
-- Before: route 49 already, stop COLOR PATTI (49537089, sequence 5).
-- After:  route 49, stop NACHIYAR (f7c94434, sequence 1).
--
-- staff is the MyJKKN-owned directory and TMS-ADMIN has no screen that writes a
-- staffer's route or stop, so this is a guarded one-row migration in the style of
-- 20260908062600_gokulapriya_m_staff_bus_required.sql. The WHERE clause pins the
-- old values, so re-running it, or running it after someone else has moved them,
-- changes nothing.
--
-- Deliberately NOT touched:
--   * Staff bill d784a8c6 (Term 1, Rs 20,000, staff_deferred) was priced from the
--     COLOR PATTI staff rate. NACHIYAR has NO rate in fee structure 1cff2da9, so
--     there is no correct new price to write. The transport office decides.
--   * The route 49 in-charge share split (tms_incharge_roster_allocation) is
--     computed from in-charges' own stops and is only rebuilt explicitly. The
--     Rebalance action on the staff route assignment screen refreshes it.

begin;

update staff
   set transport_stop_id = 'f7c94434-418f-4537-a3b1-f9adc69279a5'
 where id                 = '403db380-17b6-46dc-91ed-b8403deeaf9c'
   and transport_route_id = '87217217-1cea-408b-a786-941778bf54ef'
   and transport_stop_id  = '49537089-f5a1-4a66-94a4-a6f816dfd4ba';

commit;
