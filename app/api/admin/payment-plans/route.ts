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
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('student_id');

    let query = supabase
      .from('payment_plans')
      .select(`
        *,
        quota_types!inner(*),
        students!inner(student_name, roll_number, email),
        payment_terms(*)
      `)
      .order('created_at', { ascending: false });

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data: paymentPlans, error } = await query;

    if (error) {
      console.error('Error fetching payment plans:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch payment plans' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: paymentPlans
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
      student_id,
      quota_type_id,
      academic_year,
      terms_config
    } = body;

    // Validate required fields
    if (!student_id || !quota_type_id || !academic_year || !terms_config) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate terms_config structure
    if (!Array.isArray(terms_config) || terms_config.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid terms configuration' },
        { status: 400 }
      );
    }

    // Use the database function to generate payment plan
    const { data: paymentPlanId, error: functionError } = await supabase
      .rpc('generate_payment_plan', {
        p_student_id: student_id,
        p_quota_type_id: quota_type_id,
        p_academic_year: academic_year,
        p_terms_config: terms_config
      });

    if (functionError) {
      console.error('Error generating payment plan:', functionError);
      return NextResponse.json(
        { success: false, error: functionError.message || 'Failed to generate payment plan' },
        { status: 500 }
      );
    }

    // Update student with payment plan reference
    const { error: updateError } = await supabase
      .from('students')
      .update({
        payment_plan_id: paymentPlanId,
        quota_type_id: quota_type_id,
        transport_fee_amount: terms_config.reduce((sum: number, term: any) => sum + term.amount, 0)
      })
      .eq('id', student_id);

    if (updateError) {
      console.error('Error updating student with payment plan:', updateError);
      // Continue anyway as the payment plan was created successfully
    }

    // Fetch the created payment plan with related data
    const { data: paymentPlan, error: fetchError } = await supabase
      .from('payment_plans')
      .select(`
        *,
        quota_types(*),
        payment_terms(*)
      `)
      .eq('id', paymentPlanId)
      .single();

    if (fetchError) {
      console.error('Error fetching created payment plan:', fetchError);
      return NextResponse.json(
        { success: true, payment_plan_id: paymentPlanId },
        { status: 201 }
      );
    }

    return NextResponse.json({
      success: true,
      data: paymentPlan
    }, { status: 201 });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('id');
    
    if (!planId) {
      return NextResponse.json(
        { success: false, error: 'Payment plan ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { plan_status, payment_schedule } = body;

    const updateData: any = {};
    if (plan_status) updateData.plan_status = plan_status;
    if (payment_schedule) updateData.payment_schedule = payment_schedule;
    updateData.updated_at = new Date().toISOString();

    const { data: updatedPlan, error } = await supabase
      .from('payment_plans')
      .update(updateData)
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      console.error('Error updating payment plan:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update payment plan' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedPlan
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
