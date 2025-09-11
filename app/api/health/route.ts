import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Missing environment variables',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }

    // Test database connection
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await supabase
      .from('admin_users')
      .select('count', { count: 'exact', head: true })

    if (error) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Database connection failed',
          error: error.message,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      status: 'healthy',
      message: 'TMS Admin application is running',
      database: 'connected',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    })

  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
} 