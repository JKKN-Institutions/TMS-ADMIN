import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audience = searchParams.get('audience') || 'all';
    const detailed = searchParams.get('detailed') === 'true';

    let count = 0;
    let studentsWithoutPush: any[] = [];
    let studentsWithPush: any[] = [];

    switch (audience) {
      case 'all':
      case 'students':
        // Get all enrolled students
        const { data: students, error: studentError } = await supabaseAdmin
          .from('students')
          .select('id, student_name, email')
          .eq('transport_enrolled', true)
          .order('student_name');

        if (studentError) {
          console.error('Error fetching students:', studentError);
          return NextResponse.json({ 
            error: 'Failed to estimate user count' 
          }, { status: 500 });
        }

        count = students?.length || 0;

        // Get all active push subscriptions for students
        const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
          .from('push_subscriptions')
          .select('user_id')
          .eq('is_active', true)
          .eq('user_type', 'student');

        if (subscriptionError) {
          console.error('Error fetching subscriptions:', subscriptionError);
        }

        const subscribedUserIds = new Set(subscriptions?.map(s => s.user_id) || []);

        // Separate students with and without push
        if (detailed && students) {
          studentsWithoutPush = students.filter(s => !subscribedUserIds.has(s.id));
          studentsWithPush = students.filter(s => subscribedUserIds.has(s.id));
        }
        break;

      case 'drivers':
        // Count active drivers (if you have a drivers table)
        count = 0; // Placeholder
        break;

      case 'parents':
        // Count parents (if you have a parents table)
        count = 0; // Placeholder
        break;

      default:
        count = 0;
    }

    // Get push subscription statistics
    const { count: subscriptionCount, error: subscriptionStatsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('user_type', 'student');

    const activeSubscriptions = subscriptionCount || 0;
    const subscriptionRate = count > 0 ? Math.round((activeSubscriptions / count) * 100) : 0;
    const studentsWithoutSubscriptions = count - activeSubscriptions;

    const response: any = {
      success: true,
      count,
      activeSubscriptions,
      studentsWithoutSubscriptions,
      subscriptionRate,
      audience
    };

    if (detailed) {
      response.studentsWithPush = studentsWithPush;
      response.studentsWithoutPush = studentsWithoutPush;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error estimating user count:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}



























