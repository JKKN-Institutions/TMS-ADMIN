-- FINE SHEET ONLY (tms_fine_stop_rate). Applied to prod 2026-09-15.
--
-- Transport office rule: every stop on a route is fined the route's FINAL stop
-- amount (the farthest pickup stop, sequence 1 — the highest sequence is always
-- COLLEGE). Route 49 = ₹20,000 means all 23 route-49 stops = ₹20,000.
--
-- tms_fee_structure_stop_rate (the fee sheet) is deliberately NOT touched —
-- verified by md5 of all 935 rows before/after. Already-raised fines
-- (tms_fee_fine / billing_student_bills) are untouched.
--
-- Effect on 2026-2027: 586 stops — 111 already correct, 120 newly priced,
-- 337 raised, 18 lowered (routes 05/06/07/14/36/37). Inactive stops included.
-- Undo: tms_fine_stop_rate_backup_20260915 holds the prior 466 rows.
--
-- Caveat: this is a one-off stamp. A stop added to a route later is unpriced
-- until set on the Fine Rates page, and "Copy from fee structure" would
-- overwrite these amounts.

do $$
declare
  v_year uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0'; -- 2026-2027
  v_stops int;
  v_n int;
begin
  create table if not exists public.tms_fine_stop_rate_backup_20260915 as
    select * from public.tms_fine_stop_rate where transport_year_id = v_year;

  create temp table sheet(route_number text, amount numeric) on commit drop;
  insert into sheet values
    ('05',18700),('06',14000),('07',18400),('10',20900),('11',13200),
    ('12',16500),('13',18400),('14',18700),('15',19800),('16',20000),
    ('18',21000),('19',20900),('20',20900),('22',25000),('23',18700),
    ('24',20900),('29',30250),('31',16500),('32',18100),('34',15600),
    ('36',14300),('37',18150),('39',14850),('40',16500),('49',20000);

  select count(*) into v_stops
  from public.tms_route_stop s join public.tms_route r on r.id = s.route_id
  join sheet sh on sh.route_number = r.route_number;
  if v_stops <> 586 then
    raise exception 'Expected 586 stops on the 25 routes, found %', v_stops;
  end if;

  insert into public.tms_fine_stop_rate (transport_year_id, stop_id, fine_amount, updated_at)
  select v_year, s.id, sh.amount, now()
  from public.tms_route_stop s
  join public.tms_route r on r.id = s.route_id
  join sheet sh on sh.route_number = r.route_number
  on conflict (transport_year_id, stop_id)
    do update set fine_amount = excluded.fine_amount, updated_at = now();

  get diagnostics v_n = row_count;
  if v_n <> 586 then
    raise exception 'Expected 586 fine rates written, wrote %', v_n;
  end if;
end $$;
