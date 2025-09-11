import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
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

    // Fetch students from database
    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch students' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: students || [],
      count: students?.length || 0
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json();

    // Handle different actions
    if (action === 'fixEmergencyContacts') {
      return await handleFixEmergencyContacts();
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleFixEmergencyContacts() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all students without proper emergency contacts
    const { data: students, error: fetchError } = await supabase
      .from('students')
      .select('*')
      .or('emergency_contact_name.is.null,emergency_contact_phone.is.null');

    if (fetchError) {
      console.error('Error fetching students:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch students' },
        { status: 500 }
      );
    }

    let updatedCount = 0;

    // Update students with missing emergency contacts
    for (const student of students || []) {
      const updates: any = {};
      
      if (!student.emergency_contact_name && student.father_name) {
        updates.emergency_contact_name = student.father_name;
      }
      
      if (!student.emergency_contact_phone && student.father_mobile) {
        updates.emergency_contact_phone = student.father_mobile;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('students')
          .update(updates)
          .eq('id', student.id);

        if (!updateError) {
          updatedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} students with emergency contacts`,
      updatedCount
    });

  } catch (error) {
    console.error('Error fixing emergency contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fix emergency contacts' },
      { status: 500 }
    );
  }
} 