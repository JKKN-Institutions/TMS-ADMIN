import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  try {
    const { data: quotaTypes, error } = await supabase
      .from('quota_types')
      .select('*')
      .eq('is_active', true)
      .order('annual_fee_amount', { ascending: true });

    if (error) {
      console.error('Error fetching quota types:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch quota types' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: quotaTypes
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      quota_name,
      quota_code,
      description,
      annual_fee_amount,
      is_government_quota = false
    } = body;

    // Validate required fields
    if (!quota_name || !quota_code || !annual_fee_amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { data: newQuotaType, error } = await supabase
      .from('quota_types')
      .insert({
        quota_name,
        quota_code,
        description,
        annual_fee_amount,
        is_government_quota,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating quota type:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create quota type' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: newQuotaType
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
