// Fix Route Allocation Sync Issue
// Run this script to fix the discrepancy between admin and passenger modules

const { createClient } = require('@supabase/supabase-js');

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCurrentState() {
  console.log('🔍 Checking current state...');
  
  // Check Valarmathi's current state
  const { data: valarmathibata, error: valarmathibataError } = await supabase
    .from('students')
    .select(`
      id,
      student_name,
      roll_number,
      allocated_route_id,
      boarding_point,
      routes:allocated_route_id(route_number, route_name)
    `)
    .ilike('student_name', '%valarmathi%');

  if (valarmathibataError) {
    console.error('Error fetching Valarmathi data:', valarmathibataError);
    return;
  }

  if (valarmathibata && valarmathibata.length > 0) {
    console.log('📊 Valarmathi\'s current data:');
    valarmathibata.forEach(student => {
      console.log(`  - Name: ${student.student_name}`);
      console.log(`  - Roll: ${student.roll_number}`);
      console.log(`  - Legacy Route ID: ${student.allocated_route_id}`);
      console.log(`  - Legacy Route: ${student.routes?.route_number} - ${student.routes?.route_name}`);
      console.log(`  - Boarding Point: ${student.boarding_point}`);
      console.log('');
    });
  } else {
    console.log('❌ No student named Valarmathi found');
    return;
  }

  // Check new system
  for (const student of valarmathibata) {
    const { data: newAllocation, error: newError } = await supabase
      .from('student_route_allocations')
      .select(`
        route_id,
        is_active,
        boarding_stop_id,
        allocated_at,
        routes:route_id(route_number, route_name),
        route_stops:boarding_stop_id(stop_name)
      `)
      .eq('student_id', student.id)
      .eq('is_active', true);

    console.log(`📋 ${student.student_name}'s allocation in new system:`);
    if (newAllocation && newAllocation.length > 0) {
      newAllocation.forEach(alloc => {
        console.log(`  - New Route ID: ${alloc.route_id}`);
        console.log(`  - New Route: ${alloc.routes?.route_number} - ${alloc.routes?.route_name}`);
        console.log(`  - Boarding Stop: ${alloc.route_stops?.stop_name}`);
        console.log(`  - Active: ${alloc.is_active}`);
        console.log(`  - Allocated At: ${alloc.allocated_at}`);
      });
    } else {
      console.log('  - No allocation found in new system');
    }
    console.log('');
  }
}

async function syncRouteAllocation(studentId, routeId, boardingPoint) {
  console.log(`🔄 Syncing route allocation for student ${studentId}...`);
  
  try {
    // Step 1: Update legacy system
    const { error: legacyError } = await supabase
      .from('students')
      .update({
        allocated_route_id: routeId,
        boarding_point: boardingPoint,
        transport_status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId);

    if (legacyError) {
      console.error('Error updating legacy system:', legacyError);
      return false;
    }

    // Step 2: Find boarding stop ID
    let boardingStopId = null;
    if (boardingPoint) {
      const { data: routeStop, error: stopError } = await supabase
        .from('route_stops')
        .select('id')
        .eq('route_id', routeId)
        .eq('stop_name', boardingPoint)
        .single();

      if (!stopError && routeStop) {
        boardingStopId = routeStop.id;
      }
    }

    // Step 3: Deactivate existing allocations
    const { error: deactivateError } = await supabase
      .from('student_route_allocations')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('student_id', studentId);

    if (deactivateError) {
      console.error('Error deactivating existing allocations:', deactivateError);
      return false;
    }

    // Step 4: Insert new allocation
    const { error: newAllocationError } = await supabase
      .from('student_route_allocations')
      .upsert({
        student_id: studentId,
        route_id: routeId,
        is_active: true,
        boarding_stop_id: boardingStopId,
        allocated_at: new Date().toISOString()
      });

    if (newAllocationError) {
      console.error('Error creating new allocation:', newAllocationError);
      return false;
    }

    console.log('✅ Route allocation synced successfully');
    return true;
  } catch (error) {
    console.error('Error syncing route allocation:', error);
    return false;
  }
}

async function syncAllStudentsWithAllocations() {
  console.log('🔄 Syncing all students with route allocations...');
  
  // Get all students with route allocations
  const { data: studentsWithRoutes, error: studentsError } = await supabase
    .from('students')
    .select(`
      id,
      student_name,
      allocated_route_id,
      boarding_point
    `)
    .not('allocated_route_id', 'is', null);

  if (studentsError) {
    console.error('Error fetching students:', studentsError);
    return;
  }

  console.log(`📊 Found ${studentsWithRoutes.length} students with route allocations`);

  let success = 0;
  let failed = 0;

  for (const student of studentsWithRoutes) {
    console.log(`\n🔄 Processing ${student.student_name}...`);
    
    const result = await syncRouteAllocation(
      student.id,
      student.allocated_route_id,
      student.boarding_point
    );

    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  console.log(`\n📊 Sync Results:`);
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
}

async function main() {
  console.log('🚀 Starting Route Allocation Fix...\n');
  
  // Check current state
  await checkCurrentState();
  
  // Ask for confirmation
  console.log('🔧 Ready to sync route allocations between systems...');
  console.log('This will update the student_route_allocations table to match the students table.');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Sync all students
  await syncAllStudentsWithAllocations();
  
  console.log('\n✅ Route allocation fix completed!');
  console.log('The passenger module should now show the correct route assignments.');
}

// Run the script
main().catch(console.error); 