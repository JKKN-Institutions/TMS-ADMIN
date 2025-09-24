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

    let count = 0;

    switch (audience) {
      case 'all':
      case 'students':
        // Count all enrolled students
        const { count: studentCount, error: studentError } = await supabaseAdmin
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('transport_enrolled', true);

        if (studentError) {
          console.error('Error counting students:', studentError);
          return NextResponse.json({ 
            error: 'Failed to estimate user count' 
          }, { status: 500 });
        }

        count = studentCount || 0;
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

    // Also get push subscription statistics
    const { count: subscriptionCount, error: subscriptionError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    const activeSubscriptions = subscriptionCount || 0;
    const subscriptionRate = count > 0 ? Math.round((activeSubscriptions / count) * 100) : 0;

    return NextResponse.json({
      success: true,
      count,
      activeSubscriptions,
      subscriptionRate,
      audience
    });

  } catch (error) {
    console.error('Error estimating user count:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}





