import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    console.log('🔍 Testing grievance_communications table access...');

    // Test 1: Check if table exists
    const { data: tableCheck, error: tableError } = await supabaseAdmin
      .from('grievance_communications')
      .select('id')
      .limit(1);

    if (tableError) {
      console.error('❌ Table access error:', tableError);
      return NextResponse.json({
        success: false,
        error: 'Table access failed',
        details: tableError.message,
        code: tableError.code
      }, { status: 500 });
    }

    console.log('✅ Table accessible');

    // Test 2: Check table structure
    const { data: structure, error: structureError } = await supabaseAdmin
      .rpc('get_table_columns', { table_name: 'grievance_communications' });

    if (structureError) {
      console.log('⚠️ Could not get table structure (this is normal if RPC not available)');
    }

    // Test 3: Check if there are any communications
    const { data: count, error: countError } = await supabaseAdmin
      .from('grievance_communications')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Count error:', countError);
      return NextResponse.json({
        success: false,
        error: 'Count failed',
        details: countError.message
      }, { status: 500 });
    }

    console.log('✅ Count successful:', count);

    // Test 4: Check if grievances table exists
    const { data: grievances, error: grievancesError } = await supabaseAdmin
      .from('grievances')
      .select('id')
      .limit(1);

    if (grievancesError) {
      console.error('❌ Grievances table error:', grievancesError);
      return NextResponse.json({
        success: false,
        error: 'Grievances table access failed',
        details: grievancesError.message
      }, { status: 500 });
    }

    console.log('✅ Grievances table accessible');

    return NextResponse.json({
      success: true,
      message: 'All tests passed',
      communications_count: count,
      table_accessible: true,
      grievances_accessible: true
    });

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 