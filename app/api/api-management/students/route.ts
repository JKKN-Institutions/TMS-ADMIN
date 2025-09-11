import { NextRequest, NextResponse } from 'next/server';

const API_KEY = 'jk_5483dc7eb7f1b7cd730a274ec61765cc_mcka9lzk';
const BASE_URL = process.env.STUDENT_API_BASE_URL || 'https://my.jkkn.ac.in/api/api-management';

// Mock data for testing when BASE_URL is not set
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
    permanent_address_street: '789 Pine Rd',
    permanent_address_district: 'South District',
    permanent_address_state: 'California',
    permanent_address_pin_code: '90212'
  }
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '1000'); // Increased default limit to fetch all students
    const search = searchParams.get('search') || '';
    const institution_id = searchParams.get('institution_id') || '';
    const is_profile_complete = searchParams.get('is_profile_complete') || '';
    
    console.log('Using real API:', BASE_URL);
    
    // Build query parameters for external API
    const apiParams = new URLSearchParams();
    apiParams.append('page', page.toString());
    apiParams.append('limit', limit.toString());
    if (search) apiParams.append('search', search);
    if (institution_id) apiParams.append('institution_id', institution_id);
    if (is_profile_complete) apiParams.append('is_profile_complete', is_profile_complete);
    
    // Make request to external API
    const response = await fetch(`${BASE_URL}/students?${apiParams.toString()}`, {
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