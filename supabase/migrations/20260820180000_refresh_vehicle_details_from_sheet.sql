-- Refresh tms_vehicle details from "BUS DETAILS (1).xlsx" (35 vehicles, 2026-08-20).
--
-- All 35 registrations ALREADY EXIST -- this is an in-place detail refresh.
-- NO inserts, NO deletes, NO schema change.
--
-- SAFETY: every column is written as coalesce(v.<col>, t.<col>), so a null in
-- the VALUES list is a no-op, not a blanking. A cell left empty in the sheet
-- therefore CANNOT clear a populated column. (Verified separately: there are
-- 0 fields where the DB holds a value and the sheet is blank.)
--
-- Source-data normalisations baked into the values below:
--   * "TN 63T4599" / "TN 34MB5991" -- embedded spaces stripped; the join is on
--     replace(upper(registration_number), ' ', '') so they match their existing
--     rows instead of missing silently.
--   * insurance_policy_number -- stray leading comma stripped (33 of 35 cells).
--   * dd.mm.yyyy dates read DAY-first. Corroborated against 8 ambiguous cells
--     that already had DB values: 8 agree with day-first, 0 with month-first.
--     permit_expiry_date / road_tax_expiry_date arrive as Excel serial numbers.
--   * vehicle_type "mazda" (TN34M1613, TN34W4280) -> 'bus'. "mazda" is not in
--     the app enum and buildVehiclePayload() would silently store NULL.
--   * The sheet's "Vehicle Owner" column is intentionally NOT imported --
--     tms_vehicle has no owner column.
--
-- 98 field writes over 35 vehicles:
--    35  road_tax_expiry_date
--    27  fitness_expiry
--     8  pollution_expiry_date
--     7  pollution_certificate_number
--     4  permit_expiry_date
--     4  insurance_provider
--     4  insurance_policy_number
--     3  manufacturer
--     3  model
--     2  vehicle_type
--     1  insurance_expiry

update public.tms_vehicle t set
  vehicle_type = coalesce(v.vehicle_type, t.vehicle_type),
  manufacturer = coalesce(v.manufacturer, t.manufacturer),
  model = coalesce(v.model, t.model),
  permit_expiry_date = coalesce(v.permit_expiry_date::date, t.permit_expiry_date),
  pollution_certificate_number = coalesce(v.pollution_certificate_number, t.pollution_certificate_number),
  pollution_expiry_date = coalesce(v.pollution_expiry_date::date, t.pollution_expiry_date),
  road_tax_expiry_date = coalesce(v.road_tax_expiry_date::date, t.road_tax_expiry_date),
  fitness_expiry = coalesce(v.fitness_expiry::date, t.fitness_expiry),
  insurance_provider = coalesce(v.insurance_provider, t.insurance_provider),
  insurance_policy_number = coalesce(v.insurance_policy_number, t.insurance_policy_number),
  insurance_expiry = coalesce(v.insurance_expiry::date, t.insurance_expiry),
  updated_at = now()
from (values
  ('TN87D9769', null, null, null, null, null, null, '2026-09-30', '2027-04-16', null, null, null),
  ('TN56Y5666', null, null, null, null, 'TN63800010026034', '2026-08-17', '2026-09-30', '2027-02-17', null, null, null),
  ('TN34M1613', 'bus', null, null, null, null, null, '2026-09-30', '2027-07-12', null, null, null),
  ('TN87D9598', null, null, null, null, null, null, '2026-09-30', '2027-04-28', null, null, null),
  ('TN28P7710', null, null, null, null, null, null, '2026-09-30', '2027-01-06', null, null, null),
  ('TN87D8599', null, null, null, null, null, null, '2026-09-30', '2027-03-23', null, null, null),
  ('TN33AM6374', null, null, null, '2031-08-25', null, null, '2026-09-30', '2026-11-17', null, null, null),
  ('TN34W4280', 'bus', null, null, null, null, null, '2026-09-30', '2026-11-10', null, null, null),
  ('TN87D9589', null, null, null, null, null, null, '2026-09-30', '2027-04-15', null, null, null),
  ('TN34L6309', null, null, null, null, null, null, '2026-09-30', '2027-02-01', null, null, null),
  ('TN28AA9762', null, null, null, '2031-07-06', null, null, '2026-09-30', '2027-03-24', null, null, null),
  ('TN30R1199', null, null, null, '2031-07-06', null, null, '2026-09-30', '2027-04-07', null, null, null),
  ('TN24V5609', null, null, null, null, null, null, '2026-09-30', '2027-02-22', null, null, null),
  ('TN63T4599', null, 'ASHOK LEYLAND', 'ALPSV 4/88 BSII', null, null, null, '2026-09-30', '2027-01-27', 'ICICI LOMBARD', '3004/422427052/00/000', null),
  ('TN33AL0237', null, null, null, null, null, null, '2026-09-30', '2026-11-24', null, null, null),
  ('TN46E5679', null, null, null, null, null, null, '2026-09-30', '2027-02-01', null, null, null),
  ('TN46F2644', null, 'ASHOK LEYLAND', 'ALPSV 4/38-210 Wb Viking', null, null, null, '2026-09-30', '2027-03-15', 'TATA AIG GENERAL INSURANCE COMPANY LIMITED', '63031576040000', '2027-06-21'),
  ('TN28P4959', null, null, null, '2031-07-26', 'TN63800010027005', '2026-11-18', '2026-09-30', null, null, null, null),
  ('TN28AS7997', null, null, null, null, null, null, '2026-09-30', '2027-06-21', null, null, null),
  ('TN59BX7288', null, null, null, null, null, null, '2026-09-30', null, null, null, null),
  ('TN59BX7286', null, null, null, null, null, null, '2026-09-30', null, null, null, null),
  ('TN59BX7277', null, null, null, null, null, null, '2026-09-30', null, null, null, null),
  ('TN59BX7293', null, null, null, null, null, null, '2026-09-30', null, null, null, null),
  ('TN59BZ0789', null, null, null, null, null, null, '2026-09-30', null, null, null, null),
  ('TN59BX7281', null, null, null, null, null, null, '2026-09-30', null, null, null, null),
  ('TN59BZ2728', null, null, null, null, null, null, '2026-09-30', null, null, null, null),
  ('TN34MB5936', null, null, null, null, 'TN63800010027905', '2027-08-16', '2026-09-30', '2028-08-16', 'RELIANCE GENERAL INSURANCE CO.LTD', '72230531260100000042', null),
  ('TN34MB5991', null, null, null, null, 'TN63800010027852', '2027-08-09', '2026-09-30', '2028-08-11', null, null, null),
  ('TN34MB5922', null, null, null, null, 'TN63800010027853', '2027-08-09', '2026-09-30', '2028-08-11', null, null, null),
  ('TN34MB5985', null, null, null, null, 'TN63800010027904', '2027-08-16', '2026-09-30', '2028-08-16', null, null, null),
  ('TN37CY7212', null, null, null, null, 'TN63800010023836', '2026-01-29', '2026-09-30', '2027-06-23', null, null, null),
  ('TN30BH1040', null, null, null, null, null, null, '2026-09-30', '2027-06-02', null, null, null),
  ('TN63AS6699', null, null, null, null, null, null, '2026-09-30', '2026-11-12', null, null, null),
  ('TN30P7676', null, 'ASHOK LEYLAND', 'ALPSV 4/28', null, null, '2026-08-10', '2026-09-30', '2027-02-10', 'ICICI LOMBARD', '3004/427879480/00/B00', null),
  ('TN87D9778', null, null, null, null, null, null, '2026-09-30', '2027-04-20', null, null, null)
) as v(reg, vehicle_type, manufacturer, model, permit_expiry_date, pollution_certificate_number, pollution_expiry_date, road_tax_expiry_date, fitness_expiry, insurance_provider, insurance_policy_number, insurance_expiry)
where replace(upper(t.registration_number), ' ', '') = v.reg
  and (v.vehicle_type is not null
    or v.manufacturer is not null
    or v.model is not null
    or v.permit_expiry_date is not null
    or v.pollution_certificate_number is not null
    or v.pollution_expiry_date is not null
    or v.road_tax_expiry_date is not null
    or v.fitness_expiry is not null
    or v.insurance_provider is not null
    or v.insurance_policy_number is not null
    or v.insurance_expiry is not null);
