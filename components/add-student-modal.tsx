'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, User, GraduationCap, Mail, Phone, Building, MapPin, CreditCard, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { routesData } from '@/data/admin-data';

const AddStudentModal = ({ isOpen, onClose, onSave }: any) => {
  const [formData, setFormData] = useState({
    studentName: '',
    rollNumber: '',
    email: '',
    mobile: '',
    department: '',
    program: '',
    boardingPoint: '',
    allocatedRoute: '',
    transportStatus: 'active',
    paymentStatus: 'current'
  });

  const [errors, setErrors] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const departments = [
    'Computer Science',
    'Electronics and Communication',
    'Mechanical Engineering',
    'Civil Engineering',
    'Electrical Engineering',
    'Information Technology'
  ];

  const programs = [
    'Bachelor of Technology',
    'Master of Technology',
    'Bachelor of Engineering',
    'Master of Engineering'
  ];

  const validateForm = () => {
    const newErrors: any = {};
    
    if (!formData.studentName.trim()) newErrors.studentName = 'Student name is required';
    if (!formData.rollNumber.trim()) newErrors.rollNumber = 'Roll number is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.mobile.trim()) newErrors.mobile = 'Mobile number is required';
    else if (!/^\+?[1-9]\d{9,14}$/.test(formData.mobile)) newErrors.mobile = 'Invalid mobile format';
    if (!formData.department) newErrors.department = 'Department is required';
    if (!formData.program) newErrors.program = 'Program is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    
    try {
      const newStudent = {
        id: `student_${Date.now()}`,
        studentName: formData.studentName,
        rollNumber: formData.rollNumber,
        email: formData.email,
        mobile: formData.mobile,
        department: { id: 'dept_new', departmentName: formData.department },
        program: { id: 'prog_new', programName: formData.program, degreeName: 'B.Tech' },
        institution: { id: 'inst_1', name: 'JKKN College of Engineering' },
        transportProfile: formData.allocatedRoute ? {
          id: `tp_${Date.now()}`,
          studentId: `student_${Date.now()}`,
          allocatedRoutes: [formData.allocatedRoute],
          boardingPoint: formData.boardingPoint,
          transportStatus: formData.transportStatus as any,
          paymentStatus: formData.paymentStatus as any,
          totalFines: 0,
          outstandingAmount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        } : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await onSave(newStudent);
      handleClose();
    } catch (error) {
      console.error('Error saving student:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      studentName: '',
      rollNumber: '',
      email: '',
      mobile: '',
      department: '',
      program: '',
      boardingPoint: '',
      allocatedRoute: '',
      transportStatus: 'active',
      paymentStatus: 'current'
    });
    setErrors({});
    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden"
      >
        {/* Enhanced Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-purple-700 px-6 py-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Add New Student</h2>
                <p className="text-blue-100 text-sm">Fill in the student details below</p>
              </div>
            </div>
            <button 
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Personal Information Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
              <GraduationCap className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Student Name *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.studentName}
                    onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                    className={`input ${errors.studentName ? 'input-error' : ''}`}
                    placeholder="Enter student name"
                    disabled={isSubmitting}
                  />
                  {errors.studentName && (
                    <div className="flex items-center mt-1 text-red-600">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      <p className="text-xs">{errors.studentName}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Roll Number *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.rollNumber}
                    onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                    className={`input ${errors.rollNumber ? 'input-error' : ''}`}
                    placeholder="Enter roll number"
                    disabled={isSubmitting}
                  />
                  {errors.rollNumber && (
                    <div className="flex items-center mt-1 text-red-600">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      <p className="text-xs">{errors.rollNumber}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`input pl-10 ${errors.email ? 'input-error' : ''}`}
                    placeholder="Enter email address"
                    disabled={isSubmitting}
                  />
                  {errors.email && (
                    <div className="flex items-center mt-1 text-red-600">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      <p className="text-xs">{errors.email}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mobile Number *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className={`input pl-10 ${errors.mobile ? 'input-error' : ''}`}
                    placeholder="+91 9876543210"
                    disabled={isSubmitting}
                  />
                  {errors.mobile && (
                    <div className="flex items-center mt-1 text-red-600">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      <p className="text-xs">{errors.mobile}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Academic Information Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
              <Building className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Academic Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department *
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className={`input ${errors.department ? 'input-error' : ''}`}
                  disabled={isSubmitting}
                >
                  <option value="">Select Department</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                {errors.department && (
                  <div className="flex items-center mt-1 text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    <p className="text-xs">{errors.department}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Program *
                </label>
                <select
                  value={formData.program}
                  onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                  className={`input ${errors.program ? 'input-error' : ''}`}
                  disabled={isSubmitting}
                >
                  <option value="">Select Program</option>
                  {programs.map(program => (
                    <option key={program} value={program}>{program}</option>
                  ))}
                </select>
                {errors.program && (
                  <div className="flex items-center mt-1 text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    <p className="text-xs">{errors.program}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Transport Information Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
              <MapPin className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Transport Information</h3>
              <span className="text-sm text-gray-500">(Optional)</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Allocated Route
                </label>
                <select
                  value={formData.allocatedRoute}
                  onChange={(e) => setFormData({ ...formData, allocatedRoute: e.target.value })}
                  className="input"
                  disabled={isSubmitting}
                >
                  <option value="">No transport required</option>
                  {routesData.map(route => (
                    <option key={route.id} value={route.id}>
                      {route.routeNumber} - {route.routeName}
                    </option>
                  ))}
                </select>
              </div>

              {formData.allocatedRoute && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Boarding Point
                  </label>
                  <input
                    type="text"
                    value={formData.boardingPoint}
                    onChange={(e) => setFormData({ ...formData, boardingPoint: e.target.value })}
                    className="input"
                    placeholder="Enter boarding point"
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </div>

            {formData.allocatedRoute && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transport Status
                  </label>
                  <select
                    value={formData.transportStatus}
                    onChange={(e) => setFormData({ ...formData, transportStatus: e.target.value })}
                    className="input"
                    disabled={isSubmitting}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Status
                  </label>
                  <select
                    value={formData.paymentStatus}
                    onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                    className="input"
                    disabled={isSubmitting}
                  >
                    <option value="current">Current</option>
                    <option value="overdue">Overdue</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="btn-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary min-w-[120px] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Add Student
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddStudentModal; 