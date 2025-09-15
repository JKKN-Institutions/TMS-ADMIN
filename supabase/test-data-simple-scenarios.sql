-- Simplified Test Data for Route Optimization Scenarios (Sept 13-15, 2025)
-- Using existing routes and schedules

-- Clear existing bookings for our test dates
DELETE FROM bookings WHERE trip_date IN ('2025-09-13', '2025-09-14', '2025-09-15');

-- Get the first schedule ID for each route we want to use
-- SCENARIO 1: Full Transfer with Regular + Possible Stops (Route: ERODE)
-- Using ERODE route (bb749cec-ec9d-4195-b6d9-a9d5e036dc30)
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 8 passengers on ERODE route (low crowd) - can transfer to GURUVAREDDIYUR using possible stops
('f1000001-0001-0001-0001-000000000001', '4bdf32a8-c62d-479d-a1e3-deb1fea78a00', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', (SELECT id FROM schedules WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'ERODE Main', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000002', '18b54c9a-133c-4a4c-aa0e-e0f99bf83aa0', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', (SELECT id FROM schedules WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'ERODE Main', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000003', 'b0cd3fd9-5687-4874-8d83-98db62c59131', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', (SELECT id FROM schedules WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Erode Central', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000004', '4ce9aff0-93db-4280-aca0-ff5586d81727', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', (SELECT id FROM schedules WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Erode Central', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000005', '025df8eb-196a-4fec-ad07-5d84896584b1', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', (SELECT id FROM schedules WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Erode Junction', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000006', '30c908ce-8004-4327-b0d9-232630f2c8ab', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', (SELECT id FROM schedules WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Erode Junction', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000007', '2adb7788-98f4-4050-ae4a-9ada06fe5d9e', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', (SELECT id FROM schedules WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Perundurai', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000008', '3ee95c3c-454b-4294-a23f-261f5d9931ff', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', (SELECT id FROM schedules WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Perundurai', 50.00, 'confirmed', NOW());

-- SCENARIO 2: Full Transfer with Regular + Possible Stops (Route: SALEM)
-- Using SALEM route (693019fd-f366-4d3f-8c03-45827ddbefa7)
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 12 passengers on SALEM route (low crowd) - can transfer to GURUVAREDDIYUR using possible stops
('f2000001-0001-0001-0001-000000000001', 'd24dd48b-de71-4e48-9421-842f17795102', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000002', '7db6db48-7245-4903-b06c-4541bf2f9220', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000003', '105de4e8-fdc6-4f84-b0bc-e0cb6d268c44', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Salem Junction', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000004', 'b89a961f-416b-4baa-83fe-2a515dd3f195', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Salem Junction', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000005', '4728b8b6-a996-4802-bb4a-18404e4a1689', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Salem Central', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000006', '0a5f5732-c5f6-485e-83b9-4ec962590f7c', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Salem Central', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000007', '8773e92f-e698-4b6a-802a-9291ee88649c', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Attur', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000008', '00aa2017-3503-4ab1-92b9-c20e993c2ed5', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Attur', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000009', 'b01b055a-ddfe-4b00-a258-6117214e4006', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Pethanayakanpalayam', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000010', 'a1fd2d06-3468-4374-a334-b239699a8d13', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Pethanayakanpalayam', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000011', 'eee598fe-7f8d-4c8c-82bb-eeab5f945cad', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Rasipuram', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000012', '5a671cb9-552f-41c9-a017-fc13d906e396', '693019fd-f366-4d3f-8c03-45827ddbefa7', (SELECT id FROM schedules WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Rasipuram', 50.00, 'confirmed', NOW());

-- SCENARIO 3: Full Transfer with Regular Stops Only (Route: GOBI)
-- Using GOBI route (08f3d713-e10c-4dce-bd5c-4a70c0d65e69)
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 10 passengers on GOBI route - can transfer to GURUVAREDDIYUR using regular stops only
('f3000001-0001-0001-0001-000000000001', 'b72d1f1c-437f-4d95-95de-02b136de5971', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000002', 'c236869c-1985-470a-b984-72a2ee7e84ba', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000003', '0fd18445-214c-4d67-a761-d0301edf70c0', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Gobi Bus Stand', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000004', '62c25f21-b457-45be-a3a1-4b64bb1d2e3c', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Gobi Bus Stand', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000005', 'b63ef68c-1e93-4b6f-842d-59d7dfb4a462', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Anthiyur', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000006', '0b953f65-1e5c-4f85-85d9-7803f6346c6b', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Anthiyur', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000007', 'c49e4cde-305f-4227-9ac5-f290e8921343', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Sathyamangalam', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000008', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Sathyamangalam', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000009', '7102011f-36f6-4d6c-beb4-86e589b12d88', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000010', '794db2bd-efcc-40f7-9647-9206cd12c908', '08f3d713-e10c-4dce-bd5c-4a70c0d65e69', (SELECT id FROM schedules WHERE route_id = '08f3d713-e10c-4dce-bd5c-4a70c0d65e69' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW());

-- SCENARIO 4: Partial Transfer (Route: ATHANI)
-- Using ATHANI route (0f40b38a-18f5-42c6-955e-513b149f3fe8)
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 20 passengers on ATHANI route - only some can transfer
('p1000001-0001-0001-0001-000000000001', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000002', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000003', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000004', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000005', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
-- These passengers board at stops that don't exist in other routes (no transfer possible)
('p1000001-0001-0001-0001-000000000006', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 1', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000007', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 2', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000008', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 3', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000009', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 4', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000010', '33d5141c-e13b-4580-b7be-1a6a9578edef', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 5', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000011', 'c30312a1-0b97-4aa8-8451-dc200525c741', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 6', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000012', '09c82434-641a-4083-827e-901941715e1a', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 7', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000013', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 8', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000014', '7102011f-36f6-4d6c-beb4-86e589b12d88', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 9', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000015', '794db2bd-efcc-40f7-9647-9206cd12c908', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 10', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000016', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 11', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000017', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 12', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000018', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 13', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000019', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 14', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000020', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '0f40b38a-18f5-42c6-955e-513b149f3fe8', 'ebcb4c9c-16c5-46fb-88e3-6799fd27dd41', '2025-09-14', 'Athani Unique Stop 15', 50.00, 'confirmed', NOW());

-- SCENARIO 5: Partial Transfer (Route: KOLATHUR)
-- Using KOLATHUR route (4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65)
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 18 passengers on KOLATHUR route - only some can transfer
('p2000001-0001-0001-0001-000000000001', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Main Stop', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000002', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Main Stop', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000003', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Main Stop', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000004', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Junction', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000005', '33d5141c-e13b-4580-b7be-1a6a9578edef', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Junction', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000006', 'c30312a1-0b97-4aa8-8451-dc200525c741', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Junction', 50.00, 'confirmed', NOW()),
-- These passengers board at unique stops (no transfer possible)
('p2000001-0001-0001-0001-000000000007', '09c82434-641a-4083-827e-901941715e1a', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 1', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000008', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 2', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000009', '7102011f-36f6-4d6c-beb4-86e589b12d88', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 3', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000010', '794db2bd-efcc-40f7-9647-9206cd12c908', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 4', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000011', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 5', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000012', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 6', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000013', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 7', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000014', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 8', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000015', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 9', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000016', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 10', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000017', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 11', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000018', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65', (SELECT id FROM schedules WHERE route_id = '4fa32b1b-aba9-4fcc-891c-7fe72d6e5b65' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Kolathur Unique Stop 12', 50.00, 'confirmed', NOW());

-- SCENARIO 6: No Transfer (Route: CHENNAMPATTI)
-- Using CHENNAMPATTI route (1ed0cfa9-8710-4d18-8296-9e6439d843fe)
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 15 passengers on CHENNAMPATTI route - no transfers possible due to unique stops
('n1000001-0001-0001-0001-000000000001', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 1', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000002', '33d5141c-e13b-4580-b7be-1a6a9578edef', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 2', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000003', 'c30312a1-0b97-4aa8-8451-dc200525c741', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 3', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000004', '09c82434-641a-4083-827e-901941715e1a', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 4', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000005', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 5', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000006', '7102011f-36f6-4d6c-beb4-86e589b12d88', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 6', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000007', '794db2bd-efcc-40f7-9647-9206cd12c908', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 7', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000008', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 8', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000009', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 9', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000010', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 10', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000011', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 11', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000012', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 12', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000013', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 13', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000014', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 14', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000015', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '1ed0cfa9-8710-4d18-8296-9e6439d843fe', 'ca066c24-a810-4fee-a318-c2a92f612631', '2025-09-15', 'Chennampatti Unique Stop 15', 50.00, 'confirmed', NOW());

-- SCENARIO 7: No Transfer (Route: TIRUPUR)
-- Using TIRUPUR route (c69880d3-40be-4554-812a-2c9cf8548068)
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 22 passengers on TIRUPUR route - no transfers possible
('n2000001-0001-0001-0001-000000000001', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 1', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000002', '33d5141c-e13b-4580-b7be-1a6a9578edef', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 2', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000003', 'c30312a1-0b97-4aa8-8451-dc200525c741', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 3', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000004', '09c82434-641a-4083-827e-901941715e1a', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 4', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000005', 'a42e89c6-016e-4daf-9355-842835a7d4f6', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 5', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000006', '7102011f-36f6-4d6c-beb4-86e589b12d88', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 6', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000007', '794db2bd-efcc-40f7-9647-9206cd12c908', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 7', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000008', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 8', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000009', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 9', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000010', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 10', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000011', 'a43bead7-7371-4173-a77c-2efd3375b5fa', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 11', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000012', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 12', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000013', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 13', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000014', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 14', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000015', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 15', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000016', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 16', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000017', '33d5141c-e13b-4580-b7be-1a6a9578edef', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 17', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000018', 'c30312a1-0b97-4aa8-8451-dc200525c741', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 18', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000019', '09c82434-641a-4083-827e-901941715e1a', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 19', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000020', 'a42e89c6-016e-4daf-9355-842835a7d4f6', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 20', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000021', '7102011f-36f6-4d6c-beb4-86e589b12d88', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 21', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000022', '794db2bd-efcc-40f7-9647-9206cd12c908', 'c69880d3-40be-4554-812a-2c9cf8548068', (SELECT id FROM schedules WHERE route_id = 'c69880d3-40be-4554-812a-2c9cf8548068' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Tirupur Unique Stop 22', 50.00, 'confirmed', NOW());

-- Add some high-capacity routes with available seats to serve as transfer targets
-- Fill GURUVAREDDIYUR route with some passengers but leave capacity for transfers
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- Add some passengers to GURUVAREDDIYUR for Sept 13-15 but keep capacity available
('h1000001-0001-0001-0001-000000000001', 'bb1e81b4-9c2f-466e-9486-3815bff3fb37', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', (SELECT id FROM schedules WHERE route_id = '7cec33ce-8c0d-4f93-8f3d-1b3e71924499' AND schedule_date = '2025-09-13' LIMIT 1), '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('h1000001-0001-0001-0001-000000000002', 'bb1e81b4-9c2f-466e-9486-3815bff3fb37', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', (SELECT id FROM schedules WHERE route_id = '7cec33ce-8c0d-4f93-8f3d-1b3e71924499' AND schedule_date = '2025-09-14' LIMIT 1), '2025-09-14', 'Main Stop', 50.00, 'confirmed', NOW()),
('h1000001-0001-0001-0001-000000000003', 'bb1e81b4-9c2f-466e-9486-3815bff3fb37', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', (SELECT id FROM schedules WHERE route_id = '7cec33ce-8c0d-4f93-8f3d-1b3e71924499' AND schedule_date = '2025-09-15' LIMIT 1), '2025-09-15', 'Main Stop', 50.00, 'confirmed', NOW());

-- Summary of test data created:
-- Sept 13, 2025:
--   - ERODE route: 8 passengers (Full Transfer with Regular+Possible stops)
--   - SALEM route: 12 passengers (Full Transfer with Regular+Possible stops)
--   - GOBI route: 10 passengers (Full Transfer with Regular stops only)
--
-- Sept 14, 2025:
--   - ATHANI route: 20 passengers (Partial Transfer - 5 can transfer, 15 cannot)
--   - KOLATHUR route: 18 passengers (Partial Transfer - 6 can transfer, 12 cannot)
--
-- Sept 15, 2025:
--   - CHENNAMPATTI route: 15 passengers (No Transfer - unique stops only)
--   - TIRUPUR route: 22 passengers (No Transfer - unique stops only)
--
-- All dates have GURUVAREDDIYUR as high-capacity target route with available seats
