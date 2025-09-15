-- Test Data for Route Optimization Scenarios (Sept 13-15, 2025)
-- This will create 7 different route scenarios:
-- 3 Full Transfers: 2 with regular+possible stops, 1 with regular stops only
-- 2 Partial Transfers: Some passengers can transfer, others cannot
-- 2 No Transfers: No suitable alternative routes found

-- First, let's ensure we have enough routes with different stop patterns
-- We'll use existing routes and add some strategic bookings

-- Clear existing bookings for our test dates
DELETE FROM bookings WHERE trip_date IN ('2025-09-13', '2025-09-14', '2025-09-15');

-- SCENARIO 1: Full Transfer with Regular + Possible Stops (Route: ERODE)
-- Low crowd route with passengers that can transfer using possible stops
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 8 passengers on ERODE route (low crowd) - can transfer to GURUVAREDDIYUR using possible stops
('f1000001-0001-0001-0001-000000000001', '4bdf32a8-c62d-479d-a1e3-deb1fea78a00', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', '2025-09-13', 'ERODE Main', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000002', '18b54c9a-133c-4a4c-aa0e-e0f99bf83aa0', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', '2025-09-13', 'ERODE Main', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000003', 'b0cd3fd9-5687-4874-8d83-98db62c59131', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', '2025-09-13', 'Erode Central', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000004', '4ce9aff0-93db-4280-aca0-ff5586d81727', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', '2025-09-13', 'Erode Central', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000005', '025df8eb-196a-4fec-ad07-5d84896584b1', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', '2025-09-13', 'Erode Junction', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000006', '30c908ce-8004-4327-b0d9-232630f2c8ab', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', '2025-09-13', 'Erode Junction', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000007', '2adb7788-98f4-4050-ae4a-9ada06fe5d9e', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', '2025-09-13', 'Perundurai', 50.00, 'confirmed', NOW()),
('f1000001-0001-0001-0001-000000000008', '3ee95c3c-454b-4294-a23f-261f5d9931ff', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30', '2025-09-13', 'Perundurai', 50.00, 'confirmed', NOW());

-- SCENARIO 2: Full Transfer with Regular + Possible Stops (Route: SALEM)
-- Low crowd route with passengers that can transfer using possible stops
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 12 passengers on SALEM route (low crowd) - can transfer to GURUVAREDDIYUR using possible stops
('f2000001-0001-0001-0001-000000000001', 'd24dd48b-de71-4e48-9421-842f17795102', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000002', '7db6db48-7245-4903-b06c-4541bf2f9220', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000003', '105de4e8-fdc6-4f84-b0bc-e0cb6d268c44', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Salem Junction', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000004', 'b89a961f-416b-4baa-83fe-2a515dd3f195', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Salem Junction', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000005', '4728b8b6-a996-4802-bb4a-18404e4a1689', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Salem Central', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000006', '0a5f5732-c5f6-485e-83b9-4ec962590f7c', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Salem Central', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000007', '8773e92f-e698-4b6a-802a-9291ee88649c', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Attur', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000008', '00aa2017-3503-4ab1-92b9-c20e993c2ed5', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Attur', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000009', 'b01b055a-ddfe-4b00-a258-6117214e4006', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Pethanayakanpalayam', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000010', 'a1fd2d06-3468-4374-a334-b239699a8d13', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Pethanayakanpalayam', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000011', 'eee598fe-7f8d-4c8c-82bb-eeab5f945cad', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Rasipuram', 50.00, 'confirmed', NOW()),
('f2000001-0001-0001-0001-000000000012', '5a671cb9-552f-41c9-a017-fc13d906e396', '693019fd-f366-4d3f-8c03-45827ddbefa7', '693019fd-f366-4d3f-8c03-45827ddbefa7', '2025-09-13', 'Rasipuram', 50.00, 'confirmed', NOW());

-- SCENARIO 3: Full Transfer with Regular Stops Only (Route: GOBI)
-- Low crowd route where passengers can transfer using only regular stops (no possible stops needed)
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 10 passengers on GOBI route - can transfer to GURUVAREDDIYUR using regular stops only
('f3000001-0001-0001-0001-000000000001', 'b72d1f1c-437f-4d95-95de-02b136de5971', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000002', 'c236869c-1985-470a-b984-72a2ee7e84ba', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000003', '0fd18445-214c-4d67-a761-d0301edf70c0', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Gobi Bus Stand', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000004', '62c25f21-b457-45be-a3a1-4b64bb1d2e3c', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Gobi Bus Stand', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000005', 'b63ef68c-1e93-4b6f-842d-59d7dfb4a462', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Anthiyur', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000006', '0b953f65-1e5c-4f85-85d9-7803f6346c6b', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Anthiyur', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000007', 'c49e4cde-305f-4227-9ac5-f290e8921343', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Sathyamangalam', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000008', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Sathyamangalam', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000009', '7102011f-36f6-4d6c-beb4-86e589b12d88', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('f3000001-0001-0001-0001-000000000010', '794db2bd-efcc-40f7-9647-9206cd12c908', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW());

-- SCENARIO 4: Partial Transfer (Route: ATHANI)
-- Some passengers can transfer, others cannot due to stop mismatches
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 20 passengers on ATHANI route - only some can transfer
('p1000001-0001-0001-0001-000000000001', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000002', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000003', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000004', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000005', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Appakudal Vijaya Colony', 50.00, 'confirmed', NOW()),
-- These passengers board at stops that don't exist in other routes (no transfer possible)
('p1000001-0001-0001-0001-000000000006', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 1', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000007', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 2', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000008', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 3', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000009', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 4', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000010', '33d5141c-e13b-4580-b7be-1a6a9578edef', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 5', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000011', 'c30312a1-0b97-4aa8-8451-dc200525c741', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 6', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000012', '09c82434-641a-4083-827e-901941715e1a', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 7', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000013', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 8', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000014', '7102011f-36f6-4d6c-beb4-86e589b12d88', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 9', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000015', '794db2bd-efcc-40f7-9647-9206cd12c908', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 10', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000016', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 11', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000017', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 12', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000018', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 13', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000019', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 14', 50.00, 'confirmed', NOW()),
('p1000001-0001-0001-0001-000000000020', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2025-09-14', 'Athani Unique Stop 15', 50.00, 'confirmed', NOW());

-- SCENARIO 5: Partial Transfer (Route: KOLATHUR)
-- Some passengers can transfer, others cannot
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 18 passengers on KOLATHUR route - only some can transfer
('p2000001-0001-0001-0001-000000000001', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Main Stop', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000002', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Main Stop', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000003', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Main Stop', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000004', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Junction', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000005', '33d5141c-e13b-4580-b7be-1a6a9578edef', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Junction', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000006', 'c30312a1-0b97-4aa8-8451-dc200525c741', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Junction', 50.00, 'confirmed', NOW()),
-- These passengers board at unique stops (no transfer possible)
('p2000001-0001-0001-0001-000000000007', '09c82434-641a-4083-827e-901941715e1a', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 1', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000008', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 2', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000009', '7102011f-36f6-4d6c-beb4-86e589b12d88', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 3', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000010', '794db2bd-efcc-40f7-9647-9206cd12c908', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 4', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000011', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 5', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000012', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 6', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000013', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 7', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000014', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 8', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000015', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 9', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000016', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 10', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000017', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 11', 50.00, 'confirmed', NOW()),
('p2000001-0001-0001-0001-000000000018', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '2025-09-14', 'Kolathur Unique Stop 12', 50.00, 'confirmed', NOW());

-- SCENARIO 6: No Transfer (Route: DHARAPURAM)
-- Low crowd route but no alternative routes have matching stops
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 15 passengers on DHARAPURAM route - no transfers possible due to unique stops
('n1000001-0001-0001-0001-000000000001', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 1', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000002', '33d5141c-e13b-4580-b7be-1a6a9578edef', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 2', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000003', 'c30312a1-0b97-4aa8-8451-dc200525c741', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 3', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000004', '09c82434-641a-4083-827e-901941715e1a', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 4', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000005', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 5', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000006', '7102011f-36f6-4d6c-beb4-86e589b12d88', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 6', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000007', '794db2bd-efcc-40f7-9647-9206cd12c908', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 7', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000008', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 8', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000009', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 9', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000010', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 10', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000011', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 11', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000012', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 12', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000013', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 13', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000014', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 14', 50.00, 'confirmed', NOW()),
('n1000001-0001-0001-0001-000000000015', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '2025-09-15', 'Dharapuram Unique Stop 15', 50.00, 'confirmed', NOW());

-- SCENARIO 7: No Transfer (Route: TIRUPUR)
-- Low crowd route but no alternative routes have capacity or matching stops
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- 22 passengers on TIRUPUR route - no transfers possible
('n2000001-0001-0001-0001-000000000001', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 1', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000002', '33d5141c-e13b-4580-b7be-1a6a9578edef', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 2', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000003', 'c30312a1-0b97-4aa8-8451-dc200525c741', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 3', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000004', '09c82434-641a-4083-827e-901941715e1a', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 4', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000005', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 5', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000006', '7102011f-36f6-4d6c-beb4-86e589b12d88', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 6', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000007', '794db2bd-efcc-40f7-9647-9206cd12c908', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 7', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000008', '57398ab4-3e0f-4ef7-8755-e04ced81cc3e', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 8', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000009', 'ad9ef0b5-7af3-4222-81c6-1110657d9f5e', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 9', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000010', '642a4a84-914b-4db0-9d8a-4b7d0ed5b77e', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 10', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000011', 'a43bead7-7371-4173-a77c-2efd3375b5fa', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 11', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000012', 'aba30ee5-3ac8-44b4-8d24-5527cdb1c485', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 12', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000013', '8dea5d8f-56c9-4895-aff5-2b10e44b5bf1', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 13', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000014', 'fe25760b-a448-4b0a-b5cb-1dd284de7c9e', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 14', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000015', '7d6fe202-7c7c-4faf-9e4f-f1386f318c26', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 15', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000016', '00e7c300-6a08-44fa-921e-a2cc4f725c0d', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 16', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000017', '33d5141c-e13b-4580-b7be-1a6a9578edef', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 17', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000018', 'c30312a1-0b97-4aa8-8451-dc200525c741', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 18', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000019', '09c82434-641a-4083-827e-901941715e1a', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 19', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000020', 'a42e89c6-016e-4daf-9355-842835a7d4f6', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 20', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000021', '7102011f-36f6-4d6c-beb4-86e589b12d88', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 21', 50.00, 'confirmed', NOW()),
('n2000001-0001-0001-0001-000000000022', '794db2bd-efcc-40f7-9647-9206cd12c908', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', '2025-09-15', 'Tirupur Unique Stop 22', 50.00, 'confirmed', NOW());

-- Add some high-capacity routes with available seats to serve as transfer targets
-- Fill GURUVAREDDIYUR route with some passengers but leave capacity for transfers
INSERT INTO bookings (id, student_id, route_id, schedule_id, trip_date, boarding_stop, amount, status, created_at) VALUES
-- Add some passengers to GURUVAREDDIYUR for Sept 13-15 but keep capacity available
('h1000001-0001-0001-0001-000000000001', 'bb1e81b4-9c2f-466e-9486-3815bff3fb37', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-13', 'Main Stop', 50.00, 'confirmed', NOW()),
('h1000001-0001-0001-0001-000000000002', 'bb1e81b4-9c2f-466e-9486-3815bff3fb37', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-14', 'Main Stop', 50.00, 'confirmed', NOW()),
('h1000001-0001-0001-0001-000000000003', 'bb1e81b4-9c2f-466e-9486-3815bff3fb37', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '7cec33ce-8c0d-4f93-8f3d-1b3e71924499', '2025-09-15', 'Main Stop', 50.00, 'confirmed', NOW());

-- Update schedules to reflect the new booking counts
-- Update available_seats and booked_seats for the routes we've added bookings to

-- ERODE route (8 passengers on Sept 13)
UPDATE schedules SET 
    available_seats = total_capacity - 8,
    booked_seats = 8,
    updated_at = NOW()
WHERE route_id = 'bb749cec-ec9d-4195-b6d9-a9d5e036dc30' 
AND departure_date = '2025-09-13';

-- SALEM route (12 passengers on Sept 13)
UPDATE schedules SET 
    available_seats = total_capacity - 12,
    booked_seats = 12,
    updated_at = NOW()
WHERE route_id = '693019fd-f366-4d3f-8c03-45827ddbefa7' 
AND departure_date = '2025-09-13';

-- GOBI route (10 passengers on Sept 13)
UPDATE schedules SET 
    available_seats = total_capacity - 10,
    booked_seats = 10,
    updated_at = NOW()
WHERE route_id = '7cec33ce-8c0d-4f93-8f3d-1b3e71924499' 
AND departure_date = '2025-09-13';

-- ATHANI route (20 passengers on Sept 14)
UPDATE schedules SET 
    available_seats = total_capacity - 20,
    booked_seats = 20,
    updated_at = NOW()
WHERE route_id = '22222222-2222-2222-2222-222222222222' 
AND departure_date = '2025-09-14';

-- KOLATHUR route (18 passengers on Sept 14)
UPDATE schedules SET 
    available_seats = total_capacity - 18,
    booked_seats = 18,
    updated_at = NOW()
WHERE route_id = '33333333-3333-3333-3333-333333333333' 
AND departure_date = '2025-09-14';

-- DHARAPURAM route (15 passengers on Sept 15)
UPDATE schedules SET 
    available_seats = total_capacity - 15,
    booked_seats = 15,
    updated_at = NOW()
WHERE route_id = '44444444-4444-4444-4444-444444444444' 
AND departure_date = '2025-09-15';

-- TIRUPUR route (22 passengers on Sept 15)
UPDATE schedules SET 
    available_seats = total_capacity - 22,
    booked_seats = 22,
    updated_at = NOW()
WHERE route_id = '55555555-5555-5555-5555-555555555555' 
AND departure_date = '2025-09-15';

-- GURUVAREDDIYUR route (1 passenger each day, keeping high capacity available)
UPDATE schedules SET 
    available_seats = total_capacity - 1,
    booked_seats = 1,
    updated_at = NOW()
WHERE route_id = '7cec33ce-8c0d-4f93-8f3d-1b3e71924499' 
AND departure_date IN ('2025-09-13', '2025-09-14', '2025-09-15');

-- Add some unique stops to the routes that should have no transfers
-- First, let's add the unique stops to the route_stops table for the no-transfer routes

-- Add unique stops for DHARAPURAM route
INSERT INTO route_stops (id, route_id, stop_name, stop_time, sequence_order, stop_type, created_at) VALUES
('ds000001-0001-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 1', '07:15:00', 1, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 2', '07:20:00', 2, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 3', '07:25:00', 3, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 4', '07:30:00', 4, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 5', '07:35:00', 5, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000006', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 6', '07:40:00', 6, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000007', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 7', '07:45:00', 7, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000008', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 8', '07:50:00', 8, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000009', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 9', '07:55:00', 9, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000010', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 10', '08:00:00', 10, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000011', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 11', '08:05:00', 11, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000012', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 12', '08:10:00', 12, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000013', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 13', '08:15:00', 13, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000014', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 14', '08:20:00', 14, 'regular', NOW()),
('ds000001-0001-0001-0001-000000000015', '44444444-4444-4444-4444-444444444444', 'Dharapuram Unique Stop 15', '08:25:00', 15, 'regular', NOW());

-- Add unique stops for TIRUPUR route
INSERT INTO route_stops (id, route_id, stop_name, stop_time, sequence_order, stop_type, created_at) VALUES
('ts000001-0001-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 1', '07:10:00', 1, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000002', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 2', '07:15:00', 2, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000003', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 3', '07:20:00', 3, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000004', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 4', '07:25:00', 4, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000005', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 5', '07:30:00', 5, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000006', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 6', '07:35:00', 6, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000007', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 7', '07:40:00', 7, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000008', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 8', '07:45:00', 8, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000009', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 9', '07:50:00', 9, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000010', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 10', '07:55:00', 10, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000011', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 11', '08:00:00', 11, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000012', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 12', '08:05:00', 12, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000013', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 13', '08:10:00', 13, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000014', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 14', '08:15:00', 14, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000015', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 15', '08:20:00', 15, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000016', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 16', '08:25:00', 16, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000017', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 17', '08:30:00', 17, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000018', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 18', '08:35:00', 18, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000019', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 19', '08:40:00', 19, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000020', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 20', '08:45:00', 20, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000021', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 21', '08:50:00', 21, 'regular', NOW()),
('ts000001-0001-0001-0001-000000000022', '55555555-5555-5555-5555-555555555555', 'Tirupur Unique Stop 22', '08:55:00', 22, 'regular', NOW());

-- Add unique stops for ATHANI route (partial transfer scenario)
INSERT INTO route_stops (id, route_id, stop_name, stop_time, sequence_order, stop_type, created_at) VALUES
('as000001-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 1', '07:15:00', 6, 'regular', NOW()),
('as000001-0001-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 2', '07:20:00', 7, 'regular', NOW()),
('as000001-0001-0001-0001-000000000003', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 3', '07:25:00', 8, 'regular', NOW()),
('as000001-0001-0001-0001-000000000004', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 4', '07:30:00', 9, 'regular', NOW()),
('as000001-0001-0001-0001-000000000005', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 5', '07:35:00', 10, 'regular', NOW()),
('as000001-0001-0001-0001-000000000006', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 6', '07:40:00', 11, 'regular', NOW()),
('as000001-0001-0001-0001-000000000007', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 7', '07:45:00', 12, 'regular', NOW()),
('as000001-0001-0001-0001-000000000008', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 8', '07:50:00', 13, 'regular', NOW()),
('as000001-0001-0001-0001-000000000009', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 9', '07:55:00', 14, 'regular', NOW()),
('as000001-0001-0001-0001-000000000010', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 10', '08:00:00', 15, 'regular', NOW()),
('as000001-0001-0001-0001-000000000011', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 11', '08:05:00', 16, 'regular', NOW()),
('as000001-0001-0001-0001-000000000012', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 12', '08:10:00', 17, 'regular', NOW()),
('as000001-0001-0001-0001-000000000013', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 13', '08:15:00', 18, 'regular', NOW()),
('as000001-0001-0001-0001-000000000014', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 14', '08:20:00', 19, 'regular', NOW()),
('as000001-0001-0001-0001-000000000015', '22222222-2222-2222-2222-222222222222', 'Athani Unique Stop 15', '08:25:00', 20, 'regular', NOW());

-- Add unique stops for KOLATHUR route (partial transfer scenario)
INSERT INTO route_stops (id, route_id, stop_name, stop_time, sequence_order, stop_type, created_at) VALUES
('ks000001-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 1', '07:20:00', 4, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 2', '07:25:00', 5, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 3', '07:30:00', 6, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 4', '07:35:00', 7, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 5', '07:40:00', 8, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000006', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 6', '07:45:00', 9, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000007', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 7', '07:50:00', 10, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000008', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 8', '07:55:00', 11, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000009', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 9', '08:00:00', 12, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000010', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 10', '08:05:00', 13, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000011', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 11', '08:10:00', 14, 'regular', NOW()),
('ks000001-0001-0001-0001-000000000012', '33333333-3333-3333-3333-333333333333', 'Kolathur Unique Stop 12', '08:15:00', 15, 'regular', NOW());

-- Re-run the possible stops analysis to update the possible stops table
SELECT analyze_and_populate_possible_stops();

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
--   - DHARAPURAM route: 15 passengers (No Transfer - unique stops only)
--   - TIRUPUR route: 22 passengers (No Transfer - unique stops only)
--
-- All dates have GURUVAREDDIYUR as high-capacity target route with available seats
