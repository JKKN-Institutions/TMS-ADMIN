-- Boarding staff can now mark attendance by scanning a learner's printed JKKN
-- ID card. That mark must stay distinguishable from a signed boarding-pass
-- scan: the card carries a PUBLIC number (jkkn_identities.jkkn_id, printed on
-- plastic and downloadable as a PNG from MyJKKN), whereas the pass is an HMAC
-- nobody can forge. Folding both into 'qr_scan' would erase that difference
-- from every report and make later abuse unauditable.
--
-- Existing rows are untouched. tms_mark_attendance passes p_method straight
-- through and hardcodes no list, so this constraint is the only change needed.

alter table public.tms_attendance
  drop constraint if exists tms_attendance_method_check;

alter table public.tms_attendance
  add constraint tms_attendance_method_check
  check (method = any (array['qr_scan'::text, 'manual'::text, 'id_card'::text]));
