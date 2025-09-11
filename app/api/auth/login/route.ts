import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { adminId, password } = await request.json();

    // Validate input
    if (!adminId || !password) {
      return NextResponse.json(
        { error: 'Missing admin ID or password' },
        { status: 400 }
      );
    }

    // Create Supabase admin client (server-side only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Query the admin_login_mapping table to authenticate
    const { data: loginData, error: loginError } = await supabaseAdmin
      .from('admin_login_mapping')
      .select('admin_user_id, password')
      .eq('admin_id', adminId.toUpperCase())
      .single();

    if (loginError || !loginData) {
      return NextResponse.json(
        { error: 'Invalid Admin ID' },
        { status: 401 }
      );
    }

    // For demo purposes, we'll check against plain text password
    // In production, you'd hash the input password and compare
    if (loginData.password !== password) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Get full admin user details
    const { data: adminUser, error: userError } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('id', loginData.admin_user_id)
      .single();

    if (userError || !adminUser) {
      return NextResponse.json(
        { error: 'User details not found' },
        { status: 404 }
      );
    }

    // Return user data (without sensitive information)
    return NextResponse.json({
      success: true,
      user: {
        id: adminUser.id,
        name: adminUser.name,
        role: adminUser.role,
        email: adminUser.email,
        adminId: adminId.toUpperCase()
      }
    });

  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
} 