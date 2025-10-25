-- Migration: Staff Route Assignments Table
-- Description: Enables admin users (staff) to be assigned to routes for monitoring and management
-- Created: 2025-10-25

-- Create the staff_route_assignments table
CREATE TABLE staff_route_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure a staff member can be assigned to the same route only once (active assignments)
  UNIQUE(staff_id, route_id, is_active)
);

-- Create indexes for performance
CREATE INDEX idx_staff_route_assignments_staff_id ON staff_route_assignments(staff_id);
CREATE INDEX idx_staff_route_assignments_route_id ON staff_route_assignments(route_id);
CREATE INDEX idx_staff_route_assignments_is_active ON staff_route_assignments(is_active);
CREATE INDEX idx_staff_route_assignments_assigned_by ON staff_route_assignments(assigned_by);

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_staff_route_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_staff_route_assignments_updated_at
  BEFORE UPDATE ON staff_route_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_staff_route_assignments_updated_at();

-- Add comment to table for documentation
COMMENT ON TABLE staff_route_assignments IS 'Stores assignments of admin staff members to routes for monitoring and management purposes';
COMMENT ON COLUMN staff_route_assignments.staff_id IS 'References admin_users.id - the staff member being assigned';
COMMENT ON COLUMN staff_route_assignments.route_id IS 'References routes.id - the route being assigned';
COMMENT ON COLUMN staff_route_assignments.assigned_by IS 'References admin_users.id - the admin who created this assignment';
COMMENT ON COLUMN staff_route_assignments.is_active IS 'Whether this assignment is currently active';
COMMENT ON COLUMN staff_route_assignments.notes IS 'Optional notes about the assignment';
