import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { grievanceIds, assignmentData } = body;

    if (!grievanceIds || !Array.isArray(grievanceIds) || grievanceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid grievance IDs provided' },
        { status: 400 }
      );
    }

    if (!assignmentData) {
      return NextResponse.json(
        { success: false, error: 'Assignment data is required' },
        { status: 400 }
      );
    }

    // Check if environment variables are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Database connection not configured',
        message: 'Please set up environment variables first'
      }, { status: 503 });
    }

    const results = [];
    const errors = [];

    if (assignmentData.type === 'single') {
      // Single assignment - assign all grievances to one admin
      const { assignedTo, priority, notes, expectedResolutionDate } = assignmentData;

      for (const grievanceId of grievanceIds) {
        try {
          // Update the grievance
          const updateData: any = {
            assigned_to: assignedTo,
            updated_at: new Date().toISOString()
          };

          if (priority !== 'keep_existing') {
            updateData.priority = priority;
          }

          // Only add expected_resolution_date if it's provided and valid
          if (expectedResolutionDate && expectedResolutionDate.trim() !== '') {
            try {
              // Ensure it's a valid date format (YYYY-MM-DD)
              const date = new Date(expectedResolutionDate);
              if (!isNaN(date.getTime())) {
                updateData.expected_resolution_date = expectedResolutionDate.split('T')[0]; // Extract just the date part
              }
            } catch (dateError) {
              console.warn('Invalid date format for expected_resolution_date:', expectedResolutionDate);
            }
          }

          const { data: grievance, error: updateError } = await supabaseAdmin
            .from('grievances')
            .update(updateData)
            .eq('id', grievanceId)
            .select('*')
            .single();

          if (updateError) {
            errors.push({
              grievanceId,
              error: updateError.message
            });
            continue;
          }

          // Log the assignment activity (optional - don't fail if this errors)
          if (notes) {
            try {
              await supabaseAdmin.rpc('log_grievance_activity', {
                p_grievance_id: grievanceId,
                p_activity_type: 'comment_added',
                p_visibility: 'internal',
                p_actor_type: 'admin',
                p_actor_id: assignedTo,
                p_actor_name: assignmentData.assignedToName || 'Admin',
                p_action_description: `Assignment note: ${notes}`,
                p_action_details: {
                  type: 'bulk_assignment',
                  note: notes,
                  expected_resolution_date: expectedResolutionDate
                }
              });
            } catch (logError) {
              console.warn('Failed to log activity (non-critical):', logError);
            }
          }

          results.push({
            grievanceId,
            status: 'success',
            assignedTo: assignedTo,
            assignedToName: assignmentData.assignedToName
          });

        } catch (error) {
          console.error(`Error assigning grievance ${grievanceId}:`, error);
          errors.push({
            grievanceId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

    } else if (assignmentData.type === 'distribute') {
      // Smart distribution - distribute among multiple admins
      const { distribution, priority, notes, expectedResolutionDate } = assignmentData;

      for (const [adminId, grievances] of Object.entries(distribution)) {
        const grievanceList = grievances as any[];
        
        for (const grievance of grievanceList) {
          try {
            const updateData: any = {
              assigned_to: adminId,
              updated_at: new Date().toISOString()
            };

            if (priority !== 'keep_existing') {
              updateData.priority = priority;
            }

            // Only add expected_resolution_date if it's provided and valid
            if (expectedResolutionDate && expectedResolutionDate.trim() !== '') {
              try {
                // Ensure it's a valid date format (YYYY-MM-DD)
                const date = new Date(expectedResolutionDate);
                if (!isNaN(date.getTime())) {
                  updateData.expected_resolution_date = expectedResolutionDate.split('T')[0]; // Extract just the date part
                }
              } catch (dateError) {
                console.warn('Invalid date format for expected_resolution_date:', expectedResolutionDate);
              }
            }

            const { data: updatedGrievance, error: updateError } = await supabaseAdmin
              .from('grievances')
              .update(updateData)
              .eq('id', grievance.id)
              .select('*')
              .single();

            if (updateError) {
              errors.push({
                grievanceId: grievance.id,
                error: updateError.message
              });
              continue;
            }

            // Log the assignment activity (optional - don't fail if this errors)
            if (notes) {
              try {
                await supabaseAdmin.rpc('log_grievance_activity', {
                  p_grievance_id: grievance.id,
                  p_activity_type: 'comment_added',
                  p_visibility: 'internal',
                  p_actor_type: 'admin',
                  p_actor_id: adminId,
                  p_actor_name: 'Admin',
                  p_action_description: `Bulk assignment note: ${notes}`,
                  p_action_details: {
                    type: 'bulk_assignment_distributed',
                    strategy: assignmentData.strategy,
                    note: notes,
                    expected_resolution_date: expectedResolutionDate
                  }
                });
              } catch (logError) {
                console.warn('Failed to log activity (non-critical):', logError);
              }
            }

            results.push({
              grievanceId: grievance.id,
              status: 'success',
              assignedTo: adminId,
              strategy: assignmentData.strategy
            });

          } catch (error) {
            console.error(`Error assigning grievance ${grievance.id} in distribution:`, error);
            errors.push({
              grievanceId: grievance.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
    }

    // Return results
    return NextResponse.json({
      success: true,
      data: {
        processed: results.length,
        errors: errors.length,
        results: results,
        errors: errors
      },
      message: `Successfully assigned ${results.length} grievances${errors.length > 0 ? ` (${errors.length} errors)` : ''}`
    });

  } catch (error) {
    console.error('Bulk assignment error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process bulk assignment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve bulk assignment recommendations
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const grievanceIds = searchParams.get('grievanceIds')?.split(',') || [];
    const strategy = searchParams.get('strategy') || 'balanced';

    if (grievanceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No grievance IDs provided' },
        { status: 400 }
      );
    }

    // Check if environment variables are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Database connection not configured',
        message: 'Please set up environment variables first'
      }, { status: 503 });
    }

    // Get grievance details
    const { data: grievances, error: grievancesError } = await supabaseAdmin
      .from('grievances')
      .select('id, category, priority, subject, created_at')
      .in('id', grievanceIds);

    if (grievancesError) {
      throw grievancesError;
    }

    // Get available admin staff
    const { data: staff, error: staffError } = await supabaseAdmin
      .rpc('get_available_admin_staff');

    if (staffError) {
      throw staffError;
    }

    // Generate recommendations for each grievance
    const recommendations = [];
    for (const grievance of grievances) {
      const { data: recommendation, error: recError } = await supabaseAdmin
        .rpc('get_recommended_admin_for_grievance', {
          p_grievance_id: grievance.id,
          p_category: grievance.category,
          p_priority: grievance.priority
        });

      if (!recError && recommendation && recommendation.length > 0) {
        recommendations.push({
          grievanceId: grievance.id,
          recommendedAdmins: recommendation
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        grievances,
        staff,
        recommendations,
        strategy
      }
    });

  } catch (error) {
    console.error('Bulk assignment recommendations error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get bulk assignment recommendations',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 