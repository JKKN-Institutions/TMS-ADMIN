import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Temporary endpoint to create missing admin users
export async function POST() {
  try {
    const adminUsers = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Super Administrator',
        email: 'superadmin@tms.local',
        role: 'super_admin'
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Transport Manager',
        email: 'transport@tms.local',
        role: 'transport_manager'
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Finance Administrator',
        email: 'finance@tms.local',
        role: 'finance_admin'
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Operations Administrator',
        email: 'operations@tms.local',
        role: 'operations_admin'
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Data Entry Operator',
        email: 'dataentry@tms.local',
        role: 'data_entry'
      }
    ];

    console.log('🔧 Creating admin users...');
    
    const results = [];
    for (const user of adminUsers) {
      const { data, error } = await supabaseAdmin
        .from('admin_users')
        .upsert({
          ...user,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Error creating user ${user.name}:`, error);
        results.push({ user: user.name, success: false, error: error.message });
      } else {
        console.log(`✅ Created user ${user.name}`);
        results.push({ user: user.name, success: true, data });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Admin users creation completed',
      results
    });

  } catch (error) {
    console.error('❌ Error creating admin users:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create admin users',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 