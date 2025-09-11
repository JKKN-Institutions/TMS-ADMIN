-- Add MERCYDA GPS Device to the system
-- This script adds the MERCYDA TRACKING device with the provided credentials

INSERT INTO gps_devices (
    device_id,
    device_name,
    device_model,
    sim_number,
    imei,
    status,
    notes,
    created_at,
    updated_at
) VALUES (
    'MERCYDA001',
    'MERCYDA Bus Tracker',
    'MERCYDA TRACKING',
    NULL, -- No SIM number provided
    NULL, -- No IMEI provided
    'inactive', -- Start as inactive, will be activated after configuration
    'MERCYDA third-party GPS service integration for JKKN transport. Username: ats@jkkn.org, Password: 123456. This device represents the MERCYDA tracking service API integration.',
    NOW(),
    NOW()
) ON CONFLICT (device_id) DO UPDATE SET
    device_name = EXCLUDED.device_name,
    device_model = EXCLUDED.device_model,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- Update device status to active if GPS tracking is already working
-- UPDATE gps_devices SET status = 'active' WHERE device_id = 'MERCYDA001';

SELECT 
    id,
    device_id,
    device_name,
    device_model,
    status,
    created_at
FROM gps_devices 
WHERE device_id = 'MERCYDA001'; 