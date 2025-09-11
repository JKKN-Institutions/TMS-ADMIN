'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Plus,
  Search,
  User,
  DollarSign,
  CreditCard,
  Calendar,
  FileText,
  Receipt,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { studentsData } from '@/data/admin-data';
import toast from 'react-hot-toast';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePayment: (paymentData: any) => void;
}

const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onSavePayment
}) => {
  const [step, setStep] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentType: 'semester_fee',
    paymentMethod: 'cash',
    transactionId: '',
    description: '',
    receiptNumber: '',
    dateOfPayment: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Define generateReceiptNumber before useEffect
  const generateReceiptNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `RCP${year}${month}${day}${random}`;
  };

  // Move useEffect to the top, before any conditional returns
  React.useEffect(() => {
    if (!paymentData.receiptNumber) {
      setPaymentData(prev => ({ ...prev, receiptNumber: generateReceiptNumber() }));
    }
  }, []);

  if (!isOpen) return null;

  const filteredStudents = studentsData.filter(student =>
    student.studentName.toLowerCase().includes(studentSearch.toLowerCase()) ||
    student.rollNumber.toLowerCase().includes(studentSearch.toLowerCase()) ||
    student.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const paymentTypes = [
    { value: 'semester_fee', label: 'Semester Fee', description: 'Regular semester transport fee' },
    { value: 'registration', label: 'Registration Fee', description: 'Annual transport registration' },
    { value: 'trip_fare', label: 'Trip Fare', description: 'Individual trip payment' },
    { value: 'fine', label: 'Fine Payment', description: 'Penalty or fine payment' }
  ];

  const paymentMethods = [
    { value: 'cash', label: 'Cash', requiresTransaction: false },
    { value: 'upi', label: 'UPI', requiresTransaction: true },
    { value: 'card', label: 'Card Payment', requiresTransaction: true },
    { value: 'net_banking', label: 'Net Banking', requiresTransaction: true },
    { value: 'wallet', label: 'Digital Wallet', requiresTransaction: true }
  ];

  const validateStep1 = () => {
    if (!selectedStudent) {
      toast.error('Please select a student');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return false;
    }
    if (!paymentData.description.trim()) {
      toast.error('Please enter a payment description');
      return false;
    }
    const selectedMethod = paymentMethods.find(m => m.value === paymentData.paymentMethod);
    if (selectedMethod?.requiresTransaction && !paymentData.transactionId.trim()) {
      toast.error('Transaction ID is required for this payment method');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleSavePayment = () => {
    if (!validateStep2()) return;

    const newPayment = {
      id: `payment_${Date.now()}`,
      studentId: selectedStudent.id,
      amount: parseFloat(paymentData.amount),
      paymentType: paymentData.paymentType,
      paymentMethod: paymentData.paymentMethod,
      status: 'completed',
      transactionId: paymentData.transactionId || generateReceiptNumber(),
      description: paymentData.description,
      receiptNumber: paymentData.receiptNumber || generateReceiptNumber(),
      notes: paymentData.notes,
      createdAt: new Date(paymentData.dateOfPayment),
      recordedBy: 'current_admin', // This would be actual admin ID
      isManualEntry: true
    };

    onSavePayment(newPayment);
    toast.success('Payment recorded successfully!');
    onClose();
    
    // Reset form
    setStep(1);
    setSelectedStudent(null);
    setStudentSearch('');
    setPaymentData({
      amount: '',
      paymentType: 'semester_fee',
      paymentMethod: 'cash',
      transactionId: '',
      description: '',
      receiptNumber: '',
      dateOfPayment: new Date().toISOString().split('T')[0],
      notes: ''
    });
  };

  const selectedPaymentType = paymentTypes.find(pt => pt.value === paymentData.paymentType);
  const selectedPaymentMethod = paymentMethods.find(pm => pm.value === paymentData.paymentMethod);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50 flex-shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-green-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Record Payment</h2>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Manual payment entry for offline transactions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center py-3 sm:py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-4 px-4 sm:px-0">
            <div className={`flex items-center space-x-1 sm:space-x-2 ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="text-xs sm:text-sm font-medium hidden sm:inline">Select Student</span>
              <span className="text-xs sm:text-sm font-medium sm:hidden">Student</span>
            </div>
            <div className={`w-4 sm:w-8 h-0.5 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center space-x-1 sm:space-x-2 ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="text-xs sm:text-sm font-medium hidden sm:inline">Payment Details</span>
              <span className="text-xs sm:text-sm font-medium sm:hidden">Details</span>
            </div>
            <div className={`w-4 sm:w-8 h-0.5 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center space-x-1 sm:space-x-2 ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="text-xs sm:text-sm font-medium hidden sm:inline">Confirmation</span>
              <span className="text-xs sm:text-sm font-medium sm:hidden">Confirm</span>
            </div>
          </div>
        </div>

        {/* Main Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6">
            {/* Step 1: Student Selection */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Select Student</h3>
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search by name, roll number, or email..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="max-h-64 sm:max-h-96 overflow-y-auto space-y-2">
                  {filteredStudents.map((student) => (
                    <div
                      key={student.id}
                      onClick={() => setSelectedStudent(student)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedStudent?.id === student.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium text-gray-900">{student.studentName}</h4>
                              <p className="text-sm text-gray-600">{student.rollNumber}</p>
                              <p className="text-sm text-gray-500">{student.department.departmentName} - {student.program.degreeName}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600">{student.email}</p>
                              <p className="text-sm text-gray-500">{student.mobile}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredStudents.length === 0 && studentSearch && (
                  <div className="text-center py-8">
                    <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
                    <p className="text-gray-600">Try adjusting your search terms</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Payment Details */}
            {step === 2 && selectedStudent && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Selected Student</h3>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">{selectedStudent.studentName}</p>
                      <p className="text-sm text-blue-700">{selectedStudent.rollNumber}</p>
                    </div>
                  </div>
                </div>

                {/* Payment Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Payment Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {paymentTypes.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setPaymentData({ ...paymentData, paymentType: type.value })}
                        className={`p-3 border-2 rounded-lg text-left transition-colors ${
                          paymentData.paymentType === type.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-gray-900">{type.label}</div>
                        <div className="text-sm text-gray-600">{type.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount and Payment Method */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                      <input
                        type="number"
                        value={paymentData.amount}
                        onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                        placeholder="0.00"
                        className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                    <select
                      value={paymentData.paymentMethod}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {paymentMethods.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Transaction ID (conditional) */}
                {selectedPaymentMethod?.requiresTransaction && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Transaction ID</label>
                    <input
                      type="text"
                      value={paymentData.transactionId}
                      onChange={(e) => setPaymentData({ ...paymentData, transactionId: e.target.value })}
                      placeholder="Enter transaction ID from payment gateway"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Date and Receipt Number */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Payment</label>
                    <input
                      type="date"
                      value={paymentData.dateOfPayment}
                      onChange={(e) => setPaymentData({ ...paymentData, dateOfPayment: e.target.value })}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Receipt Number</label>
                    <input
                      type="text"
                      value={paymentData.receiptNumber}
                      onChange={(e) => setPaymentData({ ...paymentData, receiptNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <input
                    type="text"
                    value={paymentData.description}
                    onChange={(e) => setPaymentData({ ...paymentData, description: e.target.value })}
                    placeholder={`${selectedPaymentType?.label} - ${selectedStudent.studentName}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes (Optional)</label>
                  <textarea
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                    placeholder="Any additional information about this payment..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Confirmation */}
            {step === 3 && selectedStudent && (
              <div className="space-y-6">
                <div className="text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Confirm Payment Details</h3>
                  <p className="text-gray-600">Please review all information before recording the payment</p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Student Information</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Name:</span>
                          <span className="font-medium">{selectedStudent.studentName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Roll Number:</span>
                          <span className="font-medium">{selectedStudent.rollNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Department:</span>
                          <span className="font-medium">{selectedStudent.department.departmentName}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Payment Information</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Amount:</span>
                          <span className="font-bold text-green-600">₹{paymentData.amount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Type:</span>
                          <span className="font-medium">{selectedPaymentType?.label}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Method:</span>
                          <span className="font-medium">{selectedPaymentMethod?.label}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Date:</span>
                          <span className="font-medium">{new Date(paymentData.dateOfPayment).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Receipt:</span>
                          <span className="font-mono text-xs">{paymentData.receiptNumber}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Description:</span>
                      <span className="font-medium text-right">{paymentData.description}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-900">Important Notice</h4>
                      <p className="text-sm text-yellow-800 mt-1">
                        This payment will be recorded as completed. Please ensure all details are correct as this action cannot be easily undone.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions - Sticky Bottom */}
        <div className="border-t border-gray-200 p-4 sm:p-6 bg-gray-50 flex-shrink-0">
          <div className="flex flex-col sm:flex-row justify-between space-y-3 sm:space-y-0">
            <div>
              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors touch-manipulation"
                >
                  Back
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors touch-manipulation"
              >
                Cancel
              </button>
              {step < 3 ? (
                <button
                  onClick={handleNext}
                  className="w-full sm:w-auto bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors touch-manipulation"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSavePayment}
                  className="w-full sm:w-auto bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 touch-manipulation"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Record Payment</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RecordPaymentModal; 