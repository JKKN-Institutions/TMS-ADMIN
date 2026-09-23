-- One-off data cleanup (APPLIED to the live DB 2026-09-23).
-- Three bus inspection drafts started on 2026-09-21 were never finished. An open
-- draft blocks its bus: /api/admin/inspections/start hands back the existing draft
-- and only its starter can continue it, and there is no "Discard draft" yet.
-- All three had 0 answered items, 0 learner checks and 0 issues; child rows
-- cascade. Buses freed: TN28AA9762, TN30BH1040, TN34L6309.
delete from tms_inspection
where status = 'draft'
  and id in (
    '6c213ee4-3dc5-46fd-814c-0268635aa598',
    '43664179-c24c-4ae8-baf8-aab987a84ed4',
    '9c4bc58e-4237-4f52-9dce-be32e0a37f7b'
  );
