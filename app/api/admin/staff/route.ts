import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Fallback to real admin users when database function is unavailable
const getRealAdminFallback = () => [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Super Administrator',
    email: 'superadmin@tms.local',
    role: 'super_admin',
    currentWorkload: 0,
    maxCapacity: 50,
    workloadPercentage: 0,
    specializations: ['complaint', 'suggestion', 'compliment', 'technical_issue'],
    skillLevel: 5,
    avgResponseTime: '2 hours',
    recentActivity: new Date().toISOString(),
    performanceRating: 4.5,
    workloadColor: 'text-green-600 bg-green-100',
    isAvailable: true,
    workloadStatus: 'available',
    priorityBreakdown: {}
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Operations Administrator',
    email: 'operations@tms.local',
    role: 'operations_admin',
    currentWorkload: 0,
    maxCapacity: 25,
    workloadPercentage: 0,
    specializations: ['complaint', 'technical_issue', 'suggestion'],
    skillLevel: 4,
    avgResponseTime: '3 hours',
    recentActivity: new Date().toISOString(),
    performanceRating: 4.2,
    workloadColor: 'text-green-600 bg-green-100',
    isAvailable: true,
    workloadStatus: 'available',
    priorityBreakdown: {}
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Transport Manager',
    email: 'transport@tms.local',
    role: 'transport_manager',
    currentWorkload: 0,
    maxCapacity: 30,
    workloadPercentage: 0,
    specializations: ['complaint', 'suggestion'],
    skillLevel: 3,
    avgResponseTime: '4 hours',
    recentActivity: new Date().toISOString(),
    performanceRating: 3.8,
    workloadColor: 'text-green-600 bg-green-100',
    isAvailable: true,
    workloadStatus: 'available',
    priorityBreakdown: {}
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Finance Administrator',
    email: 'finance@tms.local',
    role: 'finance_admin',
    currentWorkload: 0,
    maxCapacity: 20,
    workloadPercentage: 0,
    specializations: ['complaint', 'technical_issue'],
    skillLevel: 4,
    avgResponseTime: '2.5 hours',
    recentActivity: new Date().toISOString(),
    performanceRating: 4.0,
    workloadColor: 'text-green-600 bg-green-100',
    isAvailable: true,
    workloadStatus: 'available',
    priorityBreakdown: {}
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Data Entry Operator',
    email: 'dataentry@tms.local',
    role: 'data_entry',
    currentWorkload: 0,
    maxCapacity: 15,
    workloadPercentage: 0,
    specializations: ['data_entry'],
    skillLevel: 3,
    avgResponseTime: '3 hours',
    recentActivity: new Date().toISOString(),
    performanceRating: 3.5,
    workloadColor: 'text-green-600 bg-green-100',
    isAvailable: true,
    workloadStatus: 'available',
    priorityBreakdown: {}
  }
];

export async function GET() {
  try {
    // Check if environment variables are properly configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('Supabase environment variables not configured, using real admin fallback data');
      const realAdminData = getRealAdminFallback();
      return NextResponse.json({
        success: true,
        data: realAdminData,
        meta: {
          total: realAdminData.length,
          available: realAdminData.filter(s => s.isAvailable).length,
          overloaded: realAdminData.filter(s => s.workloadPercentage >= 90).length
        },
        warning: 'Using real admin fallback data - database connection not configured'
      });
    }

    // Use the enhanced function from the SQL schema
    const { data: staffData, error } = await supabaseAdmin
      .rpc('get_available_admin_staff');

    if (error) {
      console.warn('Database function error:', error.message);
      // If there's a function error (like column ambiguity), fall back to mock data
      if (error.code === '42702' || error.message.includes('ambiguous')) {
        console.warn('Column ambiguity detected, using real admin fallback data. Please run the SQL fix in FIX_STAFF_FUNCTION.md');
        const realAdminData = getRealAdminFallback();
        return NextResponse.json({
          success: true,
          data: realAdminData,
          meta: {
            total: realAdminData.length,
            available: realAdminData.filter(s => s.isAvailable).length,
            overloaded: realAdminData.filter(s => s.workloadPercentage >= 90).length
          },
          warning: 'Using real admin fallback data due to database function error. Check FIX_STAFF_FUNCTION.md for solution.'
        });
      }
      throw error;
    }

    // Format the data for the frontend
    const formattedStaff = staffData.map((staff: any) => ({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      currentWorkload: staff.current_workload,
      maxCapacity: staff.max_capacity,
      workloadPercentage: staff.workload_percentage,
      specializations: staff.specializations || [],
      skillLevel: staff.skill_level,
      avgResponseTime: staff.avg_response_time,
      recentActivity: staff.recent_activity,
      performanceRating: staff.performance_rating,
      // Calculate color based on workload percentage
      workloadColor: getWorkloadColor(staff.workload_percentage),
      // Additional computed fields
      isAvailable: staff.current_workload < staff.max_capacity,
      workloadStatus: getWorkloadStatus(staff.workload_percentage),
      priorityBreakdown: {} // This could be enhanced with actual priority breakdown
    }));

    return NextResponse.json({
      success: true,
      data: formattedStaff,
      meta: {
        total: formattedStaff.length,
        available: formattedStaff.filter(s => s.isAvailable).length,
        overloaded: formattedStaff.filter(s => s.workloadPercentage >= 90).length
      }
    });

  } catch (error) {
    console.error('Error fetching admin staff:', error);
    
    // Return real admin data as fallback
    console.warn('Database connection failed, using real admin fallback data');
    const realAdminData = getRealAdminFallback();
    
    return NextResponse.json({
      success: true,
      data: realAdminData,
      meta: {
        total: realAdminData.length,
        available: realAdminData.filter(s => s.isAvailable).length,
        overloaded: realAdminData.filter(s => s.workloadPercentage >= 90).length
      },
      warning: 'Using real admin fallback data due to database connection error'
    });
  }
}

// Helper function to get workload color based on percentage
function getWorkloadColor(percentage: number): string {
  if (percentage >= 90) return 'text-red-600 bg-red-100';
  if (percentage >= 70) return 'text-yellow-600 bg-yellow-100';
  if (percentage >= 50) return 'text-blue-600 bg-blue-100';
  return 'text-green-600 bg-green-100';
}

// Helper function to get workload status
function getWorkloadStatus(percentage: number): string {
  if (percentage >= 90) return 'overloaded';
  if (percentage >= 70) return 'busy';
  if (percentage >= 50) return 'moderate';
  return 'available';
}

// POST endpoint for updating staff skills and preferences
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { adminId, skills, specializations, maxCapacity, preferredCaseTypes } = body;

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: 'Admin ID is required' },
        { status: 400 }
      );
    }

    // Update or insert admin staff skills
    const { data, error } = await supabaseAdmin
      .from('admin_staff_skills')
      .upsert({
        admin_id: adminId,
        skill_category: 'general',
        skill_level: skills?.level || 3,
        specialization_areas: specializations || [],
        max_concurrent_cases: maxCapacity || 25,
        preferred_case_types: preferredCaseTypes || [],
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Staff skills updated successfully'
    });

  } catch (error) {
    console.error('Error updating staff skills:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update staff skills',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 