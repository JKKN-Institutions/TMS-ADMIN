import { NextRequest, NextResponse } from 'next/server';
import { ExternalStudent, getFullStudentName, getPrimaryMobile, getPrimaryEmail } from '@/types/external-student';

// Shared function to fetch all students with pagination
async function fetchAllStudentsFromExternalAPI(): Promise<ExternalStudent[]> {
  const apiKey = 'jk_5483dc7eb7f1b7cd730a274ec61765cc_mcka9lzk';
  
  console.log('🔄 Fetching all students using pagination...');
  let allStudents: ExternalStudent[] = [];
  let page = 1;
  let hasMoreData = true;
  const limitPerPage = 1000; // Use max limit per request
  
  while (hasMoreData) {
    console.log(`📄 Fetching page ${page}...`);
    
    const apiParams = new URLSearchParams();
    apiParams.append('page', page.toString());
    apiParams.append('limit', limitPerPage.toString());
    
    const response = await fetch(`https://my.jkkn.ac.in/api/api-management/students?${apiParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`External API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const pageStudents: ExternalStudent[] = data.data || data.students || [];
    
    console.log(`📊 Page ${page} returned ${pageStudents.length} students`);
    
    if (pageStudents.length === 0) {
      hasMoreData = false;
    } else {
      allStudents = allStudents.concat(pageStudents);
      
      // If we got fewer students than the limit, we've reached the end
      if (pageStudents.length < limitPerPage) {
        hasMoreData = false;
      } else {
        page++;
      }
    }
  }
  
  console.log(`✅ Found ${allStudents.length} total students (${page} pages)`);
  return allStudents;
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 API Proxy: Fetching from external JKKN API...');
    
    const apiKey = 'jk_5483dc7eb7f1b7cd730a274ec61765cc_mcka9lzk';
    
    // Extract query parameters to pass to external API
    const { searchParams } = new URL(request.url);
    const requestedLimit = searchParams.get('limit');
    
    // If a specific limit is requested, use single request
    if (requestedLimit) {
    const apiParams = new URLSearchParams();
      apiParams.append('limit', requestedLimit);
    
    const response = await fetch(`https://my.jkkn.ac.in/api/api-management/students?${apiParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      console.error('❌ API Proxy: External API error:', response.status, response.statusText);
      return NextResponse.json(
        { error: `External API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const students: ExternalStudent[] = data.data || data.students || [];
    console.log(`✅ API Proxy: Found ${students.length} students from external API`);
      
      return NextResponse.json({
        success: true,
        data: students,
        count: students.length
      });
    }
    
    // Fetch all students using shared pagination function
    let students: ExternalStudent[];
    try {
      students = await fetchAllStudentsFromExternalAPI();
    } catch (error) {
      console.error('❌ API Proxy: Error fetching students:', error);
      return NextResponse.json(
        { error: `Failed to fetch students: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    if (students.length > 0) {
      console.log('📋 API Proxy: Sample student structure:', Object.keys(students[0]));
      
      // Check mobile data availability with new schema
      let fatherMobileCount = 0;
      let motherMobileCount = 0;
      let studentMobileCount = 0;
      
      students.forEach((student) => {
        if (student.father_mobile && student.father_mobile.trim() !== '' && student.father_mobile !== '0000000000') fatherMobileCount++;
        if (student.mother_mobile && student.mother_mobile.trim() !== '' && student.mother_mobile !== '0000000000') motherMobileCount++;
        if (student.student_mobile && student.student_mobile.trim() !== '') studentMobileCount++;
      });
      
      console.log(`📱 API Proxy: Mobile data availability:`);
      console.log(`   Students with father mobile: ${fatherMobileCount}/${students.length}`);
      console.log(`   Students with mother mobile: ${motherMobileCount}/${students.length}`);
      console.log(`   Students with own mobile: ${studentMobileCount}/${students.length}`);
      
      // Show a few sample students with mobile data using new schema
      console.log('📱 API Proxy: Sample students with mobile data:');
      students.slice(0, 3).forEach((student, index) => {
        const fullName = getFullStudentName(student);
        console.log(`   ${index + 1}. ${fullName}`);
        console.log(`      Father: ${student.father_name || 'N/A'} (${student.father_mobile || 'No mobile'})`);
        console.log(`      Mother: ${student.mother_name || 'N/A'} (${student.mother_mobile || 'No mobile'})`);
        console.log(`      Student: ${student.student_mobile || 'No mobile'}`);
        console.log(`      Roll Number: ${student.roll_number || 'N/A'}`);
        console.log(`      Institution: ${student.institution?.name || 'N/A'}`);
        console.log(`      Department: ${student.department?.department_name || 'N/A'}`);
        console.log('      ---');
      });
    }

    // Return the students data
    return NextResponse.json({
      success: true,
      data: students,
      count: students.length
    });

  } catch (error) {
    console.error('❌ API Proxy: Error fetching from external API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch external students', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 API Proxy: Searching for student with email: ${email}`);
    
    // Fetch all students using shared pagination function
    let students: ExternalStudent[];
    try {
      students = await fetchAllStudentsFromExternalAPI();
    } catch (error) {
      console.error('❌ API Proxy: Error fetching students:', error);
      return NextResponse.json(
        { error: `Failed to fetch students: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // Search for student by email (both student_email and college_email)
    const foundStudent = students.find((student) => 
      student.student_email?.toLowerCase() === email.toLowerCase() ||
      student.college_email?.toLowerCase() === email.toLowerCase()
    );

    if (foundStudent) {
      const fullName = getFullStudentName(foundStudent);
      console.log(`✅ API Proxy: Found student with email ${email}: ${fullName}`);
      console.log('🔍 API Proxy: Student mobile data:', {
        father_name: foundStudent.father_name,
        father_mobile: foundStudent.father_mobile,
        mother_name: foundStudent.mother_name,
        mother_mobile: foundStudent.mother_mobile,
        student_mobile: foundStudent.student_mobile,
        primary_mobile: getPrimaryMobile(foundStudent),
        primary_email: getPrimaryEmail(foundStudent)
      });
      console.log('🔍 API Proxy: Institution/Department data:', {
        institution: foundStudent.institution?.name,
        department: foundStudent.department?.department_name,
        program: foundStudent.program?.program_name,
        degree: foundStudent.degree?.degree_name
      });
      console.log('🔍 API Proxy: ALL student fields:', Object.keys(foundStudent));
      console.log('🔍 API Proxy: Complete student object:', foundStudent);
      
      return NextResponse.json({
        success: true,
        data: foundStudent
      });
    } else {
      console.log(`❌ API Proxy: No student found with email ${email}`);
      return NextResponse.json(
        { error: 'Student not found with the provided email' },
        { status: 404 }
      );
    }

  } catch (error) {
    console.error('❌ API Proxy: Error searching for student:', error);
    return NextResponse.json(
      { error: 'Failed to search for student', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 