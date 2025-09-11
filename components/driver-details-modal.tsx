'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Star, 
  Award, 
  Activity, 
  Clock,
  FileText,
  Shield,
  AlertCircle,
  CheckCircle,
  Heart,
  TrendingUp,
  CreditCard,
  Route as RouteIcon,
  Car,
  Loader2
} from 'lucide-react';
import { DatabaseService } from '@/lib/database';

interface DriverDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: any;
}

const DriverDetailsModal = ({ isOpen, onClose, driver }: DriverDetailsModalProps) => {
  const [detailedDriver, setDetailedDriver] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch detailed driver information when modal opens
  useEffect(() => {
    if (isOpen && driver?.id) {
      fetchDetailedDriverInfo();
    }
  }, [isOpen, driver?.id]);

  const fetchDetailedDriverInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching detailed driver info for driver:', driver?.id);

      // Fetch route and vehicle info if needed
      let routeInfo = driver.routes;
      let vehicleInfo = driver.vehicles;

      // Check for route assignments in multiple sources
      if (!driver.routes) {
        try {
          // First, check if driver is assigned to any route in the routes table
          const routesResponse = await fetch('/api/admin/routes');
          const routesResult = await routesResponse.json();
          if (routesResult.success) {
            const allRoutes = routesResult.data || [];
            
            // Priority 1: Check routes.driver_id (direct assignment) - This should be the primary source
            let assignedRoute = allRoutes.find((r: any) => r.driver_id === driver.id);
            
            // Priority 2: Check drivers.assigned_route_id (fallback)
            if (!assignedRoute && driver.assigned_route_id) {
              assignedRoute = allRoutes.find((r: any) => r.id === driver.assigned_route_id);
            }
            
            // Priority 3: Check driver_route_assignments table (additional assignments)
            if (!assignedRoute) {
              const assignmentsResponse = await fetch(`/api/admin/drivers/${driver.id}/route-assignments`);
              if (assignmentsResponse.ok) {
                const assignmentsResult = await assignmentsResponse.json();
                if (assignmentsResult.success && assignmentsResult.assignments.length > 0) {
                  const activeAssignment = assignmentsResult.assignments.find((a: any) => a.is_active);
                  if (activeAssignment) {
                    assignedRoute = allRoutes.find((r: any) => r.id === activeAssignment.route_id);
                  }
                }
              }
            }
            
            if (assignedRoute) {
              routeInfo = assignedRoute;
              console.log('Found assigned route:', routeInfo);
            } else {
              console.log('No route assignment found for driver');
            }
          }
        } catch (error) {
          console.warn('Could not fetch route details:', error);
        }
      }

      // If we have route with vehicle assignment
      if (routeInfo && routeInfo.vehicle_id && !driver.vehicles) {
        try {
          const vehiclesResponse = await fetch('/api/admin/vehicles');
          const vehiclesResult = await vehiclesResponse.json();
          if (vehiclesResult.success) {
            const allVehicles = vehiclesResult.data || [];
            const foundVehicle = allVehicles.find((v: any) => v.id === routeInfo.vehicle_id);
            if (foundVehicle) {
              vehicleInfo = {
                id: foundVehicle.id,
                registration_number: foundVehicle.registration_number || foundVehicle.vehicle_number,
                model: foundVehicle.model,
                capacity: foundVehicle.capacity,
                fuel_type: foundVehicle.fuel_type,
                status: foundVehicle.status
              };
            }
          }
          console.log('Fetched vehicle info:', vehicleInfo);
        } catch (error) {
          console.warn('Could not fetch vehicle details:', error);
        }
      }

      // Combine the original driver data with detailed information
      const enhanced = {
        ...driver,
        routes: routeInfo || null,
        vehicles: vehicleInfo || null,
        // Ensure all required fields have default values
        driver_name: driver.driver_name || driver.name || 'Unknown Driver',
        phone_number: driver.phone_number || driver.phone || 'Not provided',
        email: driver.email || 'Not provided',
        license_number: driver.license_number || 'Not provided',
        experience_years: driver.experience_years || 0,
        rating: driver.rating || 0,
        status: driver.status || 'active',
        total_trips: driver.total_trips || 0
      };

      console.log('Enhanced driver data:', enhanced);
      setDetailedDriver(enhanced);
      
    } catch (error) {
      console.error('Error fetching detailed driver info:', error);
      setError('Failed to load detailed driver information');
      // Fallback to original driver data
      setDetailedDriver(driver);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !driver) return null;

  const displayDriver = detailedDriver || driver;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'on_leave': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return <CheckCircle className="w-4 h-4" />;
      case 'inactive': return <AlertCircle className="w-4 h-4" />;
      case 'on_leave': return <Clock className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

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

  const isExpiryNear = (dateString: string, daysThreshold = 30) => {
    if (!dateString) return false;
    try {
      const expiryDate = new Date(dateString);
      const today = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= daysThreshold && daysUntilExpiry >= 0;
    } catch {
      return false;
    }
  };

  const isExpired = (dateString: string) => {
    if (!dateString) return false;
    try {
      const expiryDate = new Date(dateString);
      const today = new Date();
      return expiryDate < today;
    } catch {
      return false;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{displayDriver.driver_name || displayDriver.name}</h2>
              <p className="text-gray-600">{displayDriver.license_number}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {loading && (
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading details...</span>
              </div>
            )}
            <span className={`px-3 py-1 rounded-full text-sm font-medium border flex items-center space-x-1 ${getStatusColor(displayDriver.status)}`}>
              {getStatusIcon(displayDriver.status)}
              <span>{displayDriver.status}</span>
            </span>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Personal Information */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <User className="w-5 h-5 text-blue-600" />
                  <span>Personal Information</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Full Name</label>
                    <p className="text-gray-900">{displayDriver.driver_name || displayDriver.name || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">License Number</label>
                    <p className="text-gray-900 font-mono">{displayDriver.license_number || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Aadhar Number</label>
                    <p className="text-gray-900 font-mono">
                      {displayDriver.aadhar_number 
                        ? displayDriver.aadhar_number.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')
                        : 'Not provided'
                      }
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Experience</label>
                    <p className="text-gray-900">{displayDriver.experience_years || 0} years</p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <Phone className="w-5 h-5 text-green-600" />
                  <span>Contact Information</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Phone Number</label>
                      <p className="text-gray-900">{displayDriver.phone_number || displayDriver.phone || 'Not provided'}</p>
                    </div>
                  </div>
                  {displayDriver.email && (
                    <div className="flex items-center space-x-3">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Email Address</label>
                        <p className="text-gray-900">{displayDriver.email}</p>
                      </div>
                    </div>
                  )}
                  {displayDriver.address && (
                    <div className="flex items-start space-x-3">
                      <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Address</label>
                        <p className="text-gray-900">{displayDriver.address}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Emergency Contact */}
              {(displayDriver.emergency_contact_name || displayDriver.emergency_contact_phone) && (
                <div className="bg-red-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                    <Heart className="w-5 h-5 text-red-600" />
                    <span>Emergency Contact</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {displayDriver.emergency_contact_name && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Contact Name</label>
                        <p className="text-gray-900">{displayDriver.emergency_contact_name}</p>
                      </div>
                    )}
                    {displayDriver.emergency_contact_phone && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Contact Phone</label>
                        <p className="text-gray-900">{displayDriver.emergency_contact_phone}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Professional Certifications */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <span>Professional Certifications</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div className="flex items-center space-x-3">
                      <Shield className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-gray-900">Driving License</p>
                        <p className="text-sm text-gray-600">
                          {displayDriver.license_expiry ? `Expires: ${formatDate(displayDriver.license_expiry)}` : 'No expiry date'}
                        </p>
                      </div>
                    </div>
                    {displayDriver.license_expiry && (
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        isExpired(displayDriver.license_expiry) 
                          ? 'bg-red-100 text-red-800'
                          : isExpiryNear(displayDriver.license_expiry)
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {isExpired(displayDriver.license_expiry) 
                          ? 'Expired' 
                          : isExpiryNear(displayDriver.license_expiry)
                          ? 'Expires Soon'
                          : 'Valid'
                        }
                      </span>
                    )}
                  </div>
                  
                  {displayDriver.medical_certificate_expiry && (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div className="flex items-center space-x-3">
                        <Heart className="w-5 h-5 text-red-600" />
                        <div>
                          <p className="font-medium text-gray-900">Medical Certificate</p>
                          <p className="text-sm text-gray-600">Expires: {formatDate(displayDriver.medical_certificate_expiry)}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        isExpired(displayDriver.medical_certificate_expiry) 
                          ? 'bg-red-100 text-red-800'
                          : isExpiryNear(displayDriver.medical_certificate_expiry)
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {isExpired(displayDriver.medical_certificate_expiry) 
                          ? 'Expired' 
                          : isExpiryNear(displayDriver.medical_certificate_expiry)
                          ? 'Expires Soon'
                          : 'Valid'
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Route Assignment */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Route Assignment</h3>
                <div className="p-4 border border-gray-200 rounded-lg">
                  {displayDriver.routes ? (
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <RouteIcon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{displayDriver.routes.route_number} - {displayDriver.routes.route_name}</h4>
                        <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                          <div className="flex items-center space-x-1">
                            <MapPin className="w-3 h-3" />
                            <span>{displayDriver.routes.start_location} → {displayDriver.routes.end_location}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{displayDriver.routes.duration}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 mt-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            displayDriver.routes.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {displayDriver.routes.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <RouteIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">No route assigned</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Vehicle Assignment */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Assignment</h3>
                <div className="p-4 border border-gray-200 rounded-lg">
                  {displayDriver.vehicles ? (
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Car className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{displayDriver.vehicles.registration_number}</h4>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>{displayDriver.vehicles.model || 'Model not specified'}</p>
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-1">
                              <Activity className="w-3 h-3" />
                              <span>Capacity: {displayDriver.vehicles.capacity || 'Not specified'}</span>
                            </div>
                            {displayDriver.vehicles.fuel_type && (
                              <div className="flex items-center space-x-1">
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                <span>Fuel: {displayDriver.vehicles.fuel_type}</span>
                              </div>
                            )}
                          </div>
                          {displayDriver.vehicles.status && (
                            <div className="mt-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                displayDriver.vehicles.status === 'active' 
                                  ? 'bg-green-100 text-green-800' 
                                  : displayDriver.vehicles.status === 'maintenance'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {displayDriver.vehicles.status}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Car className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">No vehicle assigned</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Performance Stats */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <span>Performance</span>
                </h3>
                <div className="space-y-4">
                  <div className="text-center p-4 bg-white rounded-lg">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Star className="w-5 h-5 text-yellow-500 fill-current" />
                      <span className="text-2xl font-bold text-gray-900">{displayDriver.rating || '4.0'}</span>
                    </div>
                    <p className="text-sm text-gray-600">Average Rating</p>
                  </div>
                  
                  <div className="text-center p-4 bg-white rounded-lg">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Activity className="w-5 h-5 text-green-600" />
                      <span className="text-2xl font-bold text-gray-900">{displayDriver.total_trips || '0'}</span>
                    </div>
                    <p className="text-sm text-gray-600">Total Trips</p>
                  </div>
                  
                  <div className="text-center p-4 bg-white rounded-lg">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      <span className="text-2xl font-bold text-gray-900">{displayDriver.experience_years || '0'}</span>
                    </div>
                    <p className="text-sm text-gray-600">Years Experience</p>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-orange-600" />
                  <span>Recent Activity</span>
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-3 bg-white rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Profile Updated</p>
                      <p className="text-xs text-gray-600">2 days ago</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 bg-white rounded-lg">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Trip Completed</p>
                      <p className="text-xs text-gray-600">5 days ago</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 bg-white rounded-lg">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">License Renewed</p>
                      <p className="text-xs text-gray-600">1 month ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default DriverDetailsModal; 