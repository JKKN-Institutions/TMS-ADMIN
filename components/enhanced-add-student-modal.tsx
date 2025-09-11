'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Users,
  Mail,
  CheckCircle,
  Save,
  ArrowLeft,
  Check,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { routesData } from '@/data/admin-data';

// Mock function to simulate fetching from TMS main database
const fetchStudentFromMainDB = async (email: string) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const mockStudents = [
    {
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+91 9876543210',
      department: 'Computer Science',
      institute: 'JKKN Institute',
      rollNumber: 'CS2024001',
    },
    {
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      phone: '+91 9876543211',
      department: 'Electronics and Communication',
      institute: 'JKKN Institute',
      rollNumber: 'EC2024002',
    }
  ];
  
  const student = mockStudents.find(s => s.email.toLowerCase() === email.toLowerCase());
  if (!student) {
    throw new Error('Student not found in main database');
  }
  
  return student;
};

interface EnhancedAddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (student: any) => void;
}

const EnhancedAddStudentModal: React.FC<EnhancedAddStudentModalProps> = ({ isOpen, onClose, onSave }) => {
  const [step, setStep] = useState(1);
  const [fetchedStudent, setFetchedStudent] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [transportData, setTransportData] = useState({
    allocatedRoute: '',
    boardingPoint: '',
    transportStatus: 'active',
    paymentStatus: 'current'
  });

  const [errors, setErrors] = useState<any>({});

  const getAvailableRoutes = () => {
    return routesData.filter(route => 
      route.status === 'active' && route.currentPassengers < route.totalCapacity
    );
  };

  const getRouteAvailability = (routeId: string) => {
    const route = routesData.find(r => r.id === routeId);
    if (!route) return { available: false, remaining: 0 };
    
    const remaining = route.totalCapacity - route.currentPassengers;
    return { available: remaining > 0, remaining };
  };

  const fetchStudentByEmail = async () => {
    setIsLoading(true);
    setErrors({});
    
    try {
      const student = await fetchStudentFromMainDB(email);
      setFetchedStudent(student);
      setStep(2);
      toast.success('Student details fetched successfully!');
    } catch (error) {
      setErrors({ email: 'Student not found in main database' });
      toast.error('Student not found. Please check the email address.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmStudent = () => {
    setStep(3);
  };

  const validateTransportData = () => {
    const newErrors: any = {};
    
    if (transportData.allocatedRoute) {
      if (!transportData.boardingPoint.trim()) {
        newErrors.boardingPoint = 'Boarding point is required when route is selected';
      }
      
      const availability = getRouteAvailability(transportData.allocatedRoute);
      if (!availability.available) {
        newErrors.allocatedRoute = 'Selected route is at full capacity';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveStudent = () => {
    if (!fetchedStudent) return;
    
    if (transportData.allocatedRoute && !validateTransportData()) {
      return;
    }

    const newStudent = {
      id: `student_${Date.now()}`,
      studentName: fetchedStudent.name,
      rollNumber: fetchedStudent.rollNumber,
      email: fetchedStudent.email,
      mobile: fetchedStudent.phone,
      department: { 
        id: `dept_${Date.now()}`, 
        departmentName: fetchedStudent.department 
      },
      program: { 
        id: `prog_${Date.now()}`, 
        programName: 'Bachelor of Technology', 
        degreeName: 'B.Tech' 
      },
      institution: { 
        id: 'inst_1', 
        name: fetchedStudent.institute 
      },
      transportProfile: transportData.allocatedRoute ? {
        id: `tp_${Date.now()}`,
        studentId: `student_${Date.now()}`,
        allocatedRoutes: [transportData.allocatedRoute],
        boardingPoint: transportData.boardingPoint,
        transportStatus: transportData.transportStatus,
        paymentStatus: transportData.paymentStatus,
        totalFines: 0,
        outstandingAmount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      } : null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    onSave(newStudent);
    handleClose();
  };

  const handleClose = () => {
    setStep(1);
    setEmail('');
    setFetchedStudent(null);
    setTransportData({
      allocatedRoute: '',
      boardingPoint: '',
      transportStatus: 'active',
      paymentStatus: 'current'
    });
    setErrors({});
    onClose();
  };

  const selectedRoute = routesData.find(r => r.id === transportData.allocatedRoute);
  const routeAvailability = transportData.allocatedRoute ? getRouteAvailability(transportData.allocatedRoute) : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Add New Student</h2>
            <div className="flex items-center mt-2 space-x-2">
              <div className={`w-8 h-1 rounded ${step >= 1 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-1 rounded ${step >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-1 rounded ${step >= 3 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 1 && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Fetch Student Details</h3>
              <p className="text-gray-600">Enter the student's email ID to fetch their details from the main database</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`input ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="student@example.com"
                  disabled={isLoading}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                <p className="text-xs text-gray-500 mt-1">
                  Try: john.doe@example.com or jane.smith@example.com
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn-secondary"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={fetchStudentByEmail}
                  disabled={!email.trim() || isLoading}
                  className="btn-primary flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Fetch Details</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && fetchedStudent && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Confirm Student Details</h3>
              <p className="text-gray-600">Please verify the student information fetched from the main database</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Name</label>
                  <p className="text-gray-900 font-medium">{fetchedStudent.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Roll Number</label>
                  <p className="text-gray-900 font-medium">{fetchedStudent.rollNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Email</label>
                  <p className="text-gray-900">{fetchedStudent.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Phone</label>
                  <p className="text-gray-900">{fetchedStudent.phone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Department</label>
                  <p className="text-gray-900">{fetchedStudent.department}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Institute</label>
                  <p className="text-gray-900">{fetchedStudent.institute}</p>
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
                  onClick={handleClose}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmStudent}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm & Continue</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Transport Assignment</h3>
              <p className="text-gray-600">Configure transport details and bus allocation based on availability</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Route Assignment (Optional)</label>
                <select
                  value={transportData.allocatedRoute}
                  onChange={(e) => setTransportData({ ...transportData, allocatedRoute: e.target.value, boardingPoint: '' })}
                  className={`input ${errors.allocatedRoute ? 'border-red-500' : ''}`}
                >
                  <option value="">No transport required</option>
                  {getAvailableRoutes().map(route => {
                    const availability = getRouteAvailability(route.id);
                    return (
                      <option key={route.id} value={route.id} disabled={!availability.available}>
                        {route.routeNumber} - {route.routeName} 
                        ({availability.remaining} seats available)
                      </option>
                    );
                  })}
                </select>
                {errors.allocatedRoute && <p className="text-red-500 text-xs mt-1">{errors.allocatedRoute}</p>}
              </div>

              {transportData.allocatedRoute && selectedRoute && (
                <>
                  <div className="bg-blue-50 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-blue-900 mb-2">Selected Route Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-blue-700 font-medium">Route:</span>
                        <p className="text-blue-800">{selectedRoute.routeName}</p>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Vehicle:</span>
                        <p className="text-blue-800">{selectedRoute.vehicleId || 'TBD'}</p>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Departure:</span>
                        <p className="text-blue-800">{selectedRoute.departureTime}</p>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Available Seats:</span>
                        <p className="text-blue-800">{routeAvailability?.remaining}/{selectedRoute.totalCapacity}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Boarding Point *</label>
                    <input
                      type="text"
                      value={transportData.boardingPoint}
                      onChange={(e) => setTransportData({ ...transportData, boardingPoint: e.target.value })}
                      className={`input ${errors.boardingPoint ? 'border-red-500' : ''}`}
                      placeholder="Enter boarding point"
                    />
                    {errors.boardingPoint && <p className="text-red-500 text-xs mt-1">{errors.boardingPoint}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transport Status</label>
                      <select
                        value={transportData.transportStatus}
                        onChange={(e) => setTransportData({ ...transportData, transportStatus: e.target.value })}
                        className="input"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                      <select
                        value={transportData.paymentStatus}
                        onChange={(e) => setTransportData({ ...transportData, paymentStatus: e.target.value })}
                        className="input"
                      >
                        <option value="current">Current</option>
                        <option value="overdue">Overdue</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  </div>
                </>
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
                  onClick={handleClose}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveStudent}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Add Student</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default EnhancedAddStudentModal;