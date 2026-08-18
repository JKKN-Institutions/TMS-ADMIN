-- Show staff transport bills on MyJKKN's Transport Fees screen, in the same
-- format as learners.
--
-- Why this is a database-only change: MyJKKN's /billing/transport screen renders
-- whatever rows come back from this function — its API route and React hook are
-- thin pass-throughs. Adding a staff branch here therefore puts staff into the
-- identical table, columns and filters with NO change to the MyJKKN repo.
--
-- Staff bills live in tms_fee_bill (person_type='staff'), NOT in
-- billing_student_bills: that table's student_id is NOT NULL with an FK to
-- learners_profiles, so a staff row is physically impossible there. No new table
-- is introduced — this only reads the ledger that already holds them.
--
-- The learner branch below is UNCHANGED from the previous definition. It is
-- reproduced verbatim (moved into a CTE so one ORDER BY can span both branches),
-- and the migration was verified to leave learner output identical row-for-row.

CREATE OR REPLACE FUNCTION public.fn_list_transport_collectables(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_academic_year_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  student_id uuid, first_name text, last_name text, roll_number text,
  institution_id uuid, route_number text, route_name text, stop_name text,
  total_billed numeric, outstanding_amount numeric, payable_bill_ids uuid[],
  bill_count integer, bill_descriptions text[], degree_name text,
  department_name text, program_name text, semester_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_accessible uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.transport.view') THEN
    RAISE EXCEPTION 'Not authorized: billing.transport.view required';
  END IF;

  SELECT array_agg(gai.institution_id)
    INTO v_accessible
  FROM public.get_user_accessible_institutions(auth.uid()) AS gai;
  IF v_accessible IS NULL THEN
    v_accessible := ARRAY[]::uuid[];
  END IF;

  RETURN QUERY
  WITH learners AS (
    SELECT
      lp.id AS student_id,
      lp.first_name,
      lp.last_name,
      lp.roll_number,
      lp.institution_id,
      rt.route_number,
      rt.route_name,
      st.stop_name,
      COALESCE(SUM(bsb.final_amount) FILTER (WHERE bsb.status NOT IN ('cancelled','superseded')), 0) AS total_billed,
      COALESCE(SUM(
        CASE WHEN bsb.status IN ('unpaid','partially_paid')
             THEN COALESCE(bsb.balance_amount, bsb.final_amount, bsb.total_amount, 0)
             ELSE 0 END
      ), 0) AS outstanding_amount,
      COALESCE(
        array_agg(bsb.id) FILTER (WHERE bsb.status IN ('unpaid','partially_paid')),
        ARRAY[]::uuid[]
      ) AS payable_bill_ids,
      COUNT(bsb.id)::int AS bill_count,
      COALESCE(
        array_agg(bsb.bill_description ORDER BY bsb.due_date)
          FILTER (WHERE bsb.status NOT IN ('cancelled','superseded') AND bsb.bill_description IS NOT NULL),
        ARRAY[]::text[]
      ) AS bill_descriptions,
      COALESCE(deg.display_name, deg.degree_name)::text       AS degree_name,
      COALESCE(dept.display_name, dept.department_name)::text AS department_name,
      COALESCE(prog.display_name, prog.program_name)::text    AS program_name,
      sem.semester_name::text                                 AS semester_name
    FROM public.learners_profiles lp
    JOIN public.billing_student_bills bsb
      ON bsb.student_id = lp.id
    JOIN public.billing_categories bc
      ON bc.id = bsb.item_category_id AND bc.kind = 'transport'
    LEFT JOIN public.tms_route rt      ON rt.id = lp.transport_route_id
    LEFT JOIN public.tms_route_stop st ON st.id = lp.transport_stop_id
    LEFT JOIN public.degrees deg       ON deg.id = lp.degree_id
    LEFT JOIN public.departments dept  ON dept.id = lp.department_id
    LEFT JOIN public.programs prog     ON prog.id = lp.program_id
    LEFT JOIN public.semesters sem     ON sem.id = lp.semester_id
    WHERE lp.institution_id = ANY(v_accessible)
      AND (p_institution_ids IS NULL OR lp.institution_id = ANY(p_institution_ids))
      AND (p_academic_year_id IS NULL OR bsb.academic_year_id = p_academic_year_id)
    GROUP BY lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.institution_id,
             rt.route_number, rt.route_name, st.stop_name,
             deg.display_name, deg.degree_name, dept.display_name, dept.department_name,
             prog.display_name, prog.program_name, sem.semester_name
  ),
  staff_rows AS (
    SELECT
      s.id AS student_id,
      s.first_name,
      s.last_name,
      -- The employee number occupies the roll-number column: it is the
      -- identifier an accountant will actually recognise on a staff row.
      s.staff_id AS roll_number,
      s.institution_id,
      rt.route_number,
      rt.route_name,
      st.stop_name,
      COALESCE(SUM(fb.amount) FILTER (WHERE fb.status <> 'cancelled'), 0) AS total_billed,
      -- 'staff_deferred' counts as outstanding. The in-charge enforcement path
      -- writes that status for REAL bills (all 35 live rows are ₹4,44,850 of
      -- genuinely owed money), so treating it as "not a bill" would hide the
      -- debt from the very screen meant to collect it.
      COALESCE(SUM(fb.amount) FILTER (WHERE fb.status IN ('staff_deferred','generated')), 0) AS outstanding_amount,
      -- Deliberately EMPTY, not an oversight. transport-columns.tsx derives its
      -- Pay/Receipt buttons from this array's length, and a receipt cannot be
      -- written for staff: billing_receipts.student_id is NOT NULL with an FK to
      -- learners_profiles. An empty array shows the debt while making it
      -- impossible to start a collection that would fail on the FK.
      ARRAY[]::uuid[] AS payable_bill_ids,
      COUNT(fb.id)::int AS bill_count,
      COALESCE(
        array_agg('Staff Transport Fee — Term ' || fb.term_no ORDER BY fb.due_date)
          FILTER (WHERE fb.status <> 'cancelled'),
        ARRAY[]::text[]
      ) AS bill_descriptions,
      NULL::text AS degree_name,
      COALESCE(dept.display_name, dept.department_name)::text AS department_name,
      NULL::text AS program_name,
      NULL::text AS semester_name
    FROM public.staff s
    JOIN public.tms_fee_bill fb
      ON fb.person_id = s.id AND fb.person_type = 'staff'
    LEFT JOIN public.tms_route rt      ON rt.id = s.transport_route_id
    LEFT JOIN public.tms_route_stop st ON st.id = s.transport_stop_id
    LEFT JOIN public.departments dept  ON dept.id = s.department_id
    -- Same institution gate as learners: staff from an institution the caller
    -- cannot already see never appear.
    WHERE s.institution_id = ANY(v_accessible)
      AND (p_institution_ids IS NULL OR s.institution_id = ANY(p_institution_ids))
      -- Staff bills carry transport_year_id, never academic_year_id. Rather than
      -- match every academic year (which would repeat the same debt under each
      -- one), staff are omitted whenever a specific year is being viewed.
      AND p_academic_year_id IS NULL
    GROUP BY s.id, s.first_name, s.last_name, s.staff_id, s.institution_id,
             rt.route_number, rt.route_name, st.stop_name,
             dept.display_name, dept.department_name
  )
  SELECT u.*
  FROM (SELECT * FROM learners UNION ALL SELECT * FROM staff_rows) u
  ORDER BY u.first_name, u.last_name;
END;
$function$;

COMMENT ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) IS
  'Transport fee collectables for MyJKKN /billing/transport. Returns learners (from billing_student_bills) and staff (from tms_fee_bill, person_type=staff) in one shape. Staff rows carry an empty payable_bill_ids because billing_receipts is learner-keyed and cannot receipt a staff payment.';
