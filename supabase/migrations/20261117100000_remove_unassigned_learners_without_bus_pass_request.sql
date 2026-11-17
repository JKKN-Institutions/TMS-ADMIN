-- Remove from transport 8 unassigned learners who never made a Bus Pass Request.
--
-- On 2026-11-17 the Learners list showed 11 learners flagged bus_required with
-- no route. 10 of them have no Bus Pass Request in service_requests in any
-- status. 8 of those 10 also have no transport bill, fine, override, booking or
-- attendance mark, so nothing else refers to them as transport users.
--
-- NOT included (left as they are, pending a decision):
--   VISHAL M   AUG26CY25  - holds a PAID Rs 500 transport bill
--   PRIYANKA K            - has 2 attendance marks (has ridden the bus)
--   RITHISH M  26EE031    - did make a Bus Pass Request (no route chosen)
--
-- "Remove" = bus_required off, the same meaning as staff remove-from-transport.
-- No row is deleted. The guard keeps this a no-op for anyone since assigned.
--
-- Rollback: update learners_profiles set bus_required = true where id in (<the 8 ids>);

update learners_profiles
set bus_required = false
where id in (
  'aa91bb26-35e8-426f-acd1-93be386b0f04', -- AKEESH R K
  'c8dfeff7-928f-49d5-8aea-0748b377948d', -- INDHUJA C        AUG26FD09
  'a0f4e1b3-40be-44e4-8860-7399d7dd943c', -- JANAKIRAMAN P    AUG26CY09
  'fad213b5-2485-45fe-8212-2a01fbe32be6', -- LALITHA K        AUG26CY20
  '966b6931-846a-4acd-8304-9bad9869f7c2', -- NISHANTH S       26IT028
  'b2ef7817-ef37-41a2-9616-4409f3faa7c0', -- NITHYA K
  '1b4f0aa0-7070-40f8-8211-84c016735f4c', -- POOVARASAN A     26EE027
  '5e881a0d-968a-4ccd-8edf-314e34a54db0'  -- PRAVEENKUMAR P   AUG26CA145
)
  and bus_required = true
  and transport_route_id is null;
