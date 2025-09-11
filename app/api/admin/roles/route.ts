import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  is_system_role: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateRoleData {
  name: string;
  description: string;
  permissions: string[];
}

interface UpdateRoleData {
  name?: string;
  description?: string;
  permissions?: string[];
}

// Default system permissions
const SYSTEM_PERMISSIONS = [
  // User Management
  'users.view',
  'users.create',
  'users.edit',
  'users.delete',
  'users.manage_roles',
  
  // Route Management
  'routes.view',
  'routes.create',
  'routes.edit',
  'routes.delete',
  'routes.manage_schedules',
  
  // Schedule Management
  'schedules.view',
  'schedules.create',
  'schedules.edit',
  'schedules.delete',
  'schedules.approve',
  
  // Booking Management
  'bookings.view',
  'bookings.create',
  'bookings.edit',
  'bookings.cancel',
  'bookings.manage_payments',
  
  // Vehicle Management
  'vehicles.view',
  'vehicles.create',
  'vehicles.edit',
  'vehicles.delete',
  'vehicles.assign_drivers',
  
  // Driver Management
  'drivers.view',
  'drivers.create',
  'drivers.edit',
  'drivers.delete',
  'drivers.manage_assignments',
  
  // Payment Management
  'payments.view',
  'payments.process',
  'payments.refund',
  'payments.manage_fees',
  
  // Settings Management
  'settings.view',
  'settings.edit',
  'settings.system',
  
  // Reports & Analytics
  'reports.view',
  'reports.export',
  'analytics.view',
  
  // System Administration
  'system.admin',
  'system.audit_logs',
  'system.api_keys'
];

// GET - Fetch all roles and permissions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includePermissions = searchParams.get('includePermissions') === 'true';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch roles
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch roles' },
        { status: 500 }
      );
    }

    let response: any = {
      success: true,
      data: roles || []
    };

    // Include system permissions if requested
    if (includePermissions) {
      response.permissions = SYSTEM_PERMISSIONS;
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Error in roles API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new role
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, permissions } = body as CreateRoleData;

    // Validate required fields
    if (!name || !description) {
      return NextResponse.json(
        { error: 'Name and description are required' },
        { status: 400 }
      );
    }

    // Validate permissions
    if (permissions && permissions.length > 0) {
      const invalidPermissions = permissions.filter(p => !SYSTEM_PERMISSIONS.includes(p));
      if (invalidPermissions.length > 0) {
        return NextResponse.json(
          { error: `Invalid permissions: ${invalidPermissions.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if role name already exists
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('id')
      .eq('name', name)
      .single();

    if (existingRole) {
      return NextResponse.json(
        { error: 'Role name already exists' },
        { status: 400 }
      );
    }

    // Create role
    const { data: role, error } = await supabase
      .from('user_roles')
      .insert({
        name,
        description,
        permissions: permissions || [],
        is_system_role: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to create role' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: role,
      message: 'Role created successfully'
    });

  } catch (error: any) {
    console.error('Error in roles POST:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update role
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Role ID is required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if role exists and is not a system role
    const { data: existingRole, error: fetchError } = await supabase
      .from('user_roles')
      .select('id, is_system_role')
      .eq('id', id)
      .single();

    if (fetchError || !existingRole) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      );
    }

    if (existingRole.is_system_role) {
      return NextResponse.json(
        { error: 'Cannot modify system roles' },
        { status: 403 }
      );
    }

    // Validate permissions if provided
    if (updateData.permissions && updateData.permissions.length > 0) {
      const invalidPermissions = updateData.permissions.filter((p: string) => !SYSTEM_PERMISSIONS.includes(p));
      if (invalidPermissions.length > 0) {
        return NextResponse.json(
          { error: `Invalid permissions: ${invalidPermissions.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Update role
    const { data: role, error } = await supabase
      .from('user_roles')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to update role' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: role,
      message: 'Role updated successfully'
    });

  } catch (error: any) {
    console.error('Error in roles PUT:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete role
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Role ID is required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if role exists and is not a system role
    const { data: existingRole, error: fetchError } = await supabase
      .from('user_roles')
      .select('id, is_system_role, name')
      .eq('id', id)
      .single();

    if (fetchError || !existingRole) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      );
    }

    if (existingRole.is_system_role) {
      return NextResponse.json(
        { error: 'Cannot delete system roles' },
        { status: 403 }
      );
    }

    // Check if role is assigned to any users
    const { data: usersWithRole, error: usersError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('role', existingRole.name)
      .limit(1);

    if (usersError) {
      console.error('Error checking users:', usersError);
      return NextResponse.json(
        { error: 'Failed to check role usage' },
        { status: 500 }
      );
    }

    if (usersWithRole && usersWithRole.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete role that is assigned to users' },
        { status: 400 }
      );
    }

    // Delete role
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to delete role' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Role deleted successfully'
    });

  } catch (error: any) {
    console.error('Error in roles DELETE:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 