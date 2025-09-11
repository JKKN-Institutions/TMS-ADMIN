import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST - Bulk operations on grievances
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, grievance_ids, data: actionData } = body;

    if (!action || !grievance_ids || !Array.isArray(grievance_ids) || grievance_ids.length === 0) {
      return NextResponse.json({ 
        error: 'Missing required fields: action, grievance_ids' 
      }, { status: 400 });
    }

    const validActions = ['assign', 'update_status', 'resolve', 'close', 'update_priority', 'add_tags'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ 
        error: `Invalid action. Valid actions: ${validActions.join(', ')}` 
      }, { status: 400 });
    }

    let results = [];
    let errors = [];

    switch (action) {
      case 'assign':
        if (!actionData.assigned_to) {
          return NextResponse.json({ error: 'assigned_to is required for assign action' }, { status: 400 });
        }

        // Verify the admin user exists
        const { data: adminUser, error: adminError } = await supabaseAdmin
          .from('admin_users')
          .select('id, name')
          .eq('id', actionData.assigned_to)
          .single();

        if (adminError || !adminUser) {
          return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
        }

        // Bulk assign grievances
        const { data: assignedGrievances, error: assignError } = await supabaseAdmin
          .from('grievances')
          .update({
            assigned_to: actionData.assigned_to,
            status: 'in_progress',
            updated_at: new Date().toISOString()
          })
          .in('id', grievance_ids)
          .select(`
            *,
            students (
              id,
              student_name,
              roll_number
            )
          `);

        if (assignError) {
          console.error('Error in bulk assign:', assignError);
          return NextResponse.json({ error: 'Failed to assign grievances' }, { status: 500 });
        }

        // Create assignment records
        const assignmentRecords = assignedGrievances.map(g => ({
          grievance_id: g.id,
          assigned_to: actionData.assigned_to,
          assigned_by: actionData.assigned_by || null,
          assignment_reason: actionData.reason || 'Bulk assignment',
          is_active: true
        }));

        await supabaseAdmin
          .from('grievance_assignments')
          .insert(assignmentRecords);

        results = assignedGrievances;
        break;

      case 'update_status':
        if (!actionData.status) {
          return NextResponse.json({ error: 'status is required for update_status action' }, { status: 400 });
        }

        const updateData: any = {
          status: actionData.status,
          updated_at: new Date().toISOString()
        };

        if (actionData.status === 'resolved') {
          updateData.resolved_at = new Date().toISOString();
        }

        const { data: updatedGrievances, error: updateError } = await supabaseAdmin
          .from('grievances')
          .update(updateData)
          .in('id', grievance_ids)
          .select(`
            *,
            students (
              id,
              student_name,
              roll_number
            )
          `);

        if (updateError) {
          console.error('Error in bulk status update:', updateError);
          return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
        }

        results = updatedGrievances;
        break;

      case 'resolve':
        if (!actionData.resolution) {
          return NextResponse.json({ error: 'resolution is required for resolve action' }, { status: 400 });
        }

        const { data: resolvedGrievances, error: resolveError } = await supabaseAdmin
          .from('grievances')
          .update({
            status: 'resolved',
            resolution: actionData.resolution,
            resolution_category: actionData.resolution_category || null,
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .in('id', grievance_ids)
          .select(`
            *,
            students (
              id,
              student_name,
              roll_number
            )
          `);

        if (resolveError) {
          console.error('Error in bulk resolve:', resolveError);
          return NextResponse.json({ error: 'Failed to resolve grievances' }, { status: 500 });
        }

        results = resolvedGrievances;
        break;

      case 'close':
        const { data: closedGrievances, error: closeError } = await supabaseAdmin
          .from('grievances')
          .update({
            status: 'closed',
            closure_reason: actionData.closure_reason || 'Bulk closure',
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .in('id', grievance_ids)
          .select(`
            *,
            students (
              id,
              student_name,
              roll_number
            )
          `);

        if (closeError) {
          console.error('Error in bulk close:', closeError);
          return NextResponse.json({ error: 'Failed to close grievances' }, { status: 500 });
        }

        results = closedGrievances;
        break;

      case 'update_priority':
        if (!actionData.priority) {
          return NextResponse.json({ error: 'priority is required for update_priority action' }, { status: 400 });
        }

        const { data: priorityUpdated, error: priorityError } = await supabaseAdmin
          .from('grievances')
          .update({
            priority: actionData.priority,
            urgency: actionData.urgency || null,
            updated_at: new Date().toISOString()
          })
          .in('id', grievance_ids)
          .select(`
            *,
            students (
              id,
              student_name,
              roll_number
            )
          `);

        if (priorityError) {
          console.error('Error in bulk priority update:', priorityError);
          return NextResponse.json({ error: 'Failed to update priority' }, { status: 500 });
        }

        results = priorityUpdated;
        break;

      case 'add_tags':
        if (!actionData.tags || !Array.isArray(actionData.tags)) {
          return NextResponse.json({ error: 'tags array is required for add_tags action' }, { status: 400 });
        }

        // Get current grievances to merge tags
        const { data: currentGrievances, error: currentError } = await supabaseAdmin
          .from('grievances')
          .select('id, tags')
          .in('id', grievance_ids);

        if (currentError) {
          return NextResponse.json({ error: 'Failed to fetch current grievances' }, { status: 500 });
        }

        // Update each grievance with merged tags
        const tagUpdates = currentGrievances.map(async (g) => {
          const existingTags = g.tags || [];
          const newTags = [...new Set([...existingTags, ...actionData.tags])];
          
          return await supabaseAdmin
            .from('grievances')
            .update({
              tags: newTags,
              updated_at: new Date().toISOString()
            })
            .eq('id', g.id)
            .select(`
              *,
              students (
                id,
                student_name,
                roll_number
              )
            `);
        });

        const tagResults = await Promise.all(tagUpdates);
        results = tagResults.map(r => r.data?.[0]).filter(Boolean);
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      action,
      affected_count: results.length,
      grievances: results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in POST /api/admin/grievances/bulk:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET - Get bulk operation history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get recent bulk operations from status history
    const { data: bulkHistory, error: historyError } = await supabaseAdmin
      .from('grievance_status_history')
      .select(`
        *,
        grievances (
          id,
          subject,
          students (
            student_name,
            roll_number
          )
        ),
        admin_users (
          name,
          role
        )
      `)
      .not('change_reason', 'is', null)
      .like('change_reason', '%bulk%')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (historyError) {
      console.error('Error fetching bulk history:', historyError);
      return NextResponse.json({ error: 'Failed to fetch bulk operation history' }, { status: 500 });
    }

    // Get assignment history for bulk assignments
    const { data: assignmentHistory, error: assignmentError } = await supabaseAdmin
      .from('grievance_assignments')
      .select(`
        *,
        grievances (
          id,
          subject,
          students (
            student_name,
            roll_number
          )
        ),
        assigned_by_user:admin_users!grievance_assignments_assigned_by_fkey (
          name,
          role
        ),
        assigned_to_user:admin_users!grievance_assignments_assigned_to_fkey (
          name,
          role
        )
      `)
      .like('assignment_reason', '%bulk%')
      .order('assigned_at', { ascending: false })
      .range(offset, Math.min(offset + limit - 1, 25));

    if (assignmentError) {
      console.log('Assignment history not available');
    }

    return NextResponse.json({
      status_changes: bulkHistory || [],
      assignments: assignmentHistory || [],
      pagination: {
        limit,
        offset,
        total: (bulkHistory?.length || 0) + (assignmentHistory?.length || 0)
      }
    });

  } catch (error) {
    console.error('Error in GET /api/admin/grievances/bulk:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 