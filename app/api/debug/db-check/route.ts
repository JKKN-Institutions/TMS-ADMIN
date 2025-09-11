import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        error: 'Missing environment variables',
        supabaseUrl: !!supabaseUrl,
        serviceKey: !!supabaseServiceKey
      }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Test basic connection
    const { data: connectionTest, error: connectionError } = await supabaseAdmin
      .from('admin_users')
      .select('count')
      .limit(1);

    if (connectionError) {
      return NextResponse.json({
        error: 'Database connection failed',
        details: connectionError.message,
        code: connectionError.code
      }, { status: 500 });
    }

    // Check if tables exist
    const { data: adminUsersCount, error: adminUsersError } = await supabaseAdmin
      .from('admin_users')
      .select('*', { count: 'exact', head: true });

    const { data: loginMappingCount, error: loginMappingError } = await supabaseAdmin
      .from('admin_login_mapping')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      connection: 'OK',
      tables: {
        admin_users: {
          exists: !adminUsersError,
          count: adminUsersCount?.length || 0,
          error: adminUsersError?.message || null
        },
        admin_login_mapping: {
          exists: !loginMappingError,
          count: loginMappingCount?.length || 0,
          error: loginMappingError?.message || null
        }
      }
    });

  } catch (error) {
    console.error('Database check error:', error);
    return NextResponse.json({
      error: 'Database check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
