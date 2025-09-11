import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Simple test endpoint to debug assignment issues
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { grievanceId, assignedTo } = body;
    
    console.log('🧪 TEST: Starting simple assignment test');
    console.log('🧪 Grievance ID:', grievanceId);
    console.log('🧪 Assigned To:', assignedTo);
    
    // Test 1: Check if grievance exists
    console.log('🧪 TEST 1: Checking if grievance exists...');
    const { data: grievance, error: grievanceError } = await supabaseAdmin
      .from('grievances')
      .select('id, status, assigned_to')
      .eq('id', grievanceId)
      .single();
    
    if (grievanceError) {
      console.error('🧪 TEST 1 FAILED:', grievanceError);
      return NextResponse.json({ error: 'Grievance not found', details: grievanceError }, { status: 404 });
    }
    
    console.log('🧪 TEST 1 PASSED:', grievance);
    
    // Test 2: Check if admin user exists
    console.log('🧪 TEST 2: Checking if admin user exists...');
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, name, role')
      .eq('id', assignedTo)
      .single();
    
    if (adminError) {
      console.error('🧪 TEST 2 FAILED:', adminError);
      return NextResponse.json({ error: 'Admin user not found', details: adminError }, { status: 404 });
    }
    
    console.log('🧪 TEST 2 PASSED:', admin);
    
    // Test 3: Simple update (just assigned_to)
    console.log('🧪 TEST 3: Attempting simple update...');
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('grievances')
      .update({ 
        assigned_to: assignedTo,
        updated_at: new Date().toISOString()
      })
      .eq('id', grievanceId)
      .select('id, assigned_to, status, updated_at')
      .single();
    
    if (updateError) {
      console.error('🧪 TEST 3 FAILED:', updateError);
      return NextResponse.json({ error: 'Update failed', details: updateError }, { status: 500 });
    }
    
    console.log('🧪 TEST 3 PASSED:', updated);
    
    return NextResponse.json({
      success: true,
      message: 'All tests passed!',
      tests: {
        grievanceExists: !!grievance,
        adminExists: !!admin,
        updateSuccessful: !!updated
      },
      data: {
        original: grievance,
        admin: admin,
        updated: updated
      }
    });
    
  } catch (error) {
    console.error('🧪 TEST ERROR:', error);
    return NextResponse.json({ error: 'Test failed', details: error.message }, { status: 500 });
  }
} 