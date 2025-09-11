import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: string;
  permissions: string[];
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

interface CreateUserData {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: string;
  permissions?: string[];
  is_active?: boolean;
}

interface UpdateUserData {
  email?: string;
  full_name?: string;
  phone?: string;
  role?: string;
  permissions?: string[];
  is_active?: boolean;
}

interface BulkOperation {
  operation: 'create' | 'update' | 'delete' | 'activate' | 'deactivate';
  users: any[];
}

// GET - Fetch users with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';
    const status = searchParams.get('status') || '';
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Start building query
    let query = supabase
      .from('admin_users')
      .select(`
        id,
        email,
        full_name,
        phone,
        role,
        permissions,
        is_active,
        last_login,
        created_at,
        updated_at
      `, { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (role) {
      query = query.eq('role', role);
    }

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: users, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    // Calculate pagination info
    const totalPages = Math.ceil((count || 0) / limit);

    return NextResponse.json({
      success: true,
      data: users || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error: any) {
    console.error('Error in users API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new user or handle bulk operations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'bulk') {
      return await handleBulkOperation(supabase, data as BulkOperation);
    } else {
      return await createUser(supabase, data as CreateUserData);
    }

  } catch (error: any) {
    console.error('Error in users POST:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update user
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
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

    // Update user
    const { data: user, error } = await supabase
      .from('admin_users')
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
        { error: 'Failed to update user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
      message: 'User updated successfully'
    });

  } catch (error: any) {
    console.error('Error in users PUT:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
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

    // Delete user
    const { error } = await supabase
      .from('admin_users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to delete user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error: any) {
    console.error('Error in users DELETE:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to create a new user
async function createUser(supabase: any, userData: CreateUserData) {
  const { email, password, full_name, phone, role, permissions, is_active } = userData;

  // Validate required fields
  if (!email || !password || !full_name || !role) {
    return NextResponse.json(
      { error: 'Email, password, full name, and role are required' },
      { status: 400 }
    );
  }

  // Create user in auth
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name,
      role
    }
  });

  if (authError) {
    console.error('Auth error:', authError);
    return NextResponse.json(
      { error: authError.message || 'Failed to create user authentication' },
      { status: 400 }
    );
  }

  // Create user profile
  const { data: user, error: profileError } = await supabase
    .from('admin_users')
    .insert({
      id: authUser.user.id,
      email,
      full_name,
      phone: phone || null,
      role,
      permissions: permissions || [],
      is_active: is_active !== undefined ? is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (profileError) {
    console.error('Profile error:', profileError);
    // Clean up auth user if profile creation fails
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json(
      { error: 'Failed to create user profile' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: user,
    message: 'User created successfully'
  });
}

// Helper function to handle bulk operations
async function handleBulkOperation(supabase: any, operation: BulkOperation) {
  const { operation: op, users } = operation;

  if (!users || !Array.isArray(users) || users.length === 0) {
    return NextResponse.json(
      { error: 'Users array is required for bulk operations' },
      { status: 400 }
    );
  }

  try {
    let results: any[] = [];
    let errors: any[] = [];

    switch (op) {
      case 'create':
        for (const userData of users) {
          try {
            const result = await createUser(supabase, userData);
            const resultData = await result.json();
            if (resultData.success) {
              results.push(resultData.data);
            } else {
              errors.push({ user: userData.email, error: resultData.error });
            }
          } catch (error: any) {
            errors.push({ user: userData.email, error: error.message });
          }
        }
        break;

      case 'activate':
      case 'deactivate':
        const isActive = op === 'activate';
        const userIds = users.map(u => u.id);
        
        const { data: updatedUsers, error } = await supabase
          .from('admin_users')
          .update({ 
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .in('id', userIds)
          .select();

        if (error) {
          return NextResponse.json(
            { error: `Failed to ${op} users` },
            { status: 500 }
          );
        }

        results = updatedUsers;
        break;

      case 'delete':
        const deleteIds = users.map(u => u.id);
        
        const { error: deleteError } = await supabase
          .from('admin_users')
          .delete()
          .in('id', deleteIds);

        if (deleteError) {
          return NextResponse.json(
            { error: 'Failed to delete users' },
            { status: 500 }
          );
        }

        results = deleteIds.map(id => ({ id, deleted: true }));
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid bulk operation' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        errors,
        processed: results.length,
        failed: errors.length
      },
      message: `Bulk ${op} completed. Processed: ${results.length}, Failed: ${errors.length}`
    });

  } catch (error: any) {
    console.error('Bulk operation error:', error);
    return NextResponse.json(
      { error: `Bulk ${op} failed: ${error.message}` },
      { status: 500 }
    );
  }
} 