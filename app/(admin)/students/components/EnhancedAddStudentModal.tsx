'use client'
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, CheckCircle, ArrowLeft, Check, Save, Plus, Minus,
  DollarSign, Calendar, CreditCard, FileText, Mail, Search, User
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

interface PaymentTerm {
  term: number;
  amount: number;
  due_date?: string;
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

  // Quota and payment form
  const [quotaData, setQuotaData] = useState({
    selectedQuota: '',
    academicYear: new Date().getFullYear().toString(),
    paymentTerms: [
      { term: 1, amount: 0 },
      { term: 2, amount: 0 },
      { term: 3, amount: 0 }
    ] as PaymentTerm[]
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
      paymentTerms: [
        { term: 1, amount: 0 },
        { term: 2, amount: 0 },
        { term: 3, amount: 0 }
      ]
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
    const selectedQuotaType = quotaTypes.find(q => q.id === quotaId);
    if (selectedQuotaType) {
      const baseAmount = selectedQuotaType.annual_fee_amount;
      
      // Auto-distribute amount across terms
      let newTerms = [...quotaData.paymentTerms];
      if (selectedQuotaType.is_government_quota && baseAmount === 500) {
        // For government quota, typically one payment
        newTerms = [{ term: 1, amount: baseAmount }];
      } else {
        // For regular quota, distribute across 3 terms
        const baseTermAmount = Math.floor(baseAmount / 3);
        const remainder = baseAmount % 3;
        
        newTerms = [
          { term: 1, amount: baseTermAmount },
          { term: 2, amount: baseTermAmount },
          { term: 3, amount: baseTermAmount + remainder }
        ];
      }
      
      setQuotaData({
        ...quotaData,
        selectedQuota: quotaId,
        paymentTerms: newTerms
      });
    }
  };

  const updateTermAmount = (termIndex: number, amount: number) => {
    const newTerms = [...quotaData.paymentTerms];
    newTerms[termIndex].amount = amount;
    setQuotaData({
      ...quotaData,
      paymentTerms: newTerms
    });
  };

  const addPaymentTerm = () => {
    setQuotaData({
      ...quotaData,
      paymentTerms: [
        ...quotaData.paymentTerms,
        { term: quotaData.paymentTerms.length + 1, amount: 0 }
      ]
    });
  };

  const removePaymentTerm = (termIndex: number) => {
    if (quotaData.paymentTerms.length > 1) {
      const newTerms = quotaData.paymentTerms.filter((_, index) => index !== termIndex);
      // Renumber terms
      newTerms.forEach((term, index) => {
        term.term = index + 1;
      });
      setQuotaData({
        ...quotaData,
        paymentTerms: newTerms
      });
    }
  };

  const validateQuotaData = () => {
    const newErrors: any = {};
    const selectedQuotaType = quotaTypes.find(q => q.id === quotaData.selectedQuota);
    
    if (!quotaData.selectedQuota) {
      newErrors.quota = 'Please select a quota type';
    }
    
    const totalAmount = quotaData.paymentTerms.reduce((sum, term) => sum + term.amount, 0);
    if (selectedQuotaType && totalAmount !== selectedQuotaType.annual_fee_amount) {
      newErrors.paymentTerms = `Total payment amount (₹${totalAmount}) must equal quota fee (₹${selectedQuotaType.annual_fee_amount})`;
    }
    
    quotaData.paymentTerms.forEach((term, index) => {
      if (term.amount <= 0) {
        newErrors[`term_${index}`] = 'Amount must be greater than 0';
      }
    });
    
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
        allocated_route_id: transportData.allocatedRoute,
        boarding_point: transportData.boardingPoint,
        transport_status: transportData.transportStatus,
        payment_status: transportData.paymentStatus,
        quota_type_id: quotaData.selectedQuota,
        transport_fee_amount: quotaTypes.find(q => q.id === quotaData.selectedQuota)?.annual_fee_amount || 0
      };

      // Save student to database
      const savedStudent = await DatabaseService.addStudent(studentData);
      
      // Create payment plan if quota is selected
      if (quotaData.selectedQuota && quotaData.paymentTerms.length > 0) {
        const termsConfig = quotaData.paymentTerms.map(term => ({
          term: term.term,
          amount: term.amount
        }));
        
        await fetch('/api/admin/payment-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: savedStudent.id,
            quota_type_id: quotaData.selectedQuota,
            academic_year: quotaData.academicYear,
            terms_config: termsConfig
          })
        });
      }

      toast.success(`Student enrolled successfully with ${quotaTypes.find(q => q.id === quotaData.selectedQuota)?.quota_name || 'transport service'}!`);
      onSave(savedStudent);
      onClose();
      
    } catch (error) {
      console.error('Error saving student:', error);
      toast.error('Failed to save student. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedQuotaType = quotaTypes.find(q => q.id === quotaData.selectedQuota);
  const totalPaymentAmount = quotaData.paymentTerms.reduce((sum, term) => sum + term.amount, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-900 bg-opacity-75" onClick={onClose}></div>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl"
        >
          {/* Progress indicator */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {step === 1 && 'Find Student'}
                {step === 2 && 'Confirm Details'}
                {step === 3 && 'Transport Assignment'}
                {step === 4 && 'Quota & Payment Configuration'}
              </h2>
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
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Quota & Payment Configuration</h3>
                <p className="text-gray-600">Configure student quota and flexible payment terms</p>
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

                {/* Payment Terms Configuration */}
                {selectedQuotaType && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Payment Terms Configuration
                      </label>
                      <button
                        onClick={addPaymentTerm}
                        className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Term</span>
                      </button>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-800">
                          Total Annual Fee: ₹{selectedQuotaType.annual_fee_amount}
                        </span>
                        <span className={`text-sm font-medium ${
                          totalPaymentAmount === selectedQuotaType.annual_fee_amount
                            ? 'text-green-700'
                            : 'text-red-700'
                        }`}>
                          Configured Total: ₹{totalPaymentAmount}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {quotaData.paymentTerms.map((term, index) => (
                        <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">Term {term.term}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500">₹</span>
                              <input
                                type="number"
                                min="0"
                                max={selectedQuotaType.annual_fee_amount}
                                value={term.amount}
                                onChange={(e) => updateTermAmount(index, parseFloat(e.target.value) || 0)}
                                className={`input flex-1 ${errors[`term_${index}`] ? 'border-red-500' : ''}`}
                                placeholder="Enter amount"
                              />
                            </div>
                            {errors[`term_${index}`] && (
                              <p className="text-red-500 text-xs mt-1">{errors[`term_${index}`]}</p>
                            )}
                          </div>
                          {quotaData.paymentTerms.length > 1 && (
                            <button
                              onClick={() => removePaymentTerm(index)}
                              className="p-1 text-red-600 hover:text-red-800"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {errors.paymentTerms && (
                      <p className="text-red-500 text-sm mt-2">{errors.paymentTerms}</p>
                    )}

                    {/* Payment Examples */}
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Payment Examples:</h5>
                      <div className="text-xs text-gray-600 space-y-1">
                        {selectedQuotaType.is_government_quota ? (
                          <p>• Government Quota: Single payment of ₹500</p>
                        ) : (
                          <>
                            <p>• Option 1: ₹1500, ₹1500, ₹2000</p>
                            <p>• Option 2: ₹3000, ₹2000</p>
                            <p>• Option 3: ₹2000, ₹1500, ₹1500</p>
                          </>
                        )}
                      </div>
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
      </div>
    </div>
  );
};
