// External Student Types for Admin Application
// These match the new external database schema

export interface ExternalStudentMarks {
  max_marks: string;
  percentage: string;
  obtained_marks: string;
}

export interface ExternalStudentTwelfthMarks extends ExternalStudentMarks {
  group: string;
  subjects: Record<string, any>;
}

export interface ExternalStudentInstitution {
  id: string;
  name: string;
}

export interface ExternalStudentDegree {
  id: string;
  degree_name: string;
}

export interface ExternalStudentDepartment {
  id: string;
  department_name: string;
}

export interface ExternalStudentProgram {
  id: string;
  program_name: string;
}

export interface ExternalStudent {
  id: string;
  admission_id: string | null;
  father_name: string;
  father_occupation: string;
  father_mobile: string;
  mother_name: string;
  mother_occupation: string;
  mother_mobile: string;
  date_of_birth: string;
  gender: string;
  religion: string;
  community: string;
  caste: string;
  annual_income: string;
  last_school: string;
  board_of_study: string;
  tenth_marks: ExternalStudentMarks;
  twelfth_marks: ExternalStudentTwelfthMarks;
  medical_cutoff_marks: string;
  engineering_cutoff_marks: string;
  neet_roll_number: string;
  counseling_applied: boolean;
  counseling_number: string;
  first_graduate: boolean;
  quota: string;
  category: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  entry_type: string;
  permanent_address_street: string;
  permanent_address_taluk: string;
  permanent_address_district: string;
  permanent_address_pin_code: string;
  permanent_address_state: string;
  student_mobile: string;
  student_email: string;
  accommodation_type: string;
  hostel_type: string;
  bus_required: boolean;
  bus_route: string;
  bus_pickup_location: string;
  reference_type: string;
  reference_name: string;
  reference_contact: string;
  roll_number: string;
  student_photo_url: string | null;
  college_email: string;
  is_profile_complete: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string | null;
  status: string;
  semester_id: string;
  section_id: string;
  academic_year_id: string;
  first_name: string;
  last_name: string | null;
  application_id: string | null;
  
  // Nested objects
  institution: ExternalStudentInstitution;
  degree: ExternalStudentDegree;
  department: ExternalStudentDepartment;
  program: ExternalStudentProgram;
}

export interface ExternalApiResponse {
  data: ExternalStudent[];
  success?: boolean;
  count?: number;
}

export interface ExternalApiSingleResponse {
  data: ExternalStudent;
  success?: boolean;
}

// Helper functions for external student data
export function getFullStudentName(student: ExternalStudent): string {
  const firstName = student.first_name || '';
  const lastName = student.last_name || '';
  return `${firstName} ${lastName}`.trim() || 'Unknown Student';
}

export function getPrimaryMobile(student: ExternalStudent): string {
  return student.student_mobile || student.father_mobile || student.mother_mobile || '';
}

export function getPrimaryEmail(student: ExternalStudent): string {
  return student.student_email || student.college_email || '';
} 