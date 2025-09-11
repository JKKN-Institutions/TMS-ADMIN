import { NextResponse } from 'next/server'
import { DatabaseService } from '@/lib/database'

export async function GET() {
  try {
    // Test environment variables
    const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // Test database connection
    let databaseStatus = 'disconnected';
    let databaseError = null;
    
    try {
      // Try to fetch dashboard stats (this will test the database connection)
      const stats = await DatabaseService.getDashboardStats();
      databaseStatus = 'connected';
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Unknown error';
    }
    
    return NextResponse.json({
      environment: {
        hasSupabaseUrl,
        hasServiceKey,
        nodeEnv: process.env.NODE_ENV,
        // Don't log actual values for security
        supabaseUrlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
        serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
      },
      database: {
        status: databaseStatus,
        error: databaseError
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Test endpoint failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 