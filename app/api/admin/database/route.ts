import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, params } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'SQL query is required' },
        { status: 400 }
      );
    }

    // Execute the query
    let result;
    if (params && params.length > 0) {
      result = await supabase.rpc('execute_sql_with_params', {
        sql_query: query,
        params: params
      });
    } else {
      // For simple SELECT queries without parameters
      if (query.trim().toLowerCase().startsWith('select')) {
        result = await supabase.from('custom_query').select(query);
      } else {
        // Use rpc for other queries
        result = await supabase.rpc('execute_sql', { sql_query: query });
      }
    }

    // Handle different query types
    if (query.trim().toLowerCase().startsWith('select')) {
      // For SELECT queries, try to parse as a direct table query
      try {
        const tableMatch = query.match(/from\s+(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];
          const { data, error } = await supabase.from(tableName).select('*');
          
          if (error) throw error;
          
          return NextResponse.json({
            success: true,
            data: data
          });
        }
      } catch {
        // If direct table query fails, fall back to raw SQL
      }
    }

    const { data, error } = result;

    if (error) {
      console.error('Database query error:', error);
      return NextResponse.json(
        { success: false, error: error.message || 'Database query failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
