import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Search for staff by email or name
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: false,
        error: 'Search query must be at least 2 characters'
      }, { status: 400 });
    }

    // Search for staff by email or name (case-insensitive)
    const { data: staff, error } = await supabase
      .from('admin_users')
      .select('id, name, email, role, avatar, is_active')
      .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Error searching staff:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to search staff members' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      staff: staff || [],
      count: staff?.length || 0
    });

  } catch (error) {
    console.error('Error in staff search API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
