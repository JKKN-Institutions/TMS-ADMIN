import { NextRequest, NextResponse } from 'next/server';

const API_KEY ='jk_5483dc7eb7f1b7cd730a274ec61765cc_mcka9lzk';
const BASE_URL = process.env.STUDENT_API_BASE_URL || 'https://my.jkkn.ac.in/api/api-management';

// Mock student data for testing when BASE_URL is not set
const mockStudents = [
  {
    id: 'student_1',
    student_name: 'John Doe',
    roll_number: 'CS2024001',
    student_email: 'john.doe@example.com',
    college_email: 'john.doe@college.edu',
    student_mobile: '+1234567890',
    institution: { id: 'inst_1', name: 'Tech University' },
    department: { id: 'dept_1', department_name: 'Computer Science' },
    program: { id: 'prog_1', program_name: 'Bachelor of Technology' },
    degree: { id: 'deg_1', degree_name: 'B.Tech' },
    is_profile_complete: true,
    father_name: 'Robert Doe',
    mother_name: 'Jane Doe',
    date_of_birth: '2000-01-15',
    gender: 'Male',
    religion: 'Christianity',
    community: 'General',
    permanent_address_street: '123 Main St',
    permanent_address_district: 'Central District',
    permanent_address_state: 'California',
    permanent_address_pin_code: '90210'
  },
  {
    id: 'student_2',
    student_name: 'Jane Smith',
    roll_number: 'EE2024002',
    student_email: 'jane.smith@example.com',
    college_email: 'jane.smith@college.edu',
    student_mobile: '+1234567891',
    institution: { id: 'inst_1', name: 'Tech University' },
    department: { id: 'dept_2', department_name: 'Electrical Engineering' },
    program: { id: 'prog_1', program_name: 'Bachelor of Technology' },
    degree: { id: 'deg_1', degree_name: 'B.Tech' },
    is_profile_complete: false,
    father_name: 'James Smith',
    mother_name: 'Mary Smith',
    date_of_birth: '1999-12-10',
    gender: 'Female',
    religion: 'Hinduism',
    community: 'OBC',
    permanent_address_street: '456 Oak Ave',
    permanent_address_district: 'North District',
    permanent_address_state: 'California',
    permanent_address_pin_code: '90211'
  },
  {
    id: 'student_3',
    student_name: 'Alice Johnson',
    roll_number: 'ME2024003',
    student_email: 'alice.johnson@example.com',
    college_email: 'alice.johnson@college.edu',
    student_mobile: '+1234567892',
    institution: { id: 'inst_1', name: 'Tech University' },
    department: { id: 'dept_3', department_name: 'Mechanical Engineering' },
    program: { id: 'prog_1', program_name: 'Bachelor of Technology' },
    degree: { id: 'deg_1', degree_name: 'B.Tech' },
    is_profile_complete: true,
    father_name: 'David Johnson',
    mother_name: 'Susan Johnson',
    date_of_birth: '2001-03-22',
    gender: 'Female',
    religion: 'Islam',
    community: 'General',
    permanent_address_street: '789 Pine Rd',
    permanent_address_district: 'South District',
    permanent_address_state: 'California',
    permanent_address_pin_code: '90212'
  }
];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const studentId = params.id;
    
    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }
    
    console.log('Fetching student details from API:', BASE_URL, 'for ID:', studentId);
    
    // Make request to external API for specific student
    const response = await fetch(`${BASE_URL}/students/${studentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error('External API error:', response.status, response.statusText);
      
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'API authentication failed. Please check the API key.' },
          { status: 401 }
        );
      }
      
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Student not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: `External API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('API proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 