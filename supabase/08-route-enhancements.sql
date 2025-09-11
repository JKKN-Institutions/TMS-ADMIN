-- Route Management Enhancements
-- Migration: Add constraints and validation for routes

-- Add unique constraint for route numbers
ALTER TABLE routes ADD CONSTRAINT unique_route_number UNIQUE (route_number);

-- Add check constraint for valid coordinates
ALTER TABLE routes ADD CONSTRAINT valid_coordinates 
CHECK (
  (start_latitude IS NULL OR (start_latitude >= -90 AND start_latitude <= 90)) AND
  (start_longitude IS NULL OR (start_longitude >= -180 AND start_longitude <= 180)) AND
  (end_latitude IS NULL OR (end_latitude >= -90 AND end_latitude <= 90)) AND
  (end_longitude IS NULL OR (end_longitude >= -180 AND end_longitude <= 180))
);

-- Add check constraint for positive values
ALTER TABLE routes ADD CONSTRAINT positive_values 
CHECK (
  distance > 0 AND
  total_capacity > 0 AND
  fare >= 0 AND
  current_passengers >= 0
);

-- Add check constraint for logical time sequence
ALTER TABLE routes ADD CONSTRAINT logical_times 
CHECK (arrival_time > departure_time);

-- Add indexes for better performance
CREATE INDEX idx_routes_status ON routes(status);
CREATE INDEX idx_routes_driver_id ON routes(driver_id);
CREATE INDEX idx_routes_vehicle_id ON routes(vehicle_id);
CREATE INDEX idx_routes_coordinates ON routes(start_latitude, start_longitude, end_latitude, end_longitude);

-- Add indexes for route_stops
CREATE INDEX idx_route_stops_route_id ON route_stops(route_id);
CREATE INDEX idx_route_stops_sequence ON route_stops(route_id, sequence_order);
CREATE INDEX idx_route_stops_coordinates ON route_stops(latitude, longitude);

-- Migration complete: Added constraints and indexes for route management 