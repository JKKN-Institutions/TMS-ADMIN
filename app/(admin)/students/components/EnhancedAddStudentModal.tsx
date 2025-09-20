'use client'
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, CheckCircle, ArrowLeft, Check, Save,
  DollarSign, CreditCard, FileText, Mail, Search, User, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';

interface QuotaType {
  id: string;
  quota_name: string;
  quota_code: string;
  description: string;
  annual_fee_amount: number;
  is_government_quota: boolean;
  is_active: boolean;
}


interface EnhancedAddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (student: any) => void;
  selectedStudent?: any;
}

export const EnhancedAddStudentModal: React.FC<EnhancedAddStudentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  selectedStudent
}) => {
  const [step, setStep] = useState(1); // 1: Email Fetch, 2: Confirmation, 3: Transport Details, 4: Quota & Payment
  const [fetchedStudent, setFetchedStudent] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [routesData, setRoutesData] = useState<any[]>([]);
  const [quotaTypes, setQuotaTypes] = useState<QuotaType[]>([]);
  const [selectedRouteStops, setSelectedRouteStops] = useState<any[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  // Transport details form
  const [transportData, setTransportData] = useState({
    allocatedRoute: '',
    boardingPoint: '',
    transportStatus: 'active',
    paymentStatus: 'current'
  });

  // Quota and payment status tracking
  const [quotaData, setQuotaData] = useState({
    selectedQuota: '',
    academicYear: new Date().getFullYear().toString(),
    // For Government quota (₹500 total)
    govtQuotaPaid: false,
    // For Management quota (₹5000 total) - term-wise tracking
    managementPayments: [
      { term: 1, amountPaid: 0, isPaid: false },
      { term: 2, amountPaid: 0, isPaid: false },
      { term: 3, amountPaid: 0, isPaid: false }
    ] as { term: number; amountPaid: number; isPaid: boolean }[],
    // Single payment option for management quota
    singlePaymentAmount: 0,
    isSinglePayment: false
  });

  const [errors, setErrors] = useState<any>({});

  // Handle pre-selected student (available student being enrolled)
  useEffect(() => {
    if (isOpen && selectedStudent) {
      setFetchedStudent({
        id: selectedStudent.external_id,
        student_name: selectedStudent.student_name,
        student_email: selectedStudent.student_email || selectedStudent.college_email,
        student_mobile: selectedStudent.student_mobile,
        department_name: selectedStudent.department_name,
        institution_name: selectedStudent.institution_name,
        roll_number: selectedStudent.roll_number,
        father_name: selectedStudent.father_name,
        mother_name: selectedStudent.mother_name,
        father_mobile: selectedStudent.father_mobile,
        mother_mobile: selectedStudent.mother_mobile,
        date_of_birth: selectedStudent.date_of_birth,
        gender: selectedStudent.gender,
        quota: selectedStudent.quota, // Existing quota from student data
        is_profile_complete: selectedStudent.is_profile_complete
      });
      setStep(3); // Skip directly to transport assignment
    } else if (isOpen) {
      resetForm();
    }
  }, [isOpen, selectedStudent]);

  // Fetch data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchRoutes();
      fetchQuotaTypes();
    }
  }, [isOpen]);

  const resetForm = () => {
    setStep(1);
    setFetchedStudent(null);
    setEmail('');
    setTransportData({
      allocatedRoute: '',
      boardingPoint: '',
      transportStatus: 'active',
      paymentStatus: 'current'
    });
    setQuotaData({
      selectedQuota: '',
      academicYear: new Date().getFullYear().toString(),
      govtQuotaPaid: false,
      managementPayments: [
        { term: 1, amountPaid: 0, isPaid: false },
        { term: 2, amountPaid: 0, isPaid: false },
        { term: 3, amountPaid: 0, isPaid: false }
      ],
      singlePaymentAmount: 0,
      isSinglePayment: false
    });
    setErrors({});
  };

  const fetchRoutes = async () => {
    try {
      const response = await fetch('/api/admin/routes');
      const result = await response.json();
      if (result.success) {
        setRoutesData(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching routes:', error);
      setRoutesData([]);
    }
  };

  const fetchQuotaTypes = async () => {
    try {
      const response = await fetch('/api/admin/quota-types');
      if (!response.ok) {
        // If API doesn't exist, create it or fetch from database directly
        const directResponse = await fetch('/api/admin/database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'SELECT * FROM quota_types WHERE is_active = true ORDER BY annual_fee_amount ASC'
          })
        });
        const directResult = await directResponse.json();
        setQuotaTypes(directResult.data || []);
        return;
      }
      
      const result = await response.json();
      setQuotaTypes(result.data || []);
    } catch (error) {
      console.error('Error fetching quota types:', error);
      setQuotaTypes([]);
    }
  };

  const fetchStudentByEmail = async () => {
    setIsLoading(true);
    setErrors({});
    
    try {
      console.log('🔍 Fetching student details for email from external API via proxy:', email);
      
      const searchResponse = await fetch('/api/external-students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });
      
      console.log('📡 API Proxy Response Status:', searchResponse.status);
      
      if (!searchResponse.ok) {
        const errorData = await searchResponse.json().catch(() => ({}));
        console.error('❌ API Proxy error:', searchResponse.status, searchResponse.statusText, errorData);
        
        if (searchResponse.status === 404) {
          setErrors({ email: 'Student not found with this email address in the external database' });
          toast.error('Student not found. Please check the email address.');
          return;
        }
        
        throw new Error(`API Proxy error: ${searchResponse.status} ${searchResponse.statusText} - ${errorData.error || 'Unknown error'}`);
      }
      
      const searchData = await searchResponse.json();
      console.log('📊 API Proxy response:', searchData);
      
      if (!searchData.success || !searchData.data) {
        throw new Error('Invalid response format from API proxy');
      }
      
      const matchedStudent = searchData.data;
      console.log('✅ Found matching student via proxy:', matchedStudent);
      
      // Map external API data to internal format
      const finalStudentData = {
        id: matchedStudent.id,
        student_name: matchedStudent.first_name && matchedStudent.last_name 
          ? `${matchedStudent.first_name} ${matchedStudent.last_name}`.trim()
          : matchedStudent.student_name || matchedStudent.name || 'Unknown',
        roll_number: matchedStudent.roll_number || matchedStudent.rollNumber || 'Not Available',
        student_email: matchedStudent.student_email || matchedStudent.email || matchedStudent.college_email,
        student_mobile: matchedStudent.student_mobile || matchedStudent.mobile || matchedStudent.phone || 'Not Available',
        father_name: matchedStudent.father_name || 'Not Available',
        mother_name: matchedStudent.mother_name || 'Not Available',
        father_mobile: matchedStudent.father_mobile || 'Not Available',
        mother_mobile: matchedStudent.mother_mobile || 'Not Available',
        date_of_birth: matchedStudent.date_of_birth || matchedStudent.dateOfBirth,
        gender: matchedStudent.gender,
        department_name: matchedStudent.department_name || matchedStudent.department?.department_name || 'Not Available',
        institution_name: matchedStudent.institution_name || matchedStudent.institution?.name || 'JKKN College',
        program_name: matchedStudent.program_name || matchedStudent.program?.program_name,
        degree_name: matchedStudent.degree_name || matchedStudent.degree?.degree_name,
        quota: matchedStudent.quota || null, // Existing quota from student data
        is_profile_complete: matchedStudent.is_profile_complete || false
      };
      
      setFetchedStudent(finalStudentData);
      
      if (finalStudentData.is_profile_complete) {
        toast.success('Student profile found and verified!');
      } else {
        toast('Student found, but profile may be incomplete. You can still proceed with enrollment.', {
          icon: '⚠️',
          duration: 4000
        });
      }
      
      setStep(2);
    } catch (error) {
      console.error('Error fetching student:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrors({ email: errorMessage });
      toast.error(`Failed to fetch student: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRouteStops = async (routeId: string) => {
    if (!routeId) {
      setSelectedRouteStops([]);
      return;
    }

    try {
      setStopsLoading(true);
      const route = await DatabaseService.getRouteById(routeId);
      if (route && route.stops && Array.isArray(route.stops)) {
        const sortedStops = route.stops.sort((a: any, b: any) => 
          (a.sequence_order || 0) - (b.sequence_order || 0)
        );
        setSelectedRouteStops(sortedStops);
      } else {
        setSelectedRouteStops([]);
      }
    } catch (error) {
      console.error('Error fetching route stops:', error);
      setSelectedRouteStops([]);
    } finally {
      setStopsLoading(false);
    }
  };

  const handleQuotaChange = (quotaId: string) => {
    setQuotaData({
      ...quotaData,
      selectedQuota: quotaId
    });
  };

  const validateQuotaData = () => {
    const newErrors: any = {};
    const selectedQuotaType = quotaTypes.find(q => q.id === quotaData.selectedQuota);
    
    if (!quotaData.selectedQuota) {
      newErrors.quota = 'Please select a quota type';
    }
    
    // Validate payment status based on quota type
    if (selectedQuotaType) {
      const isGovtQuota = selectedQuotaType.quota_name?.toLowerCase().includes('government') || 
                         selectedQuotaType.quota_name?.toLowerCase().includes('7.5');
      
      if (!isGovtQuota) {
        // For Management quota - validate payment amounts
        if (quotaData.isSinglePayment) {
          if (quotaData.singlePaymentAmount < 0 || quotaData.singlePaymentAmount > selectedQuotaType.annual_fee_amount) {
            newErrors.singlePayment = `Single payment amount must be between ₹0 and ₹${selectedQuotaType.annual_fee_amount}`;
          }
        } else {
          const totalPaid = (quotaData.managementPayments || []).reduce((sum, payment) => sum + payment.amountPaid, 0);
          if (totalPaid > selectedQuotaType.annual_fee_amount) {
            newErrors.managementPayments = `Total paid amount (₹${totalPaid}) cannot exceed quota fee (₹${selectedQuotaType.annual_fee_amount})`;
          }
          
          (quotaData.managementPayments || []).forEach((payment, index) => {
            if (payment.isPaid && payment.amountPaid <= 0) {
              newErrors[`mgmt_term_${index}`] = 'Paid amount must be greater than 0';
            }
          });
        }
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveStudent = async () => {
    if (step === 4) {
      if (!validateQuotaData()) {
        return;
      }
    }

    try {
      setIsLoading(true);
      
      // Prepare student data with quota and payment information
      const studentData = {
        ...fetchedStudent,
        // Ensure required fields are properly mapped and have values
        student_name: fetchedStudent.student_name || fetchedStudent.name || 'Unknown Student',
        roll_number: fetchedStudent.roll_number || fetchedStudent.rollNumber || 'UNKNOWN',
        email: fetchedStudent.email || fetchedStudent.student_email || `unknown-${Date.now()}@temp.edu`,
        mobile: fetchedStudent.mobile || fetchedStudent.student_mobile || '0000000000',
        
        // Academic information - extract from nested objects if available
        department_name: fetchedStudent.department?.department_name || fetchedStudent.department_name || 'Unknown Department',
        institution_name: fetchedStudent.institution?.name || fetchedStudent.institution_name || 'Unknown Institution',
        program_name: fetchedStudent.program?.program_name || fetchedStudent.program_name || '',
        degree_name: fetchedStudent.degree?.degree_name || fetchedStudent.degree_name || '',
        
        // Personal details
        father_name: fetchedStudent.father_name || 'Unknown',
        mother_name: fetchedStudent.mother_name || 'Unknown',
        father_mobile: fetchedStudent.father_mobile || '',
        mother_mobile: fetchedStudent.mother_mobile || '0000000000',
        date_of_birth: fetchedStudent.date_of_birth || null,
        gender: fetchedStudent.gender || 'Unknown',
        
        // Address information
        address_street: fetchedStudent.permanent_address_street || '',
        address_district: fetchedStudent.permanent_address_district || '',
        address_state: fetchedStudent.permanent_address_state || '',
        address_pin_code: fetchedStudent.permanent_address_pin_code || '',
        
        // Academic details
        admission_id: fetchedStudent.admission_id || null,
        application_id: fetchedStudent.application_id || null,
        semester_id: fetchedStudent.semester_id || null,
        section_id: fetchedStudent.section_id || null,
        academic_year_id: fetchedStudent.academic_year_id || null,
        entry_type: fetchedStudent.entry_type || '',
        
        // External reference
        external_id: fetchedStudent.id || fetchedStudent.external_id,
        
        // Transport and quota information
        allocated_route_id: transportData.allocatedRoute,
        boarding_point: transportData.boardingPoint,
        transport_status: transportData.transportStatus,
        payment_status: transportData.paymentStatus,
        quota_type_id: quotaData.selectedQuota,
        transport_fee_amount: quotaTypes.find(q => q.id === quotaData.selectedQuota)?.annual_fee_amount || 0
      };

      console.log('🔍 Student data before saving:', studentData);
      console.log('🔍 Email field check:', {
        email: studentData.email,
        student_email: fetchedStudent.student_email,
        fetchedStudent_email: fetchedStudent.email
      });

      // Validate required fields before saving
      const requiredFields = ['student_name', 'roll_number', 'email', 'mobile'];
      const missingFields = requiredFields.filter(field => !studentData[field] || studentData[field] === '');
      
      if (missingFields.length > 0) {
        toast.error(`Missing required fields: ${missingFields.join(', ')}`);
        return;
      }

      // Save student to database
      const savedStudent = await DatabaseService.addStudent(studentData);
      
      // Calculate outstanding amount and create payment records
      if (quotaData.selectedQuota) {
        const selectedQuotaType = quotaTypes.find(q => q.id === quotaData.selectedQuota);
        const isGovtQuota = selectedQuotaType?.quota_name?.toLowerCase().includes('government') || 
                           selectedQuotaType?.quota_name?.toLowerCase().includes('7.5');
        
        let totalPaid = 0;
        let outstandingAmount = selectedQuotaType?.annual_fee_amount || 0;
        
        if (isGovtQuota) {
          // Government quota: ₹500 total
          totalPaid = quotaData.govtQuotaPaid ? 500 : 0;
          outstandingAmount = 500 - totalPaid;
        } else {
          // Management quota: ₹5000 total
          if (quotaData.isSinglePayment) {
            totalPaid = quotaData.singlePaymentAmount;
          } else {
            totalPaid = (quotaData.managementPayments || []).reduce((sum, payment) => sum + payment.amountPaid, 0);
          }
          outstandingAmount = (selectedQuotaType?.annual_fee_amount || 5000) - totalPaid;
        }
        
        // Update student with payment information
        await fetch('/api/admin/students', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: savedStudent.id,
            outstanding_amount: outstandingAmount,
            payment_status: outstandingAmount > 0 ? 'pending' : 'current'
          })
        });
        
        // Create payment records for what's already paid
        if (totalPaid > 0) {
          await fetch('/api/admin/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: savedStudent.id,
              amount: totalPaid,
              payment_type: 'transport_fee',
              payment_method: 'cash', // Default, can be updated later
              academic_year: quotaData.academicYear,
              quota_type_id: quotaData.selectedQuota,
              payment_details: isGovtQuota 
                ? { govtQuotaPaid: quotaData.govtQuotaPaid }
                : quotaData.isSinglePayment 
                  ? { singlePayment: quotaData.singlePaymentAmount }
                  : { termWisePayments: quotaData.managementPayments }
            })
          });
        }
      }

      const quotaTypeName = quotaTypes.find(q => q.id === quotaData.selectedQuota)?.quota_name || 'transport service';
      const selectedQuotaType = quotaTypes.find(q => q.id === quotaData.selectedQuota);
      const isGovtQuota = selectedQuotaType?.quota_name?.toLowerCase().includes('government') || 
                         selectedQuotaType?.quota_name?.toLowerCase().includes('7.5');
      
      let totalPaid = 0;
      if (isGovtQuota) {
        totalPaid = quotaData.govtQuotaPaid ? 500 : 0;
      } else {
        totalPaid = quotaData.isSinglePayment 
          ? quotaData.singlePaymentAmount 
          : (quotaData.managementPayments || []).reduce((sum, payment) => sum + payment.amountPaid, 0);
      }
      
      const outstandingAmount = (selectedQuotaType?.annual_fee_amount || 0) - totalPaid;
      const paymentMessage = outstandingAmount > 0 
        ? `(Outstanding: ₹${outstandingAmount})` 
        : '(Fully Paid)';
      
      toast.success(`Student enrolled successfully with ${quotaTypeName}! ${paymentMessage}`);
      onSave(savedStudent);
      onClose();
      
    } catch (error) {
      console.error('Error saving student:', error);
      toast.error('Failed to save student. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate total payment amount based on quota type
  const selectedQuotaType = quotaTypes.find(q => q.id === quotaData.selectedQuota);
  const isGovtQuota = selectedQuotaType?.quota_name?.toLowerCase().includes('government') || 
                     selectedQuotaType?.quota_name?.toLowerCase().includes('7.5');
  
  const totalPaymentAmount = isGovtQuota 
    ? (quotaData.govtQuotaPaid ? 500 : 0)
    : quotaData.isSinglePayment 
      ? quotaData.singlePaymentAmount
      : (quotaData.managementPayments || []).reduce((sum, payment) => sum + payment.amountPaid, 0);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress indicator */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {step === 1 && 'Find Student'}
                {step === 2 && 'Confirm Details'}
                {step === 3 && 'Transport Assignment'}
                  {step === 4 && 'Quota & Payment Status'}
              </h2>
              <div className="flex items-center space-x-4">
                <div className="flex space-x-2">
                  {[1, 2, 3, 4].map((stepNum) => (
                    <div
                      key={stepNum}
                      className={`w-3 h-3 rounded-full ${
                        stepNum <= step ? 'bg-white' : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-white hover:text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Step 1: Email Input */}
          {step === 1 && (
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Find Student</h3>
                <p className="text-gray-600">Enter the student's email address to fetch their details from the college database</p>
              </div>

              <div className="max-w-md mx-auto">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Student Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`input ${errors.email ? 'border-red-500' : ''}`}
                      placeholder="Enter student email (e.g., student@example.com)"
                      onKeyPress={(e) => e.key === 'Enter' && fetchStudentByEmail()}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                </div>

                <div className="flex justify-between space-x-3 mt-8">
                  <button
                    onClick={onClose}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={fetchStudentByEmail}
                    disabled={!email || isLoading}
                    className={`btn-primary flex items-center space-x-2 ${
                      (!email || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Searching...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>Find Student</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Student Confirmation */}
          {step === 2 && fetchedStudent && (
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Confirm Student Details</h3>
                <p className="text-gray-600">Please review the student information before proceeding</p>
              </div>

              <div className="space-y-6 max-h-96 overflow-y-auto">
                {/* Basic Information */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Basic Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Name</label>
                      <p className="text-gray-900 font-medium">{fetchedStudent.student_name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Roll Number</label>
                      <p className="text-gray-900 font-medium">{fetchedStudent.roll_number}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Email</label>
                      <p className="text-gray-900">{fetchedStudent.student_email}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Phone</label>
                      <p className="text-gray-900">{fetchedStudent.student_mobile}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Department</label>
                      <p className="text-gray-900">{fetchedStudent.department_name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Institution</label>
                      <p className="text-gray-900">{fetchedStudent.institution_name}</p>
                    </div>
                    {fetchedStudent.quota && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Current Quota</label>
                        <p className="text-gray-900 font-medium">{fetchedStudent.quota}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between space-x-3">
                <button
                  onClick={() => setStep(1)}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <div className="flex space-x-3">
                  <button
                    onClick={onClose}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="btn-primary flex items-center space-x-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm & Continue</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Quota & Payment Configuration */}
          {step === 4 && (
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Quota & Payment Status</h3>
                <p className="text-gray-600">Select student quota and track payment status</p>
              </div>

              <div className="space-y-6">
                {/* Quota Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Student Quota *
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {quotaTypes.map((quota) => (
                      <div
                        key={quota.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                          quotaData.selectedQuota === quota.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleQuotaChange(quota.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className={`font-medium ${
                              quota.is_government_quota ? 'text-green-700' : 'text-gray-900'
                            }`}>
                              {quota.quota_name}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">{quota.description}</p>
                            <div className="mt-2 flex items-center space-x-4">
                              <span className={`text-lg font-bold ${
                                quota.is_government_quota ? 'text-green-600' : 'text-blue-600'
                              }`}>
                                ₹{quota.annual_fee_amount}
                              </span>
                              {quota.is_government_quota && (
                                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                                  Government Quota
                                </span>
                              )}
                            </div>
                          </div>
                          {quotaData.selectedQuota === quota.id && (
                            <CheckCircle className="w-6 h-6 text-blue-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {errors.quota && <p className="text-red-500 text-sm mt-1">{errors.quota}</p>}
                </div>

                {/* Academic Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                  <select
                    value={quotaData.academicYear}
                    onChange={(e) => setQuotaData({ ...quotaData, academicYear: e.target.value })}
                    className="input"
                  >
                    <option value={new Date().getFullYear().toString()}>{new Date().getFullYear()}-{new Date().getFullYear() + 1}</option>
                    <option value={(new Date().getFullYear() + 1).toString()}>{new Date().getFullYear() + 1}-{new Date().getFullYear() + 2}</option>
                  </select>
                </div>

                {/* Payment Status Tracking */}
                {selectedQuotaType && (
                  <div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Payment Status for Academic Year {quotaData.academicYear}
                      </label>

                      {/* Government Quota Payment Status */}
                      {(selectedQuotaType.quota_name?.toLowerCase().includes('government') || 
                        selectedQuotaType.quota_name?.toLowerCase().includes('7.5')) ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-green-800">Government Quota - Annual Fee: ₹500</h4>
                          </div>
                          
                          <label className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              checked={quotaData.govtQuotaPaid}
                              onChange={(e) => setQuotaData({
                                ...quotaData,
                                govtQuotaPaid: e.target.checked
                              })}
                              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                            <span className="text-sm font-medium text-gray-700">
                              ₹500 paid for academic year {quotaData.academicYear}
                            </span>
                          </label>
                          
                          <div className="mt-3 p-3 bg-white rounded border">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Outstanding Amount:</span>
                              <span className={`text-sm font-bold ${quotaData.govtQuotaPaid ? 'text-green-600' : 'text-red-600'}`}>
                                ₹{quotaData.govtQuotaPaid ? 0 : 500}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Management Quota Payment Status */
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-medium text-blue-800">
                              Management Quota - Annual Fee: ₹{selectedQuotaType.annual_fee_amount}
                            </h4>
                          </div>
                          
                          {/* Payment Mode Selection */}
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
                            <div className="flex space-x-4">
                              <label className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  name="paymentMode"
                                  checked={!quotaData.isSinglePayment}
                                  onChange={() => setQuotaData({ ...quotaData, isSinglePayment: false })}
                                  className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">Term-wise Payment</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  name="paymentMode"
                                  checked={quotaData.isSinglePayment}
                                  onChange={() => setQuotaData({ ...quotaData, isSinglePayment: true })}
                                  className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">Single Payment</span>
                              </label>
                            </div>
                          </div>
                          
                          {quotaData.isSinglePayment ? (
                            /* Single Payment Mode */
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Amount Paid (Single Payment)
                                </label>
                                <input
                                  type="number"
                                  value={quotaData.singlePaymentAmount}
                                  onChange={(e) => setQuotaData({
                                    ...quotaData,
                                    singlePaymentAmount: parseInt(e.target.value) || 0
                                  })}
                                  className="input"
                                  placeholder="Enter amount paid"
                                  min="0"
                                  max={selectedQuotaType.annual_fee_amount}
                                />
                                {errors.singlePayment && (
                                  <p className="text-red-500 text-xs mt-1">{errors.singlePayment}</p>
                                )}
                              </div>
                              
                              <div className="p-3 bg-white rounded border">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600">Outstanding Amount:</span>
                                  <span className={`text-sm font-bold ${
                                    (selectedQuotaType.annual_fee_amount - quotaData.singlePaymentAmount) <= 0 
                                      ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    ₹{Math.max(0, selectedQuotaType.annual_fee_amount - quotaData.singlePaymentAmount)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* Term-wise Payment Mode */
                            <div className="space-y-3">
                              <div className="text-sm text-gray-600 mb-3">
                                Mark the terms that have been paid and enter the amounts:
                              </div>
                              
                              {quotaData.managementPayments.map((payment, index) => (
                                <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg bg-white">
                                  <input
                                    type="checkbox"
                                    checked={payment.isPaid}
                                    onChange={(e) => {
                                      const newPayments = [...quotaData.managementPayments];
                                      newPayments[index].isPaid = e.target.checked;
                                      if (!e.target.checked) {
                                        newPayments[index].amountPaid = 0;
                                      }
                                      setQuotaData({ ...quotaData, managementPayments: newPayments });
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div className="flex-shrink-0 w-16">
                                    <span className="text-sm font-medium text-gray-700">Term {payment.term}</span>
                                  </div>
                                  <div className="flex-1">
                                    <input
                                      type="number"
                                      value={payment.amountPaid}
                                      onChange={(e) => {
                                        const newPayments = [...quotaData.managementPayments];
                                        newPayments[index].amountPaid = parseInt(e.target.value) || 0;
                                        setQuotaData({ ...quotaData, managementPayments: newPayments });
                                      }}
                                      disabled={!payment.isPaid}
                                      className={`input ${!payment.isPaid ? 'bg-gray-100' : ''}`}
                                      placeholder="Amount paid"
                                      min="0"
                                      max={selectedQuotaType.annual_fee_amount}
                                    />
                                    {errors[`mgmt_term_${index}`] && (
                                      <p className="text-red-500 text-xs mt-1">{errors[`mgmt_term_${index}`]}</p>
                                    )}
                                  </div>
                                  <div className="flex-shrink-0 w-20 text-right">
                                    <span className={`text-sm font-medium ${payment.isPaid ? 'text-green-600' : 'text-gray-400'}`}>
                                      {payment.isPaid ? 'Paid' : 'Pending'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              
                              <div className="p-3 bg-white rounded border">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm text-gray-600">Total Paid:</span>
                                  <span className="text-sm font-medium text-blue-600">
                                    ₹{(quotaData.managementPayments || []).reduce((sum, p) => sum + p.amountPaid, 0)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600">Outstanding Amount:</span>
                                  <span className={`text-sm font-bold ${
                                    (selectedQuotaType.annual_fee_amount - (quotaData.managementPayments || []).reduce((sum, p) => sum + p.amountPaid, 0)) <= 0 
                                      ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    ₹{Math.max(0, selectedQuotaType.annual_fee_amount - (quotaData.managementPayments || []).reduce((sum, p) => sum + p.amountPaid, 0))}
                                  </span>
                                </div>
                              </div>
                              
                              {errors.managementPayments && (
                                <p className="text-red-500 text-sm mt-2">{errors.managementPayments}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between space-x-3 pt-6">
                <button
                  onClick={() => setStep(3)}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <div className="flex space-x-3">
                  <button
                    onClick={onClose}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveStudent}
                    disabled={isLoading || !quotaData.selectedQuota}
                    className={`btn-primary flex items-center space-x-2 ${
                      (!quotaData.selectedQuota || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Enrolling...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Complete Enrollment</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Transport Details Step - Modified to include quota step */}
          {step === 3 && (
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Transport Assignment</h3>
                <p className="text-gray-600">Configure transport details and bus allocation</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Route Assignment *</label>
                  <select
                    value={transportData.allocatedRoute}
                    onChange={(e) => {
                      const routeId = e.target.value;
                      setTransportData({ ...transportData, allocatedRoute: routeId, boardingPoint: '' });
                      fetchRouteStops(routeId);
                    }}
                    className={`input ${errors.allocatedRoute ? 'border-red-500' : ''}`}
                  >
                    <option value="">Select a route</option>
                    {routesData.filter(route => route.status === 'active').map(route => (
                      <option key={route.id} value={route.id}>
                        {route.route_number} - {route.route_name}
                      </option>
                    ))}
                  </select>
                  {errors.allocatedRoute && <p className="text-red-500 text-xs mt-1">{errors.allocatedRoute}</p>}
                </div>

                {transportData.allocatedRoute && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Boarding Point *</label>
                    <select
                      value={transportData.boardingPoint}
                      onChange={(e) => setTransportData({ ...transportData, boardingPoint: e.target.value })}
                      className={`input ${errors.boardingPoint ? 'border-red-500' : ''}`}
                      disabled={stopsLoading}
                    >
                      <option value="">
                        {stopsLoading ? 'Loading stops...' : 'Select boarding point'}
                      </option>
                      {selectedRouteStops.map((stop: any) => (
                        <option key={stop.id} value={stop.stop_name}>
                          {stop.stop_name}
                          {stop.morning_arrival_time && ` (${stop.morning_arrival_time})`}
                        </option>
                      ))}
                    </select>
                    {errors.boardingPoint && <p className="text-red-500 text-xs mt-1">{errors.boardingPoint}</p>}
                  </div>
                )}
              </div>

              <div className="flex justify-between space-x-3 pt-6">
                <button
                  onClick={() => setStep(2)}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <div className="flex space-x-3">
                  <button
                    onClick={onClose}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!transportData.allocatedRoute) {
                        setErrors({ allocatedRoute: 'Please select a route' });
                        return;
                      }
                      if (!transportData.boardingPoint) {
                        setErrors({ boardingPoint: 'Please select a boarding point' });
                        return;
                      }
                      setErrors({});
                      setStep(4);
                    }}
                    className="btn-primary flex items-center space-x-2"
                  >
                    <span>Configure Quota & Payment</span>
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
