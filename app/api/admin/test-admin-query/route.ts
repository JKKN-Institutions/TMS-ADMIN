import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { adminId } = await request.json();
    
    console.log('🧪 Testing admin user query...');
    console.log('🧪 Admin ID to search:', adminId);
    console.log('🧪 Admin ID type:', typeof adminId);
    
    // Test 1: Check if admin_users table exists and is accessible
    console.log('🧪 TEST 1: Checking admin_users table access...');
    const { data: allAdmins, error: allAdminsError } = await supabaseAdmin
      .from('admin_users')
      .select('id, name, email, role')
      .limit(5);
    
    if (allAdminsError) {
      console.error('🧪 TEST 1 FAILED - Cannot access admin_users table:', allAdminsError);
      return NextResponse.json({
        success: false,
        test: 'table_access',
        error: allAdminsError,
        message: 'Cannot access admin_users table'
      });
    }
    
    console.log('🧪 TEST 1 PASSED - Found admin users:', allAdmins);
    
    // Test 2: Search for specific admin ID
    console.log('🧪 TEST 2: Searching for specific admin ID...');
    const { data: specificAdmin, error: specificAdminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, name, email, role')
      .eq('id', adminId)
      .single();
    
    if (specificAdminError) {
      console.error('🧪 TEST 2 FAILED - Cannot find specific admin:', specificAdminError);
      
      // Test 2b: Try without .single() to see if record exists
      const { data: adminWithoutSingle, error: withoutSingleError } = await supabaseAdmin
        .from('admin_users')
        .select('id, name, email, role')
        .eq('id', adminId);
      
      console.log('🧪 TEST 2b - Without single():', { data: adminWithoutSingle, error: withoutSingleError });
      
      return NextResponse.json({
        success: false,
        test: 'specific_admin_search',
        error: specificAdminError,
        allAdmins: allAdmins,
        searchResult: adminWithoutSingle,
        message: 'Cannot find specific admin'
      });
    }
    
    console.log('🧪 TEST 2 PASSED - Found specific admin:', specificAdmin);
    
    // Test 3: Verify the assignment API logic
    console.log('🧪 TEST 3: Testing assignment API logic...');
    const assigned_to = adminId;
    
    if (!assigned_to) {
      return NextResponse.json({
        success: false,
        test: 'assignment_logic',
        message: 'assigned_to is missing'
      });
    }
    
    return NextResponse.json({
      success: true,
      tests: {
        tableAccess: 'PASSED',
        specificAdminSearch: 'PASSED',
        assignmentLogic: 'PASSED'
      },
      data: {
        allAdmins: allAdmins,
        foundAdmin: specificAdmin,
        searchCriteria: { adminId, type: typeof adminId }
      },
      message: 'All tests passed - admin user query should work'
    });
    
  } catch (error) {
    console.error('🧪 TEST ERROR:', error);
    return NextResponse.json({
      success: false,
      test: 'general_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'General test failure'
    });
  }
} 