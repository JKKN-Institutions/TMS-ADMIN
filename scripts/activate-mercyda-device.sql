-- Activate MERCYDA GPS Device to make it available in vehicle assignment dropdown
-- This fixes the issue where MERCYDA device doesn't appear in vehicle GPS device dropdown

UPDATE gps_devices 
SET 
    status = 'active',
    updated_at = NOW()
WHERE device_id = 'MERCYDA001';

-- Verify the update
SELECT 
    device_id,
    device_name,
    status,
    updated_at
FROM gps_devices 
WHERE device_id = 'MERCYDA001';

-- Show all active GPS devices that will appear in vehicle dropdown
SELECT 
    device_id,
    device_name,
    status,
    device_model
FROM gps_devices 
WHERE status = 'active'
ORDER BY device_name; 