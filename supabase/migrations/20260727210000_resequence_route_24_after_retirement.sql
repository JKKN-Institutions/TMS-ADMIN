-- Make route 24's active stops contiguous again after retiring stops 13-21.
--
-- sequence_order is the stop's position in the journey, and the route detail page
-- renders it verbatim (app/(admin)/routes/[routeId]/page.tsx renders
-- `s.sequence_order ?? i + 1`). After the retirement route 24's active stops ran
-- 1..12 then jumped to 22, so the timetable displayed a stop numbered 22 directly
-- after stop 12.
--
-- Retired stops are parked at 901+ rather than left interleaved: they hold no
-- position in the journey, and parking them frees 13 for COLLEGE without two rows
-- sharing a number. Their relative order is preserved in case one is ever restored.
--
-- Scoped to route 24 deliberately. Other routes may also have sequence gaps, but
-- renumbering all 477 stops is unrelated to this change.
--
-- Design doc: docs/superpowers/specs/2026-07-27-route-01-jalakandapuram-stops-design.md

-- Retired stops first, so nothing transiently shares a sequence number with COLLEGE.
WITH retired AS (
  SELECT id, 900 + row_number() OVER (ORDER BY sequence_order) AS seq
  FROM tms_route_stop
  WHERE route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
    AND NOT is_active
)
UPDATE tms_route_stop s
SET sequence_order = r.seq, updated_at = now()
FROM retired r
WHERE r.id = s.id AND s.sequence_order <> r.seq;

-- Active stops become 1..13 with no gaps.
WITH active AS (
  SELECT id, row_number() OVER (ORDER BY sequence_order) AS seq
  FROM tms_route_stop
  WHERE route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4'
    AND is_active
)
UPDATE tms_route_stop s
SET sequence_order = a.seq, updated_at = now()
FROM active a
WHERE a.id = s.id AND s.sequence_order <> a.seq;

-- The renumber must not have reordered the journey: times must still ascend.
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM (
    SELECT stop_time,
           lag(stop_time) OVER (ORDER BY sequence_order) AS prev
    FROM tms_route_stop
    WHERE route_id = '79f0ff06-b3d4-4373-b27c-debb69502ba4' AND is_active
  ) t
  WHERE prev IS NOT NULL AND stop_time <= prev;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Aborting: resequencing left % route 24 stop(s) out of time order', v_bad;
  END IF;
END $$;
