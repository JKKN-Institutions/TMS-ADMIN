'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Users,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  Eye,
  Mail,
  Phone,
  BookOpen,
  MapPin,
  Calendar,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  X,
  Check,
  Save,
  Bus,
  Clock,
  User,
  GraduationCap,
  Home,
  Heart,
  Route,
  Navigation
} from 'lucide-react';
import StudentLocationDisplay from '@/components/student-location-display';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';
import UniversalStatCard from '@/components/universal-stat-card';
import { createStudentStats, safeNumber } from '@/lib/stat-utils';
import { EnhancedAddStudentModal } from './components/EnhancedAddStudentModal';

// ViewStudentModal Component
const ViewStudentModal = ({ isOpen, onClose, student }: any) => {
  const [routeData, setRouteData] = useState<any>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [showLocationTracking, setShowLocationTracking] = useState(false);



  // Fetch route data when student has transport assignment
  useEffect(() => {
    const fetchRouteData = async () => {
      if (!student) {
        setRouteData(null);
        return;
      }

      const transportProfile = student.student_transport_profiles && student.student_transport_profiles.length > 0 
        ? student.student_transport_profiles[0] : null;
      
      if (transportProfile?.allocated_route_id || student.allocated_route_id) {
        try {
          setRouteLoading(true);
          const routeId = transportProfile?.allocated_route_id || student.allocated_route_id;
          const route = await DatabaseService.getRouteById(routeId);
          setRouteData(route);
        } catch (error) {
          console.error('Error fetching route data:', error);
          setRouteData(null);
        } finally {
          setRouteLoading(false);
        }
      } else {
        setRouteData(null);
      }
    };

    if (isOpen && student) {
      fetchRouteData();
    } else {
      setRouteData(null);
      setRouteLoading(false);
      setShowLocationTracking(false);
    }
  }, [isOpen, student]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not provided';
    try {
      return new Date(dateString).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusBadge = (status: string, type: 'transport' | 'payment' | 'enrollment') => {
    const baseClasses = 'px-3 py-1 rounded-full text-sm font-medium';
    
    if (type === 'enrollment') {
      return status === 'enrolled' 
        ? `${baseClasses} bg-green-100 text-green-800`
        : `${baseClasses} bg-purple-100 text-purple-800`;
    }
    
    if (type === 'transport') {
      switch (status?.toLowerCase()) {
        case 'active': return `${baseClasses} bg-green-100 text-green-800`;
        case 'inactive': return `${baseClasses} bg-yellow-100 text-yellow-800`;
        case 'suspended': return `${baseClasses} bg-red-100 text-red-800`;
        default: return `${baseClasses} bg-gray-100 text-gray-800`;
      }
    }
    
    if (type === 'payment') {
      switch (status?.toLowerCase()) {
        case 'current': return `${baseClasses} bg-green-100 text-green-800`;
        case 'overdue': return `${baseClasses} bg-red-100 text-red-800`;
        case 'suspended': return `${baseClasses} bg-gray-100 text-gray-800`;
        default: return `${baseClasses} bg-gray-100 text-gray-800`;
      }
    }
    
    return `${baseClasses} bg-gray-100 text-gray-800`;
  };

  const transportProfile = student?.student_transport_profiles && student.student_transport_profiles.length > 0 
    ? student.student_transport_profiles[0] : null;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{student?.student_name}</h2>
              <p className="text-gray-600">{student?.roll_number}</p>
              <div className="flex items-center space-x-2 mt-2">
                <span className={getStatusBadge(student?._enrollmentStatus, 'enrollment')}>
                  {student?._enrollmentStatus === 'enrolled' ? 'Enrolled' : 'Available'}
                </span>
                {student?._enrollmentStatus === 'enrolled' && transportProfile && (
                  <>
                    <span className={getStatusBadge(transportProfile.transport_status, 'transport')}>
                      {transportProfile.transport_status}
                    </span>
                    <span className={getStatusBadge(transportProfile.payment_status, 'payment')}>
                      {transportProfile.payment_status}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Personal Information */}
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-4">
                  <User className="w-5 h-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Full Name</span>
                    <span className="text-sm text-gray-900">{student?.student_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Roll Number</span>
                    <span className="text-sm text-gray-900">{student?.roll_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Email</span>
                    <span className="text-sm text-gray-900">{student?.student_email || student?.college_email || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Mobile</span>
                    <span className="text-sm text-gray-900">{student?.student_mobile || 'N/A'}</span>
                  </div>
                  {student?.date_of_birth && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Date of Birth</span>
                      <span className="text-sm text-gray-900">{formatDate(student.date_of_birth)}</span>
                    </div>
                  )}
                  {student?.gender && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Gender</span>
                      <span className="text-sm text-gray-900 capitalize">{student.gender}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Academic Information */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-4">
                  <GraduationCap className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Academic Information</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Institution</span>
                    <span className="text-sm text-gray-900">{student?.institution?.name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Department</span>
                    <span className="text-sm text-gray-900">{student?.department?.department_name || 'N/A'}</span>
                  </div>
                  {student?.program?.program_name && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Program</span>
                      <span className="text-sm text-gray-900">{student.program.program_name}</span>
                    </div>
                  )}
                  {student?.degree?.degree_name && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Degree</span>
                      <span className="text-sm text-gray-900">{student.degree.degree_name}</span>
                    </div>
                  )}
                  {student?.is_profile_complete !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Profile Status</span>
                      <span className={`text-sm font-medium ${student.is_profile_complete ? 'text-green-600' : 'text-yellow-600'}`}>
                        {student.is_profile_complete ? 'Complete' : 'Incomplete'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Family Information */}
              {(student?.father_name || student?.mother_name || student?.emergency_contact_name) && (
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <Heart className="w-5 h-5 text-orange-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Family Information</h3>
                  </div>
                  <div className="space-y-3">
                    {student?.father_name && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Father's Name</span>
                        <span className="text-sm text-gray-900">{student.father_name}</span>
                      </div>
                    )}
                    {student?.father_mobile && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Father's Mobile</span>
                        <span className="text-sm text-gray-900">{student.father_mobile}</span>
                      </div>
                    )}
                    {student?.mother_name && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Mother's Name</span>
                        <span className="text-sm text-gray-900">{student.mother_name}</span>
                      </div>
                    )}
                    {student?.mother_mobile && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Mother's Mobile</span>
                        <span className="text-sm text-gray-900">{student.mother_mobile}</span>
                      </div>
                    )}
                    
                    {/* Emergency Contact - Highlighted Section */}
                    {(student?.emergency_contact_name || student?.emergency_contact_phone) && (
                      <div className="mt-4 pt-3 border-t border-orange-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <Phone className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-semibold text-red-700">Emergency Contact</span>
                        </div>
                        {student?.emergency_contact_name && (
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-500">Contact Name</span>
                            <span className="text-sm font-semibold text-red-700">{student.emergency_contact_name}</span>
                          </div>
                        )}
                        {student?.emergency_contact_phone && (
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-500">Contact Phone</span>
                            <span className="text-sm font-semibold text-red-700">{student.emergency_contact_phone}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Transport & Address Information */}
            <div className="space-y-6">
              {/* Transport Information */}
              {student?._enrollmentStatus === 'enrolled' && transportProfile ? (
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <Bus className="w-5 h-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Transport Information</h3>
                  </div>
                  <div className="space-y-3">
                    {routeData && (
                      <div className="bg-blue-100 rounded-lg p-3 mb-3">
                        <div className="flex items-center space-x-2 mb-2">
                          <Route className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-blue-800">Assigned Route</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-blue-700">Route Number</span>
                            <span className="text-sm font-bold text-blue-900">{routeData.route_number || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-blue-700">Route Name</span>
                            <span className="text-sm text-blue-900">{routeData.route_name || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-blue-700">Route</span>
                            <span className="text-sm text-blue-900">{routeData.start_location} → {routeData.end_location}</span>
                          </div>
                          {routeData.driver && (
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-blue-700">Driver</span>
                              <span className="text-sm text-blue-900">{routeData.driver.name}</span>
                            </div>
                          )}
                          {routeData.vehicle && (
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-blue-700">Vehicle</span>
                              <span className="text-sm text-blue-900">{routeData.vehicle.registration_number}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {routeLoading && (
                      <div className="bg-blue-50 rounded-lg p-3 mb-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 border border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                          <span className="text-sm text-blue-600">Loading route information...</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Transport Status</span>
                      <span className={getStatusBadge(transportProfile.transport_status, 'transport')}>
                        {transportProfile.transport_status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Payment Status</span>
                      <span className={getStatusBadge(transportProfile.payment_status, 'payment')}>
                        {transportProfile.payment_status}
                      </span>
                    </div>
                    {transportProfile.boarding_point && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Boarding Point</span>
                        <span className="text-sm text-gray-900">{transportProfile.boarding_point}</span>
                      </div>
                    )}
                    {transportProfile.outstanding_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Outstanding Amount</span>
                        <span className="text-sm font-medium text-red-600">₹{transportProfile.outstanding_amount}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <Bus className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Transport Status</h3>
                  </div>
                  <div className="text-center py-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-purple-600" />
                    </div>
                    <p className="text-sm text-purple-800 font-medium">Not Enrolled in Transport</p>
                    <p className="text-xs text-purple-600 mt-1">Student is available for transport enrollment</p>
                  </div>
                </div>
              )}

              {/* Address Information */}
              {student?.address && (student.address.street || student.address.district || student.address.state) && (
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <Home className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Address Information</h3>
                  </div>
                  <div className="space-y-3">
                    {student?.address.street && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Street</span>
                        <span className="text-sm text-gray-900">{student.address.street}</span>
                      </div>
                    )}
                    {student?.address.district && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">District</span>
                        <span className="text-sm text-gray-900">{student.address.district}</span>
                      </div>
                    )}
                    {student?.address.state && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">State</span>
                        <span className="text-sm text-gray-900">{student.address.state}</span>
                      </div>
                    )}
                    {student?.address.pinCode && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">PIN Code</span>
                        <span className="text-sm text-gray-900">{student.address.pinCode}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* System Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Clock className="w-5 h-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">System Information</h3>
                </div>
                <div className="space-y-3">
                  {student?.external_id && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">External ID</span>
                      <span className="text-sm text-gray-900">{student.external_id}</span>
                    </div>
                  )}
                  {student?.created_at && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Enrolled On</span>
                      <span className="text-sm text-gray-900">{formatDate(student.created_at)}</span>
                    </div>
                  )}
                  {student?.updated_at && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">Last Updated</span>
                      <span className="text-sm text-gray-900">{formatDate(student.updated_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Location Tracking Section */}
          <div className="mt-6">
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Location Tracking</h3>
              </div>
              <button
                onClick={() => setShowLocationTracking(!showLocationTracking)}
                className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-medium hover:bg-blue-200 transition-colors flex items-center space-x-2"
              >
                <Navigation className="w-4 h-4" />
                <span>Live Track</span>
              </button>
            </div>
            
            {showLocationTracking && (
              <StudentLocationDisplay
                studentId={student?.external_id || student?.id}
                studentName={student?.student_name}
                isVisible={isOpen}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// Enhanced Add Student Modal with multi-step process
// Edit Student Modal for updating transport details
const EditStudentModal = ({ isOpen, onClose, onSave, student }: any) => {
  const [routesData, setRoutesData] = useState<any[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [selectedRouteStops, setSelectedRouteStops] = useState<any[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<any>({});
  
  // Transport details form - initialize with current student data
  const [transportData, setTransportData] = useState({
    allocated_route_id: '',
    boarding_point: '',
    transport_status: 'active',
    payment_status: 'current'
  });

  // Initialize form data when student changes
  useEffect(() => {
    if (student && student.student_transport_profiles?.[0]) {
      const profile = student.student_transport_profiles[0];
      setTransportData({
        allocated_route_id: profile.allocated_route_id || '',
        boarding_point: profile.boarding_point || '',
        transport_status: profile.transport_status || 'active',
        payment_status: profile.payment_status || 'current'
      });
      
      // Fetch stops for current route
      if (profile.allocated_route_id) {
        fetchRouteStops(profile.allocated_route_id);
      }
    }
  }, [student]);

  // Fetch routes when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchRoutes();
    }
  }, [isOpen]);

  const fetchRoutes = async () => {
    try {
      setRoutesLoading(true);
      
      // Fetch routes using API route
      const response = await fetch('/api/admin/routes');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch routes');
      }
      
      setRoutesData(result.data || []);
    } catch (error) {
      console.error('Error fetching routes:', error);
      setRoutesData([]);
    } finally {
      setRoutesLoading(false);
    }
  };

  // Fetch stops for a specific route
  const fetchRouteStops = async (routeId: string) => {
    if (!routeId) {
      setSelectedRouteStops([]);
      return;
    }

    try {
      setStopsLoading(true);
      console.log('Fetching stops for route:', routeId);
      
      const route = await DatabaseService.getRouteById(routeId);
      
      if (route && route.stops && Array.isArray(route.stops) && route.stops.length > 0) {
        // Sort stops by sequence_order or sequence_number
        const sortedStops = route.stops.sort((a: any, b: any) => 
          (a.sequence_order || a.sequence_number || 0) - (b.sequence_order || b.sequence_number || 0)
        );
        setSelectedRouteStops(sortedStops);
        console.log(`Loaded ${sortedStops.length} stops for route ${routeId}`);
      } else {
        console.log(`No stops found for route ${routeId}`);
        setSelectedRouteStops([]);
      }
    } catch (error) {
      console.error('Error fetching route stops:', error);
      setSelectedRouteStops([]);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load route stops: ${errorMessage}`);
    } finally {
      setStopsLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: any = {};
    
    if (!transportData.allocated_route_id) {
      newErrors.allocated_route_id = 'Please select a route';
    }
    
    if (transportData.allocated_route_id && !transportData.boarding_point.trim()) {
      newErrors.boarding_point = 'Please select a boarding point';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      await onSave(transportData);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setTransportData({
      allocated_route_id: '',
      boarding_point: '',
      transport_status: 'active',
      payment_status: 'current'
    });
    setErrors({});
    setSelectedRouteStops([]);
    setStopsLoading(false);
    onClose();
  };

  if (!isOpen || !student) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Student Transport</h2>
            <p className="text-gray-600">{student.student_name} - {student.roll_number}</p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Route Assignment</label>
            <select
              value={transportData.allocated_route_id}
              onChange={(e) => {
                const routeId = e.target.value;
                setTransportData({ ...transportData, allocated_route_id: routeId, boarding_point: '' });
                fetchRouteStops(routeId);
              }}
              className={`input ${errors.allocated_route_id ? 'border-red-500' : ''}`}
            >
              <option value="">Select a route</option>
              {routesLoading ? (
                <option disabled>Loading routes...</option>
              ) : (
                routesData.filter(route => route.status === 'active').map(route => (
                  <option key={route.id} value={route.id}>
                    {route.route_number} - {route.route_name}
                  </option>
                ))
              )}
            </select>
            {errors.allocated_route_id && <p className="text-red-500 text-xs mt-1">{errors.allocated_route_id}</p>}
          </div>

          {transportData.allocated_route_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Boarding Point</label>
              <select
                value={transportData.boarding_point}
                onChange={(e) => setTransportData({ ...transportData, boarding_point: e.target.value })}
                className={`input ${errors.boarding_point ? 'border-red-500' : ''}`}
                disabled={stopsLoading || selectedRouteStops.length === 0}
              >
                <option value="">
                  {stopsLoading ? 'Loading stops...' : 
                   selectedRouteStops.length === 0 ? 'No stops available' : 
                   'Select boarding point'}
                </option>
                {selectedRouteStops.map((stop: any) => (
                  <option key={stop.id} value={stop.stop_name}>
                    {stop.stop_name}
                    {stop.stop_time && ` (${stop.stop_time})`}
                    {stop.is_major_stop && ' ★'}
                  </option>
                ))}
              </select>
              {errors.boarding_point && <p className="text-red-500 text-xs mt-1">{errors.boarding_point}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transport Status</label>
              <select
                value={transportData.transport_status}
                onChange={(e) => setTransportData({ ...transportData, transport_status: e.target.value })}
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
                value={transportData.payment_status}
                onChange={(e) => setTransportData({ ...transportData, payment_status: e.target.value })}
                className="input"
              >
                <option value="current">Current</option>
                <option value="overdue">Overdue</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t">
          <button
            onClick={handleClose}
            className="btn-secondary"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="btn-primary flex items-center space-x-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Updating...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Update Student</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// Old AddStudentModal removed - using EnhancedAddStudentModal instead

const OldAddStudentModal = ({ isOpen, onClose, onSave, selectedStudent }: any) => {
  const [step, setStep] = useState(1); // 1: Email Fetch, 2: Confirmation, 3: Transport Details
  const [fetchedStudent, setFetchedStudent] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [routesData, setRoutesData] = useState<any[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [selectedRouteStops, setSelectedRouteStops] = useState<any[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  
  // Transport details form
  const [transportData, setTransportData] = useState({
    allocatedRoute: '',
    boardingPoint: '',
    transportStatus: 'active',
    paymentStatus: 'current'
  });

  const [errors, setErrors] = useState<any>({});

  // Handle pre-selected student (available student being enrolled)
  useEffect(() => {
    if (isOpen && selectedStudent) {
      // Pre-fill with available student data and skip to transport step
      setFetchedStudent({
        id: selectedStudent.external_id,
        name: selectedStudent.student_name,
        email: selectedStudent.student_email || selectedStudent.college_email,
        phone: selectedStudent.student_mobile,
        department: selectedStudent.department?.department_name,
        institute: selectedStudent.institution?.name,
        rollNumber: selectedStudent.roll_number,
        fatherName: selectedStudent.father_name,
        motherName: selectedStudent.mother_name,
        dateOfBirth: selectedStudent.date_of_birth,
        gender: selectedStudent.gender,
        program: selectedStudent.program?.program_name,
        degree: selectedStudent.degree?.degree_name,
        address: selectedStudent.address,
        isProfileComplete: selectedStudent.is_profile_complete
      });
      setStep(3); // Skip directly to transport assignment
    } else if (isOpen) {
      // Reset for new student search
      setStep(1);
      setFetchedStudent(null);
      setEmail('');
    }
  }, [isOpen, selectedStudent]);

  // Fetch routes when modal opens and set appropriate step
  useEffect(() => {
    if (isOpen) {
      fetchRoutes();
      console.log('🔍 Modal opened with selectedStudent:', selectedStudent);
      console.log('🔍 selectedStudent mobile data:', {
        father_name: selectedStudent?.father_name,
        father_mobile: selectedStudent?.father_mobile,
        mother_name: selectedStudent?.mother_name,
        mother_mobile: selectedStudent?.mother_mobile
      });
      // If there's a selectedStudent, skip to step 3 (transport assignment)
      if (selectedStudent) {
        console.log('🔍 Going to step 3 for pre-selected student');
        setStep(3);
      } else {
        console.log('🔍 Going to step 1 for manual entry');
        setStep(1);
      }
    }
  }, [isOpen, selectedStudent]);

  const fetchRoutes = async () => {
    try {
      setRoutesLoading(true);
      
      // Fetch routes using API route
      const response = await fetch('/api/admin/routes');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch routes');
      }
      
      setRoutesData(result.data || []);
    } catch (error) {
      console.error('Error fetching routes:', error);
      setRoutesData([]);
    } finally {
      setRoutesLoading(false);
    }
  };

  // Fetch stops for a specific route
  const fetchRouteStops = async (routeId: string) => {
    if (!routeId) {
      setSelectedRouteStops([]);
      return;
    }

    try {
      setStopsLoading(true);
      console.log('Fetching stops for route:', routeId);
      
      const route = await DatabaseService.getRouteById(routeId);
      
      if (route && route.stops && Array.isArray(route.stops) && route.stops.length > 0) {
        // Sort stops by sequence_order or sequence_number
        const sortedStops = route.stops.sort((a: any, b: any) => 
          (a.sequence_order || a.sequence_number || 0) - (b.sequence_order || b.sequence_number || 0)
        );
        setSelectedRouteStops(sortedStops);
        console.log(`Loaded ${sortedStops.length} stops for route ${routeId}`);
      } else {
        console.log(`No stops found for route ${routeId}`);
        setSelectedRouteStops([]);
        toast.success('No stops configured for this route');
      }
    } catch (error) {
      console.error('Error fetching route stops:', error);
      setSelectedRouteStops([]);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load route stops: ${errorMessage}`);
    } finally {
      setStopsLoading(false);
    }
  };

  // Get available routes with capacity
  const getAvailableRoutes = () => {
    return routesData.filter(route => 
      route.status === 'active' && route.current_passengers < route.total_capacity
    );
  };

  // Get available buses for route allocation
  const getRouteAvailability = (routeId: string) => {
    const route = routesData.find(r => r.id === routeId);
    if (!route) return { available: false, remaining: 0 };
    
    const remaining = route.total_capacity - route.current_passengers;
    return { available: remaining > 0, remaining };
  };

  // Fetch student from external myjkkn API via proxy
  const fetchStudentByEmail = async () => {
    setIsLoading(true);
    setErrors({});
    
    try {
      console.log('🔍 Fetching student details for email from external API via proxy:', email);
      
      // Use the new API proxy instead of direct external API call
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
      console.log('🔍 API Proxy raw student data:', searchData.data);
      
      if (!searchData.success || !searchData.data) {
        throw new Error('Invalid response format from API proxy');
      }
      
      const matchedStudent = searchData.data;
      console.log('✅ Found matching student via proxy:', matchedStudent);
      console.log('🔍 Debug father_mobile from API:', matchedStudent.father_mobile);
      console.log('🔍 Debug mother_mobile from API:', matchedStudent.mother_mobile);
      console.log('🔍 Debug ALL fields from API:', Object.keys(matchedStudent));
      console.log('🔍 Debug student_name from API:', matchedStudent.student_name);
      console.log('🔍 Debug roll_number from API:', matchedStudent.roll_number);
      console.log('🔍 Debug student_email from API:', matchedStudent.student_email);
      console.log('🔍 Debug COMPLETE API object:', JSON.stringify(matchedStudent, null, 2));
      
            // Updated mapping for new external API schema
      const finalStudentData = {
        id: matchedStudent.id,
        // Combine first_name and last_name for student_name
        student_name: matchedStudent.first_name && matchedStudent.last_name 
          ? `${matchedStudent.first_name} ${matchedStudent.last_name}`.trim()
          : matchedStudent.first_name || 'Unknown Student',
        first_name: matchedStudent.first_name || '',
        last_name: matchedStudent.last_name || '',
        student_email: matchedStudent.student_email || matchedStudent.college_email || email,
        college_email: matchedStudent.college_email || matchedStudent.student_email || email,
        student_mobile: matchedStudent.student_mobile || matchedStudent.father_mobile || matchedStudent.mother_mobile || 'Not provided',
        // Handle nested objects from new schema
        department_name: matchedStudent.department?.department_name || 'Unknown Department',
        institution_name: matchedStudent.institution?.name || 'Unknown Institution',
        program_name: matchedStudent.program?.program_name || '',
        degree_name: matchedStudent.degree?.degree_name || '',
        roll_number: matchedStudent.roll_number || `STU${Date.now().toString().slice(-6)}`,
        // Parent information
        father_name: matchedStudent.father_name || '',
        mother_name: matchedStudent.mother_name || '',
        father_mobile: matchedStudent.father_mobile || '',
        mother_mobile: matchedStudent.mother_mobile || '',
        father_occupation: matchedStudent.father_occupation || '',
        mother_occupation: matchedStudent.mother_occupation || '',
        // Personal details
        date_of_birth: matchedStudent.date_of_birth || '',
        gender: matchedStudent.gender || '',
        religion: matchedStudent.religion || '',
        community: matchedStudent.community || '',
        caste: matchedStudent.caste || '',
        annual_income: matchedStudent.annual_income || '',
        // Academic details
        admission_id: matchedStudent.admission_id,
        application_id: matchedStudent.application_id,
        semester_id: matchedStudent.semester_id || '',
        section_id: matchedStudent.section_id || '',
        academic_year_id: matchedStudent.academic_year_id || '',
        entry_type: matchedStudent.entry_type || '',
        last_school: matchedStudent.last_school || '',
        board_of_study: matchedStudent.board_of_study || '',
        tenth_marks: matchedStudent.tenth_marks || {},
        twelfth_marks: matchedStudent.twelfth_marks || {},
        // Address information
        permanent_address_street: matchedStudent.permanent_address_street || '',
        permanent_address_taluk: matchedStudent.permanent_address_taluk || '',
        permanent_address_district: matchedStudent.permanent_address_district || '',
        permanent_address_state: matchedStudent.permanent_address_state || '',
        permanent_address_pin_code: matchedStudent.permanent_address_pin_code || '',
        // Transport related
        bus_required: matchedStudent.bus_required || false,
        bus_route: matchedStudent.bus_route || '',
        bus_pickup_location: matchedStudent.bus_pickup_location || '',
        // Other details
        accommodation_type: matchedStudent.accommodation_type || '',
        hostel_type: matchedStudent.hostel_type || '',
        student_photo_url: matchedStudent.student_photo_url,
        is_profile_complete: matchedStudent.is_profile_complete || false,
        status: matchedStudent.status || 'active',
        created_at: matchedStudent.created_at,
        updated_at: matchedStudent.updated_at
      };
      
      console.log('🔍 Final fetchedStudent object being set:', finalStudentData);
      console.log('🔍 Critical fields mapping check:', {
        student_name: finalStudentData.student_name,
        roll_number: finalStudentData.roll_number,
        student_email: finalStudentData.student_email,
        student_mobile: finalStudentData.student_mobile,
        father_name: finalStudentData.father_name,
        father_mobile: finalStudentData.father_mobile,
        mother_name: finalStudentData.mother_name,
        mother_mobile: finalStudentData.mother_mobile
      });
      
      setFetchedStudent(finalStudentData);
      setStep(2);
      toast.success('Student details fetched successfully!');
      
    } catch (error) {
      console.error('❌ Error fetching student details from API proxy:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (errorMessage.includes('API Proxy error: 401') || errorMessage.includes('unauthorized')) {
        setErrors({ email: 'Authentication failed with external API. Please contact administrator.' });
        toast.error('API authentication error. Please contact your administrator.');
      } else if (errorMessage.includes('API Proxy error: 403') || errorMessage.includes('forbidden')) {
        setErrors({ email: 'Access denied to external API. Please contact administrator.' });
        toast.error('API access denied. Please contact your administrator.');
      } else if (errorMessage.includes('API Proxy error: 404')) {
        setErrors({ email: 'Student not found with this email address.' });
        toast.error('Student not found. Please check the email address.');
      } else if (errorMessage.includes('API Proxy error: 500')) {
        setErrors({ email: 'External API server error. Please try again later.' });
        toast.error('External server error. Please try again later.');
      } else if (errorMessage.includes('NetworkError') || errorMessage.includes('fetch')) {
        setErrors({ email: 'Network error. Please check your internet connection.' });
        toast.error('Network error. Please check your internet connection and try again.');
      } else {
        setErrors({ email: `Error fetching from external API: ${errorMessage}` });
        toast.error('Error fetching student details from external database. Please try again.');
      }
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
        newErrors.boardingPoint = 'Please select a boarding point from the available stops';
      } else {
        // Validate that the selected boarding point exists in the route stops
        const validStop = selectedRouteStops.find((stop: any) => 
          stop.stop_name === transportData.boardingPoint
        );
        if (!validStop && selectedRouteStops.length > 0) {
          newErrors.boardingPoint = 'Please select a valid boarding point from the dropdown';
        }
      }
      
      const availability = getRouteAvailability(transportData.allocatedRoute);
      if (!availability.available) {
        newErrors.allocatedRoute = 'Selected route is at full capacity';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveStudent = async () => {
    console.log('🔍 handleSaveStudent called');
    console.log('🔍 fetchedStudent:', fetchedStudent);
    console.log('🔍 selectedStudent:', selectedStudent);
    
    // Determine which student source to use and prepare data accordingly
    let studentData;
    
    if (selectedStudent && selectedStudent._enrollmentStatus === 'available') {
      // Using selectedStudent from "+" icon (card click) - has snake_case fields
      console.log('🔍 Using selectedStudent from card click');
      studentData = {
        external_id: selectedStudent.external_id,
        student_name: selectedStudent.student_name,
        roll_number: selectedStudent.roll_number,
        email: selectedStudent.student_email || selectedStudent.college_email,
        mobile: selectedStudent.student_mobile,
        department_name: selectedStudent.department?.department_name || 'Unknown Department',
        institution_name: selectedStudent.institution?.name || 'Unknown Institution',
        program_name: selectedStudent.program?.program_name || '',
        degree_name: selectedStudent.degree?.degree_name || '',
        father_name: selectedStudent.father_name || '',
        mother_name: selectedStudent.mother_name || '',
        father_mobile: selectedStudent.father_mobile || '',
        mother_mobile: selectedStudent.mother_mobile || '',
        date_of_birth: selectedStudent.date_of_birth || null,
        gender: selectedStudent.gender || '',
        address_street: selectedStudent.address?.street || '',
        address_district: selectedStudent.address?.district || '',
        address_state: selectedStudent.address?.state || '',
        address_pin_code: selectedStudent.address?.pinCode || '',
        is_profile_complete: selectedStudent.is_profile_complete || false,
        // Transport assignment
        allocated_route_id: transportData.allocatedRoute,
        boarding_point: transportData.boardingPoint,
        transport_status: transportData.transportStatus,
        payment_status: transportData.paymentStatus
      };
    } else if (fetchedStudent) {
      // Using fetchedStudent from email fetch - has mixed field names
      console.log('🔍 Using fetchedStudent from email fetch');
      studentData = {
        external_id: fetchedStudent.id,
        student_name: fetchedStudent.student_name,
        roll_number: fetchedStudent.roll_number,
        email: fetchedStudent.student_email || fetchedStudent.college_email,
        mobile: fetchedStudent.student_mobile,
        department_name: fetchedStudent.department_name,
        institution_name: fetchedStudent.institution_name,
        program_name: fetchedStudent.program_name || '',
        degree_name: fetchedStudent.degree_name || '',
        father_name: fetchedStudent.father_name || '',
        mother_name: fetchedStudent.mother_name || '',
        father_mobile: fetchedStudent.father_mobile || '',
        mother_mobile: fetchedStudent.mother_mobile || '',
        date_of_birth: fetchedStudent.date_of_birth || null,
        gender: fetchedStudent.gender || '',
        address_street: fetchedStudent.permanent_address_street || '',
        address_district: fetchedStudent.permanent_address_district || '',
        address_state: fetchedStudent.permanent_address_state || '',
        address_pin_code: fetchedStudent.permanent_address_pin_code || '',
        is_profile_complete: fetchedStudent.is_profile_complete || false,
        // Transport assignment
        allocated_route_id: transportData.allocatedRoute,
        boarding_point: transportData.boardingPoint,
        transport_status: transportData.transportStatus,
        payment_status: transportData.paymentStatus
      };
    } else {
      console.log('❌ No student data available to save');
      toast.error('No student data available to save');
      return;
    }
    
    // Only save students who have transport assignments
    if (!transportData.allocatedRoute) {
      toast.error('Please assign a route to save the student to the database');
      return;
    }
    
    if (!validateTransportData()) {
      return;
    }

    try {
      setIsLoading(true);
      
      console.log('🔍 Final studentData for database:', studentData);

      console.log('Student data being saved:', studentData);
      console.log('🔍 Debug mobile numbers being sent to DB:', {
        father_name: studentData.father_name,
        father_mobile: studentData.father_mobile,
        mother_name: studentData.mother_name,
        mother_mobile: studentData.mother_mobile
      });
      console.log('🔍 Debug all student fields being sent to DB:', {
        student_name: studentData.student_name,
        roll_number: studentData.roll_number,
        email: studentData.email,
        mobile: studentData.mobile,
        department_name: studentData.department_name,
        institution_name: studentData.institution_name
      });
      
      // Save to database
      const savedStudent = await DatabaseService.addStudent(studentData);
      
      // Update route capacity (increment current passengers)
      const selectedRoute = routesData.find(r => r.id === transportData.allocatedRoute);
      if (selectedRoute) {
        selectedRoute.current_passengers = (selectedRoute.current_passengers || 0) + 1;
      }

      // Create display format for UI
      const displayStudent = {
        id: savedStudent.id,
        student_name: savedStudent.student_name,
        roll_number: savedStudent.roll_number,
        student_email: savedStudent.email,
        student_mobile: savedStudent.mobile,
        department: {
          department_name: savedStudent.department_name
        },
        institution: {
          name: savedStudent.institution_name
        },
        student_transport_profiles: [{
          transport_status: savedStudent.transport_status,
          payment_status: savedStudent.payment_status,
          outstanding_amount: savedStudent.outstanding_amount || 0,
          allocated_route_id: savedStudent.allocated_route_id,
          boarding_point: savedStudent.boarding_point
        }],
        created_at: savedStudent.created_at,
        updated_at: savedStudent.updated_at
      };

      onSave(displayStudent);
      toast.success(`Student ${studentData.student_name} added to transport system successfully!`);
      handleClose();
      
    } catch (error) {
      console.error('Error saving student:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to save student: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
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
    setSelectedRouteStops([]);
    setStopsLoading(false);
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
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {selectedStudent ? 'Enroll Student in Transport' : 'Add New Student'}
            </h2>
            {selectedStudent && (
              <p className="text-gray-600">{selectedStudent.student_name} - {selectedStudent.roll_number}</p>
            )}
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

        {/* Step 1: Email Fetch */}
        {step === 1 && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Fetch Student Details</h3>
              <p className="text-gray-600">Enter the student's email ID to fetch their details from the JKKN external database</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`input ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="student@jkkn.ac.in or rollnumber@students.jkkn.ac.in"
                  disabled={isLoading}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                <p className="text-xs text-gray-500 mt-1">
                  Enter a valid student email address registered in the JKKN student management system
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
                      <span>Fetch from JKKN DB</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Confirmation */}
        {step === 2 && fetchedStudent && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Confirm Student Details</h3>
              <p className="text-gray-600">Please verify the student information fetched from the main database</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-4 mb-6">
              {/* Profile Status Banner */}
              {fetchedStudent.is_profile_complete !== undefined && (
                <div className={`p-3 rounded-lg border ${
                  fetchedStudent.is_profile_complete 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                }`}>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className={`w-4 h-4 ${
                      fetchedStudent.is_profile_complete ? 'text-green-600' : 'text-yellow-600'
                    }`} />
                    <span className="text-sm font-medium">
                      Profile Status: {fetchedStudent.is_profile_complete ? 'Complete' : 'Incomplete'}
                    </span>
                  </div>
                </div>
              )}

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
                    <p className="text-gray-900">{fetchedStudent.student_email || fetchedStudent.college_email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Phone</label>
                    <p className="text-gray-900">{fetchedStudent.student_mobile}</p>
                  </div>
                  {fetchedStudent.date_of_birth && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Date of Birth</label>
                      <p className="text-gray-900">{new Date(fetchedStudent.date_of_birth).toLocaleDateString()}</p>
                    </div>
                  )}
                  {fetchedStudent.gender && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Gender</label>
                      <p className="text-gray-900">{fetchedStudent.gender}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Academic Information */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Academic Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Institute</label>
                    <p className="text-gray-900">{fetchedStudent.institution_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Department</label>
                    <p className="text-gray-900">{fetchedStudent.department_name}</p>
                  </div>
                  {fetchedStudent.program_name && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Program</label>
                      <p className="text-gray-900">{fetchedStudent.program_name}</p>
                    </div>
                  )}
                  {fetchedStudent.degree_name && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Degree</label>
                      <p className="text-gray-900">{fetchedStudent.degree_name}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Family Information */}
              {(fetchedStudent.father_name || fetchedStudent.mother_name || fetchedStudent.emergency_contact_name) && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Family Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {fetchedStudent.father_name && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Father's Name</label>
                        <p className="text-gray-900">{fetchedStudent.father_name}</p>
                        {fetchedStudent.father_mobile && (
                          <p className="text-sm text-gray-600">{fetchedStudent.father_mobile}</p>
                        )}
                      </div>
                    )}
                    {fetchedStudent.mother_name && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Mother's Name</label>
                        <p className="text-gray-900">{fetchedStudent.mother_name}</p>
                        {fetchedStudent.mother_mobile && (
                          <p className="text-sm text-gray-600">{fetchedStudent.mother_mobile}</p>
                        )}
                      </div>
                    )}
                    
                    {/* Emergency Contact - Highlighted Section */}
                    {(fetchedStudent.emergency_contact_name || fetchedStudent.emergency_contact_phone) && (
                      <div className="mt-4 pt-3 border-t border-orange-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <Phone className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-semibold text-red-700">Emergency Contact</span>
                        </div>
                        {fetchedStudent.emergency_contact_name && (
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-500">Contact Name</span>
                            <span className="text-sm font-semibold text-red-700">{fetchedStudent.emergency_contact_name}</span>
                          </div>
                        )}
                        {fetchedStudent.emergency_contact_phone && (
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-500">Contact Phone</span>
                            <span className="text-sm font-semibold text-red-700">{fetchedStudent.emergency_contact_phone}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Address Information */}
              {(fetchedStudent.permanent_address_street || fetchedStudent.permanent_address_district) && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Address Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {fetchedStudent.permanent_address_street && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Street</label>
                        <p className="text-gray-900">{fetchedStudent.permanent_address_street}</p>
                      </div>
                    )}
                    {fetchedStudent.permanent_address_district && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">District</label>
                        <p className="text-gray-900">{fetchedStudent.permanent_address_district}</p>
                      </div>
                    )}
                    {fetchedStudent.permanent_address_state && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">State</label>
                        <p className="text-gray-900">{fetchedStudent.permanent_address_state}</p>
                      </div>
                    )}
                    {fetchedStudent.permanent_address_pin_code && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">PIN Code</label>
                        <p className="text-gray-900">{fetchedStudent.permanent_address_pin_code}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
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

        {/* Step 3: Transport Details */}
        {step === 3 && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Transport Assignment</h3>
              <p className="text-gray-600">Configure transport details and bus allocation based on availability</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                <div className="flex items-start space-x-2">
                  <div className="w-5 h-5 text-blue-600 mt-0.5">
                    ℹ️
                  </div>
                  <div className="text-sm text-blue-700">
                    <strong>Note:</strong> Students are only saved to the database when they are assigned to transport services. 
                    Students without transport assignments will not be stored locally.
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Route Assignment (Optional)</label>
                <select
                  value={transportData.allocatedRoute}
                  onChange={(e) => {
                    const routeId = e.target.value;
                    setTransportData({ ...transportData, allocatedRoute: routeId, boardingPoint: '' });
                    fetchRouteStops(routeId);
                  }}
                  className={`input ${errors.allocatedRoute ? 'border-red-500' : ''}`}
                >
                  <option value="">No transport required</option>
                  {routesLoading ? (
                    <option disabled>Loading routes...</option>
                  ) : (
                    getAvailableRoutes().map(route => {
                      const availability = getRouteAvailability(route.id);
                      return (
                        <option key={route.id} value={route.id} disabled={!availability.available}>
                          {route.route_number} - {route.route_name} 
                          ({availability.remaining} seats available)
                        </option>
                      );
                    })
                  )}
                </select>
                {errors.allocatedRoute && <p className="text-red-500 text-xs mt-1">{errors.allocatedRoute}</p>}
              </div>

              {transportData.allocatedRoute && (
                <>
                  {/* Route Info */}
                  {selectedRoute && (
                    <div className="bg-blue-50 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-blue-900 mb-2">Selected Route Details</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-blue-700 font-medium">Route:</span>
                          <p className="text-blue-800">{selectedRoute.route_name}</p>
                        </div>
                        <div>
                          <span className="text-blue-700 font-medium">Vehicle:</span>
                          <p className="text-blue-800">{selectedRoute.vehicles?.vehicle_number || 'TBD'}</p>
                        </div>
                        <div>
                          <span className="text-blue-700 font-medium">Distance:</span>
                          <p className="text-blue-800">{selectedRoute.distance} km</p>
                        </div>
                        <div>
                          <span className="text-blue-700 font-medium">Available Seats:</span>
                          <p className="text-blue-800">{routeAvailability?.remaining}/{selectedRoute.total_capacity}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Boarding Point *</label>
                    <select
                      value={transportData.boardingPoint}
                      onChange={(e) => setTransportData({ ...transportData, boardingPoint: e.target.value })}
                      className={`input ${errors.boardingPoint ? 'border-red-500' : ''}`}
                      disabled={stopsLoading || selectedRouteStops.length === 0}
                    >
                      <option value="">
                        {stopsLoading ? 'Loading stops...' : 
                         selectedRouteStops.length === 0 ? 'No stops available' : 
                         'Select boarding point'}
                      </option>
                      {selectedRouteStops.map((stop: any) => (
                        <option key={stop.id} value={stop.stop_name}>
                          {stop.stop_name}
                          {stop.stop_time && ` (${stop.stop_time})`}
                          {stop.is_major_stop && ' ★'}
                        </option>
                      ))}
                    </select>
                    {errors.boardingPoint && <p className="text-red-500 text-xs mt-1">{errors.boardingPoint}</p>}
                    {selectedRouteStops.length > 0 && !stopsLoading && (
                      <div className="text-xs text-gray-500 mt-1">
                        <p>Choose from {selectedRouteStops.length} available stops on this route</p>
                        {selectedRouteStops.some((stop: any) => stop.is_major_stop) && (
                          <p className="text-blue-600 mt-1">★ Major stops available</p>
                        )}
                      </div>
                    )}
                    {stopsLoading && (
                      <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                        <div className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                        <span>Loading route stops...</span>
                      </div>
                    )}
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
                  disabled={isLoading || !transportData.allocatedRoute}
                  className={`btn-primary flex items-center space-x-2 ${
                    (!transportData.allocatedRoute || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>
                        {transportData.allocatedRoute ? 'Add to Transport System' : 'Select Route First'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const StudentCard = ({ student, onEdit, onDelete, onView, userRole }: any) => {
  const canEdit = ['super_admin', 'data_entry', 'operations_admin'].includes(userRole);
  const canDelete = userRole === 'super_admin';
  const canView = true;

  const getPaymentStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'current': return 'bg-green-100 text-green-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'suspended': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTransportStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-yellow-100 text-yellow-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{student.student_name}</h3>
            <p className="text-sm text-gray-600">{student.roll_number}</p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          {/* Enrollment Status Badge */}
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            student._enrollmentStatus === 'enrolled' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-purple-100 text-purple-800'
          }`}>
            {student._enrollmentStatus === 'enrolled' ? 'Enrolled' : 'Available'}
          </span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Mail className="w-4 h-4" />
          <span className="truncate">{student.student_email || student.college_email || 'N/A'}</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Phone className="w-4 h-4" />
          <span>{student.student_mobile || 'N/A'}</span>
        </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
          <BookOpen className="w-4 h-4" />
          <span>{student.department?.department_name || 'N/A'}</span>
          </div>
        {/* Quota Information */}
        {student.quota && (
          <div className="flex items-center space-x-2 text-sm">
            <CreditCard className="w-4 h-4 text-green-600" />
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              student.quota?.toLowerCase().includes('government') || student.quota?.toLowerCase().includes('7.5') 
                ? 'bg-green-100 text-green-800' 
                : 'bg-blue-100 text-blue-800'
            }`}>
              {student.quota}
            </span>
          </div>
        )}
      </div>

      {/* Transport Information - Show for enrolled students */}
      {student._enrollmentStatus === 'enrolled' && student.student_transport_profiles && student.student_transport_profiles.length > 0 && (
        <div className="border-t border-gray-100 pt-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">TRANSPORT STATUS</span>
            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getTransportStatusColor(student.student_transport_profiles[0].transport_status)}`}>
              {student.student_transport_profiles[0].transport_status}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">PAYMENT STATUS</span>
            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getPaymentStatusColor(student.student_transport_profiles[0].payment_status)}`}>
              {student.student_transport_profiles[0].payment_status}
            </span>
            </div>
          {student.student_transport_profiles[0].outstanding_amount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">OUTSTANDING</span>
              <span className="text-xs font-medium text-red-600">
                ₹{student.student_transport_profiles[0].outstanding_amount}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Availability Info - Show for available students */}
      {student._enrollmentStatus === 'available' && (
        <div className="border-t border-gray-100 pt-4 mb-4">
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-800">Available for Transport Enrollment</span>
            </div>
            <p className="text-xs text-purple-600 mt-1">
              Click the + button to enroll this student in transport services
            </p>
          </div>
        </div>
      )}

      <div className="flex space-x-2">
        {canView && (
        <button
          onClick={() => onView(student)}
          className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1"
        >
          <Eye className="w-4 h-4" />
            <span>View Details</span>
        </button>
        )}
        {student._enrollmentStatus === 'enrolled' && canEdit && (
          <button
            onClick={() => onEdit(student)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="Edit transport details"
          >
            <Edit className="w-4 h-4 text-gray-600" />
          </button>
        )}
        {student._enrollmentStatus === 'available' && canEdit && (
          <button
            onClick={() => onEdit(student)}
            className="px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
            title="Enroll in transport"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        {student._enrollmentStatus === 'enrolled' && canDelete && (
          <button
            onClick={() => onDelete(student)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-red-50 transition-colors"
            title="Remove from transport"
          >
            <Trash2 className="w-4 h-4 text-gray-600" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

const StudentsPage = () => {
  const [user, setUser] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [enrollmentFilter, setEnrollmentFilter] = useState('all');
  // New comprehensive filters
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [academicYearFilter, setAcademicYearFilter] = useState('all');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAvailableStudent, setSelectedAvailableStudent] = useState<any>(null);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const studentsPerPage = 100;
  
  // Filter options state
  const [uniqueDepartments, setUniqueDepartments] = useState<string[]>([]);
  const [uniqueRoutes, setUniqueRoutes] = useState<any[]>([]);
  const [uniqueAcademicYears, setUniqueAcademicYears] = useState<string[]>([]);
  const [uniqueSemesters, setUniqueSemesters] = useState<number[]>([]);
  
  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  useEffect(() => {
    fetchStudents();
    
    // Handle URL parameters from dashboard
    const urlParams = new URLSearchParams(window.location.search);
    const enrollmentParam = urlParams.get('enrollment');
    if (enrollmentParam && ['enrolled', 'available'].includes(enrollmentParam)) {
      setEnrollmentFilter(enrollmentParam);
    }

    // One-time fix for emergency contacts (only run once)
    const hasRunEmergencyFix = localStorage.getItem('emergency_contacts_fixed');
    if (!hasRunEmergencyFix) {
      fixEmergencyContacts();
    }
  }, []);

  // Fix emergency contacts for existing students
  const fixEmergencyContacts = async () => {
    try {
      console.log('Running one-time emergency contact fix...');
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'fixEmergencyContacts' }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        if (result.updatedCount > 0) {
          toast.success(`Updated emergency contacts for ${result.updatedCount} students`);
          // Refresh students data to show updated emergency contacts
          fetchStudents();
        }
      } else {
        console.error('Error fixing emergency contacts:', result.error);
      }
      
      // Mark as completed so it doesn't run again
      localStorage.setItem('emergency_contacts_fixed', 'true');
    } catch (error) {
      console.error('Error fixing emergency contacts:', error);
    }
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      console.log('Fetching students from both external API and local database...');
      
      // Fetch from both sources in parallel
      const [localDbStudents, externalApiStudents] = await Promise.all([
        fetch('/api/admin/students').then(res => res.json()).then(data => data.data || []),
        fetchExternalStudents()
      ]);
      
      // Process local database students (enrolled in transport)
      const localStudents = Array.isArray(localDbStudents) ? localDbStudents : [];
      console.log(`Found ${localStudents.length} students in local database (enrolled in transport)`);
      
      // Transform local students to match UI format
      const transformedEnrolledStudents = localStudents.map(localStudent => ({
        id: localStudent.id,
        student_name: localStudent.student_name,
        roll_number: localStudent.roll_number,
        student_email: localStudent.email,
        student_mobile: localStudent.mobile,
        department: {
          department_name: localStudent.department_name || 'Unknown Department'
        },
        institution: {
          name: localStudent.institution_name || 'Unknown Institution'
        },
        program: {
          program_name: localStudent.program_name || ''
        },
        degree: {
          degree_name: localStudent.degree_name || ''
        },
        student_transport_profiles: [{
          transport_status: localStudent.transport_status,
          payment_status: localStudent.payment_status,
          outstanding_amount: localStudent.outstanding_amount || 0,
          allocated_route_id: localStudent.allocated_route_id,
          boarding_point: localStudent.boarding_point
        }],
        // Additional details
        father_name: localStudent.father_name,
        mother_name: localStudent.mother_name,
        date_of_birth: localStudent.date_of_birth,
        gender: localStudent.gender,
        address: {
          street: localStudent.address_street,
          district: localStudent.address_district,
          state: localStudent.address_state,
          pinCode: localStudent.address_pin_code
        },
        is_profile_complete: localStudent.is_profile_complete,
        external_id: localStudent.external_id,
        created_at: localStudent.created_at,
        updated_at: localStudent.updated_at,
        // Location tracking fields
        location_sharing_enabled: localStudent.location_sharing_enabled,
        location_enabled: localStudent.location_enabled,
        current_latitude: localStudent.current_latitude,
        current_longitude: localStudent.current_longitude,
        location_accuracy: localStudent.location_accuracy,
        location_timestamp: localStudent.location_timestamp,
        last_location_update: localStudent.last_location_update,
        _isTransportUser: true,
        _enrollmentStatus: 'enrolled'
      }));

      // Process external API students
      const externalStudents = Array.isArray(externalApiStudents) ? externalApiStudents : [];
      console.log(`Found ${externalStudents.length} students from external API`);

      // Filter out students who are already enrolled (exist in local database)
      const enrolledExternalIds = new Set(localStudents.map(s => s.external_id).filter(Boolean));
      const enrolledEmails = new Set(localStudents.map(s => s.email).filter(Boolean));
      
      const availableExternalStudents = externalStudents.filter(externalStudent => {
        const isEnrolledById = enrolledExternalIds.has(externalStudent.id?.toString());
        const isEnrolledByEmail = enrolledEmails.has(externalStudent.studentEmail) || 
                                 enrolledEmails.has(externalStudent.collegeEmail);
        return !isEnrolledById && !isEnrolledByEmail;
      });

      // Transform available students to match UI format
            const transformedAvailableStudents = availableExternalStudents.map(externalStudent => ({
        id: `external_${externalStudent.id}`, // Prefix to avoid conflicts
        // Combine first_name and last_name for display
        student_name: externalStudent.first_name && externalStudent.last_name 
          ? `${externalStudent.first_name} ${externalStudent.last_name}`.trim()
          : externalStudent.first_name || 'Unknown Student',
        first_name: externalStudent.first_name,
        last_name: externalStudent.last_name,
        roll_number: externalStudent.roll_number,
        student_email: externalStudent.student_email,
        college_email: externalStudent.college_email,
        student_mobile: externalStudent.student_mobile || externalStudent.father_mobile || externalStudent.mother_mobile,
        // Handle nested objects from new schema
        department: {
          department_name: externalStudent.department?.department_name || 'Unknown Department'
        },
        institution: {
          name: externalStudent.institution?.name || 'Unknown Institution'
        },
        program: {
          program_name: externalStudent.program?.program_name || ''
        },
        degree: {
          degree_name: externalStudent.degree?.degree_name || ''
        },
        // Parent information
        father_name: externalStudent.father_name,
        mother_name: externalStudent.mother_name,
        father_mobile: externalStudent.father_mobile,
        mother_mobile: externalStudent.mother_mobile,
        father_occupation: externalStudent.father_occupation,
        mother_occupation: externalStudent.mother_occupation,
        // Personal details
        date_of_birth: externalStudent.date_of_birth,
        gender: externalStudent.gender,
        religion: externalStudent.religion,
        community: externalStudent.community,
        caste: externalStudent.caste,
        annual_income: externalStudent.annual_income,
        // Academic details
        admission_id: externalStudent.admission_id,
        application_id: externalStudent.application_id,
        semester_id: externalStudent.semester_id,
        section_id: externalStudent.section_id,
        academic_year_id: externalStudent.academic_year_id,
        entry_type: externalStudent.entry_type,
        last_school: externalStudent.last_school,
        board_of_study: externalStudent.board_of_study,
        tenth_marks: externalStudent.tenth_marks,
        twelfth_marks: externalStudent.twelfth_marks,
        // Address information
        address: {
          street: externalStudent.permanent_address_street || '',
          taluk: externalStudent.permanent_address_taluk || '',
          district: externalStudent.permanent_address_district || '',
          state: externalStudent.permanent_address_state || '',
          pinCode: externalStudent.permanent_address_pin_code || ''
        },
        // Transport related
        bus_required: externalStudent.bus_required,
        bus_route: externalStudent.bus_route,
        bus_pickup_location: externalStudent.bus_pickup_location,
        // Other details
        accommodation_type: externalStudent.accommodation_type,
        hostel_type: externalStudent.hostel_type,
        student_photo_url: externalStudent.student_photo_url,
        is_profile_complete: externalStudent.is_profile_complete,
        status: externalStudent.status,
        external_id: externalStudent.id,
        student_transport_profiles: [], // Not enrolled in transport
        _isTransportUser: false,
        _enrollmentStatus: 'available'
      }));

      // Combine all students
      const allStudents = [...transformedEnrolledStudents, ...transformedAvailableStudents];
      
      setEnrolledStudents(transformedEnrolledStudents);
      setAvailableStudents(transformedAvailableStudents);
      setStudents(allStudents);
      
      console.log(`Loaded ${transformedEnrolledStudents.length} enrolled students and ${transformedAvailableStudents.length} available students`);
      
      toast.success(`Loaded ${transformedEnrolledStudents.length} enrolled and ${transformedAvailableStudents.length} available students`);
      
      // Extract unique values for filters
      extractFilterOptions(allStudents);
      
    } catch (error) {
      console.error('Error fetching students:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error: error
      });
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to load students: ${errorMessage}`);
      
      setStudents([]);
      setEnrolledStudents([]);
      setAvailableStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to generate academic years
  const generateAcademicYears = () => {
    const currentYear = new Date().getFullYear();
    const academicYears = [];
    
    // Generate academic years from 3 years back to 2 years forward
    for (let i = -3; i <= 2; i++) {
      const startYear = currentYear + i;
      const endYear = startYear + 1;
      academicYears.push(`${startYear}-${String(endYear).slice(-2)}`);
    }
    
    return academicYears;
  };

  // Helper function to determine academic year from student data
  const getStudentAcademicYear = (student: any) => {
    // Try to determine academic year based on available data
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    
    // Academic year typically starts in June/July
    let academicStartYear;
    if (currentMonth >= 6) {
      academicStartYear = currentYear;
    } else {
      academicStartYear = currentYear - 1;
    }
    
    // Check if student has a created_at date to infer their academic year
    if (student.created_at) {
      const createdDate = new Date(student.created_at);
      const createdYear = createdDate.getFullYear();
      const createdMonth = createdDate.getMonth() + 1;
      
      if (createdMonth >= 6) {
        academicStartYear = createdYear;
      } else {
        academicStartYear = createdYear - 1;
      }
    }
    
    return `${academicStartYear}-${String(academicStartYear + 1).slice(-2)}`;
  };

  // Extract unique values for filter dropdowns
  const extractFilterOptions = (studentsList: any[]) => {
    try {
      // Extract unique departments
      const departments = new Set<string>();
      const routes = new Map<string, any>();
      const academicYears = new Set<string>();
      const semesters = new Set<number>();

      studentsList.forEach(student => {
        // Department
        const dept = student.department?.department_name || student.department_name;
        if (dept) departments.add(dept);

        // Route (only for enrolled students with routes)
        const transportProfile = student.student_transport_profiles?.[0];
        const routeId = transportProfile?.allocated_route_id || student.allocated_route_id;
        if (routeId && student._enrollmentStatus === 'enrolled') {
          // We'll need to fetch route details, for now store the ID
          routes.set(routeId, { id: routeId, route_number: 'Loading...', route_name: '' });
        }

        // Academic Year - use computed academic year
        const academicYear = getStudentAcademicYear(student);
        academicYears.add(academicYear);

        // Semester
        const semester = student.semester;
        if (semester && !isNaN(semester)) semesters.add(parseInt(semester.toString()));
      });

      setUniqueDepartments(Array.from(departments).sort());
      setUniqueRoutes(Array.from(routes.values()));
      // Use computed academic years from actual student data
      const yearsList = Array.from(academicYears).sort();
      // Also include common academic years to ensure good coverage
      const generatedYears = generateAcademicYears();
      const allYears = [...new Set([...yearsList, ...generatedYears])].sort();
      setUniqueAcademicYears(allYears);
      setUniqueSemesters(Array.from(semesters).sort((a, b) => a - b));

      // Fetch route details for better display
      if (routes.size > 0) {
        fetchRouteDetails(Array.from(routes.keys()));
      }

    } catch (error) {
      console.error('Error extracting filter options:', error);
    }
  };

  // Fetch route details for route filter
  const fetchRouteDetails = async (routeIds: string[]) => {
    try {
      if (routeIds.length === 0) return;

      const routePromises = routeIds.map(async (routeId) => {
        try {
          const route = await DatabaseService.getRouteById(routeId);
          return route && typeof route === 'object' && 'id' in route ? {
            id: (route as any).id,
            route_number: (route as any).route_number || 'N/A',
            route_name: (route as any).route_name || 'Unknown Route'
          } : null;
        } catch (error) {
          console.error(`Error fetching route ${routeId}:`, error);
          return { id: routeId, route_number: 'Error', route_name: 'Failed to load' };
        }
      });

      const routeDetails = await Promise.all(routePromises);
      const validRoutes = routeDetails.filter(route => route !== null);
      setUniqueRoutes(validRoutes);

    } catch (error) {
      console.error('Error fetching route details:', error);
    }
  };

  // Helper function to fetch students from external API via proxy
  const fetchExternalStudents = async () => {
    try {
      console.log('🔍 Fetching students from external API via proxy...');
      
      const response = await fetch('/api/external-students', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 API Proxy Response Status:', response.status);

      if (!response.ok) {
        console.error('❌ API Proxy error:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Proxy error: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('📊 API Proxy Response Structure:', Object.keys(data));
      
      const students = data.data || [];
      console.log(`✅ Found ${students.length} students from external API via proxy`);
      
      if (students.length > 0) {
        console.log('📋 Sample student structure from proxy:', Object.keys(students[0]));
      }
      
      return students;
    } catch (error) {
      console.error('❌ Error fetching from external API via proxy:', error);
      return [];
    }
  };

  const handleEditStudent = (student: any) => {
    console.log('🔍 handleEditStudent called with:', student);
    console.log('🔍 Student enrollment status:', student._enrollmentStatus);
    
    if (student._enrollmentStatus === 'available') {
      // For available students, open the add modal pre-filled with their data
      console.log('🔍 Setting selectedAvailableStudent and opening add modal');
      console.log('🔍 Available student data structure:', {
        student_name: student.student_name,
        roll_number: student.roll_number,
        student_email: student.student_email,
        father_name: student.father_name,
        father_mobile: student.father_mobile,
        mother_name: student.mother_name,
        mother_mobile: student.mother_mobile
      });
      setSelectedAvailableStudent(student);
      setIsAddModalOpen(true);
      // The add modal will handle enrolling them in transport
    } else {
      // For enrolled students, open the edit modal
      setEditingStudent(student);
      setIsEditModalOpen(true);
    }
  };

  const handleViewStudent = (student: any) => {
    setViewingStudent(student);
    setIsViewModalOpen(true);
  };

  const handleUpdateStudent = async (updatedStudentData: any) => {
    try {
      // Update in database
      const updatedStudent = await DatabaseService.updateStudentTransport(
        editingStudent.id, 
        updatedStudentData
      );
      
      // Update local state - update both main students array and enrolled students
      const updatedStudentWithProfile = {
        ...editingStudent,
        student_transport_profiles: [{
          ...editingStudent.student_transport_profiles[0],
          ...updatedStudentData
        }],
        updated_at: new Date().toISOString()
      };

      setStudents(students.map(s => 
        s.id === editingStudent.id ? updatedStudentWithProfile : s
      ));
      
      setEnrolledStudents(enrolledStudents.map(s => 
        s.id === editingStudent.id ? updatedStudentWithProfile : s
      ));
      
      toast.success(`Student ${editingStudent.student_name} updated successfully!`);
      setIsEditModalOpen(false);
      setEditingStudent(null);
    } catch (error) {
      console.error('Error updating student:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to update student: ${errorMessage}`);
    }
  };

  const handleDeleteStudent = async (student: any) => {
    const studentName = student.student_name;
    const isEnrolled = student._enrollmentStatus === 'enrolled';
    
    const confirmMessage = isEnrolled 
      ? `⚠️ COMPLETE DELETION WARNING ⚠️\n\nAre you sure you want to PERMANENTLY DELETE ${studentName} and ALL their data?\n\nThis will remove:\n• Student record\n• Transport profile & route allocation\n• Payment history & receipts\n• Attendance records\n• Booking history\n• Grievances\n• All related transport data\n\n🚨 THIS ACTION CANNOT BE UNDONE! 🚨\n\nType "DELETE" to confirm:`
      : `Are you sure you want to delete ${studentName}? This action cannot be undone.`;
    
    if (isEnrolled) {
      // For enrolled students, require explicit confirmation
      const userConfirmation = prompt(confirmMessage);
      if (userConfirmation !== 'DELETE') {
        console.log('Student deletion cancelled by user');
        return;
      }
    } else {
      // For non-enrolled students, use regular confirm
      if (!confirm(confirmMessage)) {
        return;
      }
    }

    if (isEnrolled) {
      try {
        console.log(`🗑️ Starting complete deletion of student ${studentName} (ID: ${student.id})...`);
        
        // Show loading state
        setLoading(true);
        
        // Call the enhanced cascade delete function
        const result = await DatabaseService.deleteStudent(student.id);
        
        console.log('🎉 Deletion completed:', result);
        
        // Remove from local state arrays
        setStudents(students.filter(s => s.id !== student.id));
        setEnrolledStudents(enrolledStudents.filter(s => s.id !== student.id));
        
        // Add back to available students if they have external_id
        if (student.external_id) {
          // Fetch fresh external data to add them back as available
          const externalStudents = await fetchExternalStudents();
            const externalStudent = externalStudents.find((s: any) => s.id?.toString() === student.external_id?.toString());
            
            if (externalStudent) {
              const transformedAvailableStudent = {
                id: `external_${externalStudent.id}`,
                // Combine first_name and last_name for display
                student_name: externalStudent.first_name && externalStudent.last_name 
                  ? `${externalStudent.first_name} ${externalStudent.last_name}`.trim()
                  : externalStudent.first_name || 'Unknown Student',
                first_name: externalStudent.first_name,
                last_name: externalStudent.last_name,
                roll_number: externalStudent.roll_number,
                student_email: externalStudent.student_email,
                college_email: externalStudent.college_email,
                student_mobile: externalStudent.student_mobile || externalStudent.father_mobile || externalStudent.mother_mobile,
                // Handle nested objects from new schema
                department: {
                  department_name: externalStudent.department?.department_name || 'Unknown Department'
                },
                institution: {
                  name: externalStudent.institution?.name || 'Unknown Institution'
                },
                program: {
                  program_name: externalStudent.program?.program_name || ''
                },
                degree: {
                  degree_name: externalStudent.degree?.degree_name || ''
                },
                // Parent information
                father_name: externalStudent.father_name,
                mother_name: externalStudent.mother_name,
                father_mobile: externalStudent.father_mobile,
                mother_mobile: externalStudent.mother_mobile,
                father_occupation: externalStudent.father_occupation,
                mother_occupation: externalStudent.mother_occupation,
                // Personal details
                date_of_birth: externalStudent.date_of_birth,
                gender: externalStudent.gender,
                religion: externalStudent.religion,
                community: externalStudent.community,
                caste: externalStudent.caste,
                annual_income: externalStudent.annual_income,
                // Academic details
                admission_id: externalStudent.admission_id,
                application_id: externalStudent.application_id,
                semester_id: externalStudent.semester_id,
                section_id: externalStudent.section_id,
                academic_year_id: externalStudent.academic_year_id,
                entry_type: externalStudent.entry_type,
                last_school: externalStudent.last_school,
                board_of_study: externalStudent.board_of_study,
                tenth_marks: externalStudent.tenth_marks,
                twelfth_marks: externalStudent.twelfth_marks,
                // Address information
                address: {
                  street: externalStudent.permanent_address_street || '',
                  taluk: externalStudent.permanent_address_taluk || '',
                  district: externalStudent.permanent_address_district || '',
                  state: externalStudent.permanent_address_state || '',
                  pinCode: externalStudent.permanent_address_pin_code || ''
                },
                // Transport related
                bus_required: externalStudent.bus_required,
                bus_route: externalStudent.bus_route,
                bus_pickup_location: externalStudent.bus_pickup_location,
                // Other details
                accommodation_type: externalStudent.accommodation_type,
                hostel_type: externalStudent.hostel_type,
                student_photo_url: externalStudent.student_photo_url,
                is_profile_complete: externalStudent.is_profile_complete,
                status: externalStudent.status,
                external_id: externalStudent.id,
                student_transport_profiles: [],
                _isTransportUser: false,
                _enrollmentStatus: 'available'
              };
              
              setAvailableStudents([...availableStudents, transformedAvailableStudent]);
              setStudents([...students.filter(s => s.id !== student.id), transformedAvailableStudent]);
            }
          }
          
          // Show detailed success message
          const deletedComponents = result?.deletedComponents || [];
          const componentCount = deletedComponents.length;
          
          toast.success(
            `🎉 ${studentName} completely deleted! Removed ${componentCount} data components.`,
            { duration: 6000 }
          );
          
          console.log(`✅ Successfully deleted ${studentName} and ${componentCount} related components:`, deletedComponents);
      } catch (error) {
        console.error('❌ Error during student deletion:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        toast.error(`Failed to delete student ${studentName}: ${errorMessage}`, { duration: 8000 });
      } finally {
        setLoading(false);
      }
    } else {
      // For non-enrolled students, just remove from available list
      setStudents(students.filter(s => s.id !== student.id));
      setAvailableStudents(availableStudents.filter(s => s.id !== student.id));
      toast.success(`${studentName} has been removed from the available list`);
    }
  };

  const filteredStudents = students.filter(student => {
    // Enhanced search logic with debugging
    const searchTermLower = searchTerm.toLowerCase().trim();
    
    const transportProfile = student.student_transport_profiles && student.student_transport_profiles.length > 0 
      ? student.student_transport_profiles[0] : null;
    
    // Apply enrollment filter first
    const matchesEnrollment = enrollmentFilter === 'all' || 
                             (enrollmentFilter === 'enrolled' && student._enrollmentStatus === 'enrolled') ||
                             (enrollmentFilter === 'available' && student._enrollmentStatus === 'available');
    
    if (!matchesEnrollment) return false;
    
    // Search in multiple fields
    const searchFields = [
      student.student_name || '',
      student.roll_number || '',
      student.student_email || '',
      student.college_email || '',
      student.department?.department_name || '',
      student.institution?.name || '',
      student.program?.program_name || '',
      student.degree?.degree_name || '',
      student.student_mobile || '',
      student.father_name || '',
      student.mother_name || ''
    ];
    
    const matchesSearch = !searchTermLower || searchFields.some(field => 
      field.toLowerCase().includes(searchTermLower)
    );
    
    // Apply status and payment filters (only for enrolled students)
    const matchesStatus = statusFilter === 'all' || 
                         student._enrollmentStatus === 'available' || // Available students don't have transport status
                         (transportProfile && transportProfile.transport_status === statusFilter) ||
                         (statusFilter === 'no_transport' && !transportProfile);
    
    const matchesPayment = paymentFilter === 'all' || 
                          student._enrollmentStatus === 'available' || // Available students don't have payment status
                          (transportProfile && transportProfile.payment_status === paymentFilter);
    
    // Apply new comprehensive filters
    const studentDepartment = student.department?.department_name || student.department_name || '';
    const matchesDepartment = departmentFilter === 'all' || studentDepartment === departmentFilter;
    
    const studentRouteId = transportProfile?.allocated_route_id || student.allocated_route_id || '';
    const matchesRoute = routeFilter === 'all' || 
                        (routeFilter === 'no_route' && !studentRouteId) ||
                        studentRouteId === routeFilter;
    
    // Academic year filtering - determine student's academic year and compare
    const studentAcademicYear = getStudentAcademicYear(student);
    const matchesAcademicYear = academicYearFilter === 'all' || 
                               studentAcademicYear === academicYearFilter;
    
    const studentSemester = student.semester || '';
    const matchesSemester = semesterFilter === 'all' || 
                           studentSemester.toString() === semesterFilter;
    
    const studentGender = student.gender || '';
    const matchesGender = genderFilter === 'all' || studentGender.toLowerCase() === genderFilter.toLowerCase();
    
    return matchesSearch && matchesStatus && matchesPayment && 
           matchesDepartment && matchesRoute && matchesAcademicYear && 
           matchesSemester && matchesGender;
  });

  const canAddStudent = user && ['super_admin', 'data_entry'].includes(user.role);

  // Pagination calculations
  const totalFilteredStudents = filteredStudents.length;
  const totalPages = Math.ceil(totalFilteredStudents / studentsPerPage);
  const startIndex = (currentPage - 1) * studentsPerPage;
  const endIndex = startIndex + studentsPerPage;
  const currentStudents = filteredStudents.slice(startIndex, endIndex);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, paymentFilter, enrollmentFilter, departmentFilter, routeFilter, academicYearFilter, semesterFilter, genderFilter]);

  // Stats calculations
  const totalStudents = students.length;
  const enrolledCount = enrolledStudents.length;
  const availableCount = availableStudents.length;
  const activeTransport = enrolledStudents.filter(s => 
    s.student_transport_profiles && 
    s.student_transport_profiles.length > 0 && 
    s.student_transport_profiles[0].transport_status === 'active'
  ).length;
  const overduePayments = enrolledStudents.filter(s => 
    s.student_transport_profiles && 
    s.student_transport_profiles.length > 0 && 
    s.student_transport_profiles[0].payment_status === 'overdue'
  ).length;
  const totalOutstanding = enrolledStudents.reduce((sum, s) => {
    if (s.student_transport_profiles && s.student_transport_profiles.length > 0) {
      return sum + (s.student_transport_profiles[0].outstanding_amount || 0);
    }
    return sum;
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading students...</p>
        </div>
      </div>
    );
    }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students Management</h1>
          <p className="text-gray-600">Manage student records and transport assignments</p>
        </div>
          {canAddStudent && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Student</span>
            </button>
          )}
      </div>

      {/* Enhanced Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
        {createStudentStats({
          totalStudents: totalStudents,
          enrolledStudents: enrolledCount,
          pendingStudents: availableCount,
          activeTransport: enrolledCount,
          pendingPayments: overduePayments
        }).map((stat, index) => (
          <UniversalStatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={
              index === 0 ? Users :
              index === 1 ? CheckCircle :
              index === 2 ? User :
              index === 3 ? Bus :
              CreditCard
            }
            trend={stat.trend}
            color={stat.color}
            variant="default"
            loading={loading}
            delay={index}
          />
        ))}
      </div>

      {/* Enhanced Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Student Filters
        </h3>
        
        {/* Search Row */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, email, roll number, department, mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
        </div>

        {/* Filter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-4">
          {/* Enrollment Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Enrollment</label>
            <select
              value={enrollmentFilter}
              onChange={(e) => setEnrollmentFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="all">All Students</option>
              <option value="enrolled">Enrolled</option>
              <option value="available">Available</option>
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="all">All Departments</option>
              {uniqueDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Route */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Route</label>
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="all">All Routes</option>
              <option value="no_route">No Route</option>
              {uniqueRoutes.map(route => (
                <option key={route.id} value={route.id}>
                  {route.route_number} - {route.route_name}
                </option>
              ))}
            </select>
          </div>

          {/* Academic Year */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Academic Year</label>
            <select
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="all">All Years</option>
              {uniqueAcademicYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {/* Semester */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Semester</label>
            <select
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="all">All Semesters</option>
              {uniqueSemesters.map(sem => (
                <option key={sem} value={sem.toString()}>Semester {sem}</option>
              ))}
            </select>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Gender</label>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="all">All</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Transport Specific Filters (shown only when needed) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Transport Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Transport Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="no_transport">No Transport</option>
            </select>
          </div>

          {/* Payment Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Payment Status</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="all">All Payments</option>
              <option value="current">Current</option>
              <option value="overdue">Overdue</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                setSearchTerm('');
                setEnrollmentFilter('all');
                setDepartmentFilter('all');
                setRouteFilter('all');
                setAcademicYearFilter('all');
                setSemesterFilter('all');
                setGenderFilter('all');
                setStatusFilter('all');
                setPaymentFilter('all');
                toast.success('Filters cleared');
              }}
              className="btn-secondary text-sm flex items-center space-x-1"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
            <button
              onClick={() => toast('Export functionality coming soon')}
              className="btn-secondary text-sm flex items-center space-x-1"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pagination Info */}
      {!loading && totalFilteredStudents > 0 && (
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(endIndex, totalFilteredStudents)} of {totalFilteredStudents} students
            {totalFilteredStudents !== totalStudents && (
              <span className="text-blue-600 ml-1">
                (filtered from {totalStudents} total)
              </span>
            )}
          </div>
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {currentStudents.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            onEdit={handleEditStudent}
            onDelete={handleDeleteStudent}
            onView={handleViewStudent}
            userRole={user?.role}
          />
        ))}
      </div>

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Page Navigation */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {/* Page Numbers */}
            <div className="flex items-center space-x-1">
              {(() => {
                const pages = [];
                const maxVisiblePages = 5;
                let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                
                if (endPage - startPage < maxVisiblePages - 1) {
                  startPage = Math.max(1, endPage - maxVisiblePages + 1);
                }
                
                for (let i = startPage; i <= endPage; i++) {
                  pages.push(
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i)}
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        currentPage === i
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {i}
                    </button>
                  );
                }
                return pages;
              })()}
            </div>
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>

          {/* Jump to Page */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Go to page:</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                const page = parseInt(e.target.value);
                if (page >= 1 && page <= totalPages) {
                  setCurrentPage(page);
                }
              }}
              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-sm text-gray-600">of {totalPages}</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {currentStudents.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">
            {totalFilteredStudents === 0 ? 'No students found matching your filters.' : 'No students on this page.'}
          </div>
          {totalFilteredStudents === 0 && (
            <button
              onClick={() => {
                setSearchTerm('');
                setEnrollmentFilter('all');
                setDepartmentFilter('all');
                setRouteFilter('all');
                setAcademicYearFilter('all');
                setSemesterFilter('all');
                setGenderFilter('all');
                setStatusFilter('all');
                setPaymentFilter('all');
              }}
              className="btn-secondary"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}


      <AnimatePresence>
        <EnhancedAddStudentModal
          isOpen={isAddModalOpen}
          selectedStudent={selectedAvailableStudent}
          onClose={() => {
            setIsAddModalOpen(false);
            setSelectedAvailableStudent(null);
          }}
          onSave={(newStudent: any) => {
            // Refresh the students list after enrollment
            fetchStudents();
            toast.success(`Student ${newStudent.student_name} enrolled successfully!`);
          }}
        />
      </AnimatePresence>

      <AnimatePresence>
        <EditStudentModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingStudent(null);
          }}
          onSave={handleUpdateStudent}
          student={editingStudent}
        />
      </AnimatePresence>

      <AnimatePresence>
        <ViewStudentModal
          isOpen={isViewModalOpen}
          onClose={() => {
            setIsViewModalOpen(false);
            setViewingStudent(null);
          }}
          student={viewingStudent}
        />
      </AnimatePresence>
    </div>
  );
};

export default StudentsPage;

