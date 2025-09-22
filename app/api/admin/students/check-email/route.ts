import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Create Supabase admin client (server-side only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔍 Checking for existing student with email:', email);

    // Check if student already exists by email
    const { data: existingStudent, error: checkError } = await supabase
      .from('students')
      .select('id, student_name, email, roll_number, transport_enrolled, enrollment_status')
      .eq('email', email)
      .maybeSingle(); // Use maybeSingle instead of single to avoid errors when no record found

    if (checkError) {
      console.error('Database error checking email:', checkError);
      return NextResponse.json(
        { error: 'Failed to check email', details: checkError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      exists: !!existingStudent,
      student: existingStudent || null
    });

  } catch (error) {
    console.error('API Error checking email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
