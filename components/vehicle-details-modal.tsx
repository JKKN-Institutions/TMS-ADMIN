'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Car,
  Calendar,
  Fuel,
  FileText,
  AlertTriangle,
  CheckCircle,
  Shield,
  Wrench,
  MapPin,
  Clock,
  DollarSign,
  Info,
  Activity,
  User,
  Heart,
  Gauge,
  CreditCard,
  Route as RouteIcon,
  UserCheck,
  Phone,
  Mail,
  Loader2,
  Navigation,
  Wifi,
  WifiOff,
  Satellite,
  Eye
} from 'lucide-react';
import { DatabaseService } from '@/lib/database';
import toast from 'react-hot-toast';
import LiveGPSTrackingModal from '@/components/live-gps-tracking-modal';

interface VehicleDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: any;
}

const VehicleDetailsModal: React.FC<VehicleDetailsModalProps> = ({
  isOpen,
  onClose,
  vehicle
}) => {
  const [detailedVehicle, setDetailedVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiveTrackingOpen, setIsLiveTrackingOpen] = useState(false);

  // Fetch detailed vehicle information when modal opens
  useEffect(() => {
    if (isOpen && vehicle?.id) {
      fetchDetailedVehicleInfo();
    }
  }, [isOpen, vehicle?.id]);

  const fetchDetailedVehicleInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching detailed vehicle info for vehicle:', vehicle?.id);

      // Fetch driver and route info if needed
      let driverInfo = vehicle.drivers;
      let routeInfo = vehicle.routes;

      // If we have assigned_route_id but no route object, fetch route details
      if (vehicle.assigned_route_id && !vehicle.routes) {
        try {
          const routesResponse = await fetch('/api/admin/routes');
          const routesResult = await routesResponse.json();
          if (routesResult.success) {
            const allRoutes = routesResult.data || [];
            routeInfo = allRoutes.find((r: any) => r.id === vehicle.assigned_route_id);
            console.log('Fetched route info:', routeInfo);
          }
        } catch (error) {
          console.warn('Could not fetch route details:', error);
        }
      }

      // If we have assigned driver based on route assignment
      if (routeInfo && routeInfo.driver_id && !vehicle.drivers) {
        try {
          const driversResponse = await fetch('/api/admin/drivers');
          const driversResult = await driversResponse.json();
          if (driversResult.success) {
            const allDrivers = driversResult.data || [];
            const foundDriver = allDrivers.find((d: any) => d.id === routeInfo.driver_id);
            if (foundDriver) {
              driverInfo = {
                id: foundDriver.id,
                name: foundDriver.driver_name,
                phone: foundDriver.phone_number,
                email: foundDriver.email,
                license_number: foundDriver.license_number,
                status: foundDriver.status
              };
            }
          }
          console.log('Fetched driver info:', driverInfo);
        } catch (error) {
          console.warn('Could not fetch driver details:', error);
        }
      }

      // Combine the original vehicle data with detailed information
      const enhanced = {
        ...vehicle,
        drivers: driverInfo || null,
        routes: routeInfo || null,
        // Ensure all required fields have default values
        registration_number: vehicle.registration_number || vehicle.vehicle_number || 'Unknown',
        model: vehicle.model || 'Model not specified',
        capacity: vehicle.capacity || 0,
        fuel_type: vehicle.fuel_type || 'Unknown',
        status: vehicle.status || 'active',
        last_maintenance: vehicle.last_maintenance,
        next_maintenance: vehicle.next_maintenance,
        insurance_expiry: vehicle.insurance_expiry,
        fitness_expiry: vehicle.fitness_expiry,
        mileage: vehicle.mileage || 0
      };

      console.log('Enhanced vehicle data:', enhanced);
      setDetailedVehicle(enhanced);
      
    } catch (error) {
      console.error('Error fetching detailed vehicle info:', error);
      setError('Failed to load detailed vehicle information');
      // Fallback to original vehicle data
      setDetailedVehicle(vehicle);
    } finally {
      setLoading(false);
    }
  };

  if (!vehicle) return null;

  const displayVehicle = detailedVehicle || vehicle;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'retired': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getFuelTypeColor = (fuelType: string) => {
    switch (fuelType?.toLowerCase()) {
      case 'diesel': return 'text-blue-600';
      case 'petrol': return 'text-green-600';
      case 'electric': return 'text-purple-600';
      case 'cng': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not specified';
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
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-25"
              onClick={onClose}
            />
            
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
      >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    displayVehicle.status === 'active' ? 'bg-green-100' : 
                    displayVehicle.status === 'maintenance' ? 'bg-yellow-100' : 'bg-gray-100'
            }`}>
              <Car className={`w-6 h-6 ${
                      displayVehicle.status === 'active' ? 'text-green-600' : 
                      displayVehicle.status === 'maintenance' ? 'text-yellow-600' : 'text-gray-600'
              }`} />
            </div>
            <div>
                    <h2 className="text-xl font-bold text-gray-900">{displayVehicle.registration_number}</h2>
                    <p className="text-gray-600">{displayVehicle.model}</p>
            </div>
          </div>
                
          <div className="flex items-center space-x-3">
                  {loading && (
                    <div className="flex items-center space-x-2 text-sm text-blue-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading details...</span>
                    </div>
                  )}
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${getStatusColor(displayVehicle.status)}`}>
                    {displayVehicle.status}
            </span>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
                    <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

              {/* Error State */}
              {error && (
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Vehicle Information */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Information</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Car className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Registration Number</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{displayVehicle.registration_number}</span>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Model</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{displayVehicle.model}</span>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Activity className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Capacity</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{displayVehicle.capacity} passengers</span>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Fuel className={`w-4 h-4 ${getFuelTypeColor(displayVehicle.fuel_type)}`} />
                            <span className="text-sm text-gray-600">Fuel Type</span>
                          </div>
                          <span className={`text-sm font-medium ${getFuelTypeColor(displayVehicle.fuel_type)}`}>
                            {displayVehicle.fuel_type?.toUpperCase()}
                          </span>
                        </div>
                        
                        {displayVehicle.mileage > 0 && (
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-2">
                              <Gauge className="w-4 h-4 text-gray-500" />
                              <span className="text-sm text-gray-600">Mileage</span>
                            </div>
                            <span className="text-sm font-medium text-gray-900">{displayVehicle.mileage} km/l</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Maintenance & Documentation */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Maintenance & Documentation</h3>
                      <div className="space-y-3">
                        {displayVehicle.last_maintenance && (
                          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center space-x-2">
                              <Wrench className="w-4 h-4 text-blue-600" />
                              <div>
                                <p className="text-sm font-medium text-blue-900">Last Maintenance</p>
                                <p className="text-xs text-blue-700">{formatDate(displayVehicle.last_maintenance)}</p>
                              </div>
                            </div>
                            <CheckCircle className="w-5 h-5 text-blue-600" />
                          </div>
                        )}

                        {displayVehicle.next_maintenance && (
                          <div className={`flex items-center justify-between p-3 rounded-lg border ${
                            isExpired(displayVehicle.next_maintenance) 
                              ? 'bg-red-50 border-red-200'
                              : isExpiryNear(displayVehicle.next_maintenance)
                              ? 'bg-yellow-50 border-yellow-200'
                              : 'bg-green-50 border-green-200'
                          }`}>
                            <div className="flex items-center space-x-2">
                              <Calendar className={`w-4 h-4 ${
                                isExpired(displayVehicle.next_maintenance) 
                                  ? 'text-red-600'
                                  : isExpiryNear(displayVehicle.next_maintenance)
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                              }`} />
                              <div>
                                <p className={`text-sm font-medium ${
                                  isExpired(displayVehicle.next_maintenance) 
                                    ? 'text-red-900'
                                    : isExpiryNear(displayVehicle.next_maintenance)
                                    ? 'text-yellow-900'
                                    : 'text-green-900'
                                }`}>Next Maintenance</p>
                                <p className={`text-xs ${
                                  isExpired(displayVehicle.next_maintenance) 
                                    ? 'text-red-700'
                                    : isExpiryNear(displayVehicle.next_maintenance)
                                    ? 'text-yellow-700'
                                    : 'text-green-700'
                                }`}>{formatDate(displayVehicle.next_maintenance)}</p>
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              isExpired(displayVehicle.next_maintenance) 
                                ? 'bg-red-100 text-red-800'
                                : isExpiryNear(displayVehicle.next_maintenance)
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {isExpired(displayVehicle.next_maintenance) 
                                ? 'Overdue' 
                                : isExpiryNear(displayVehicle.next_maintenance)
                                ? 'Due Soon'
                                : 'On Track'
                              }
                            </span>
                          </div>
                        )}

                        {displayVehicle.insurance_expiry && (
                          <div className={`flex items-center justify-between p-3 rounded-lg border ${
                            isExpired(displayVehicle.insurance_expiry) 
                              ? 'bg-red-50 border-red-200'
                              : isExpiryNear(displayVehicle.insurance_expiry)
                              ? 'bg-yellow-50 border-yellow-200'
                              : 'bg-green-50 border-green-200'
                          }`}>
                            <div className="flex items-center space-x-2">
                              <Shield className={`w-4 h-4 ${
                                isExpired(displayVehicle.insurance_expiry) 
                                  ? 'text-red-600'
                                  : isExpiryNear(displayVehicle.insurance_expiry)
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                              }`} />
                              <div>
                                <p className={`text-sm font-medium ${
                                  isExpired(displayVehicle.insurance_expiry) 
                                    ? 'text-red-900'
                                    : isExpiryNear(displayVehicle.insurance_expiry)
                                    ? 'text-yellow-900'
                                    : 'text-green-900'
                                }`}>Insurance</p>
                                <p className={`text-xs ${
                                  isExpired(displayVehicle.insurance_expiry) 
                                    ? 'text-red-700'
                                    : isExpiryNear(displayVehicle.insurance_expiry)
                                    ? 'text-yellow-700'
                                    : 'text-green-700'
                                }`}>Expires: {formatDate(displayVehicle.insurance_expiry)}</p>
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              isExpired(displayVehicle.insurance_expiry) 
                                ? 'bg-red-100 text-red-800'
                                : isExpiryNear(displayVehicle.insurance_expiry)
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {isExpired(displayVehicle.insurance_expiry) 
                                ? 'Expired' 
                                : isExpiryNear(displayVehicle.insurance_expiry)
                                ? 'Expires Soon'
                                : 'Valid'
                              }
                            </span>
                          </div>
                        )}

                        {displayVehicle.fitness_expiry && (
                          <div className={`flex items-center justify-between p-3 rounded-lg border ${
                            isExpired(displayVehicle.fitness_expiry) 
                              ? 'bg-red-50 border-red-200'
                              : isExpiryNear(displayVehicle.fitness_expiry)
                              ? 'bg-yellow-50 border-yellow-200'
                              : 'bg-green-50 border-green-200'
                          }`}>
                            <div className="flex items-center space-x-2">
                              <Heart className={`w-4 h-4 ${
                                isExpired(displayVehicle.fitness_expiry) 
                                  ? 'text-red-600'
                                  : isExpiryNear(displayVehicle.fitness_expiry)
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                              }`} />
                              <div>
                                <p className={`text-sm font-medium ${
                                  isExpired(displayVehicle.fitness_expiry) 
                                    ? 'text-red-900'
                                    : isExpiryNear(displayVehicle.fitness_expiry)
                                    ? 'text-yellow-900'
                                    : 'text-green-900'
                                }`}>Fitness Certificate</p>
                                <p className={`text-xs ${
                                  isExpired(displayVehicle.fitness_expiry) 
                                    ? 'text-red-700'
                                    : isExpiryNear(displayVehicle.fitness_expiry)
                                    ? 'text-yellow-700'
                                    : 'text-green-700'
                                }`}>Expires: {formatDate(displayVehicle.fitness_expiry)}</p>
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              isExpired(displayVehicle.fitness_expiry) 
                                ? 'bg-red-100 text-red-800'
                                : isExpiryNear(displayVehicle.fitness_expiry)
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {isExpired(displayVehicle.fitness_expiry) 
                                ? 'Expired' 
                                : isExpiryNear(displayVehicle.fitness_expiry)
                                ? 'Expires Soon'
                                : 'Valid'
                              }
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Assignments & Operational Info */}
                  <div className="space-y-6">

                    {/* GPS Tracking Information */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <Navigation className="w-5 h-5 mr-2 text-blue-600" />
                        GPS Tracking
                      </h3>
                      <div className="space-y-3">
                        {/* GPS Device Status */}
                        {displayVehicle.gps_device_id ? (
                          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <Satellite className="w-4 h-4 text-blue-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-blue-900">GPS Device Assigned</p>
                                  <p className="text-sm text-blue-700">Device ID: {displayVehicle.gps_device_id}</p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {displayVehicle.live_tracking_enabled ? (
                                  <Wifi className="w-5 h-5 text-green-600" />
                                ) : (
                                  <WifiOff className="w-5 h-5 text-gray-400" />
                                )}
                              </div>
                            </div>
                            
                            {/* Live Tracking Status */}
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-blue-700">Live Tracking:</span>
                                <span className={`font-medium ${
                                  displayVehicle.live_tracking_enabled ? 'text-green-700' : 'text-gray-600'
                                }`}>
                                  {displayVehicle.live_tracking_enabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                              {displayVehicle.last_gps_update && (
                                <div className="flex items-center justify-between">
                                  <span className="text-blue-700">Last Update:</span>
                                  <span className="font-medium text-blue-900">
                                    {new Date(displayVehicle.last_gps_update).toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Current Location */}
                            {displayVehicle.current_latitude && displayVehicle.current_longitude && (
                              <div className="mt-3 pt-3 border-t border-blue-200">
                                <p className="text-sm font-medium text-blue-900 mb-2">Current Location:</p>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="text-blue-700">Latitude:</span>
                                    <span className="font-mono ml-2">{Number(displayVehicle.current_latitude).toFixed(6)}</span>
                                  </div>
                                  <div>
                                    <span className="text-blue-700">Longitude:</span>
                                    <span className="font-mono ml-2">{Number(displayVehicle.current_longitude).toFixed(6)}</span>
                                  </div>
                                </div>
                                {displayVehicle.gps_speed && (
                                  <div className="mt-2 text-sm">
                                    <span className="text-blue-700">Speed:</span>
                                    <span className="font-medium ml-2">{displayVehicle.gps_speed} km/h</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Track Vehicle Button */}
                            {displayVehicle.live_tracking_enabled && (
                              <div className="mt-3 pt-3 border-t border-blue-200">
                                <button
                                  onClick={() => {
                                    // Find route for this vehicle and open tracking
                                    if (displayVehicle.routes?.id) {
                                      setIsLiveTrackingOpen(true);
                                    } else {
                                      toast.error('Vehicle must be assigned to a route for live tracking');
                                    }
                                  }}
                                  className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 text-sm"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span>Track Vehicle Live</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                <Navigation className="w-4 h-4 text-gray-400" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-600">No GPS Device Assigned</p>
                                <p className="text-sm text-gray-500">Assign a GPS device to enable live tracking</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Route Assignment */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Route Assignment</h3>
                      <div className="p-4 border border-gray-200 rounded-lg">
                        {displayVehicle.routes ? (
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <RouteIcon className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{displayVehicle.routes.route_number} - {displayVehicle.routes.route_name}</h4>
                              <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                                <div className="flex items-center space-x-1">
                                  <MapPin className="w-3 h-3" />
                                  <span>{displayVehicle.routes.start_location} → {displayVehicle.routes.end_location}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{displayVehicle.routes.duration}</span>
                                </div>
                              </div>
                              <div className="flex items-center space-x-4 mt-2">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  displayVehicle.routes.status === 'active' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {displayVehicle.routes.status}
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

                    {/* Driver Assignment */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Driver Assignment</h3>
                      <div className="p-4 border border-gray-200 rounded-lg">
                        {displayVehicle.drivers ? (
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                              <UserCheck className="w-5 h-5 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{displayVehicle.drivers.name}</h4>
                              {displayVehicle.drivers.license_number && (
                                <p className="text-xs text-gray-500">License: {displayVehicle.drivers.license_number}</p>
                              )}
                              <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                                {displayVehicle.drivers.phone && (
                                  <div className="flex items-center space-x-1">
                                    <Phone className="w-3 h-3" />
                                    <span>{displayVehicle.drivers.phone}</span>
                                  </div>
                                )}
                                {displayVehicle.drivers.email && (
                                  <div className="flex items-center space-x-1">
                                    <Mail className="w-3 h-3" />
                                    <span>{displayVehicle.drivers.email}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center space-x-4 mt-2">
                                {displayVehicle.drivers.status && (
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    displayVehicle.drivers.status === 'active' 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {displayVehicle.drivers.status}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-500">No driver assigned</p>
                          </div>
                        )}
                      </div>
            </div>
            
                    {/* Metadata */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
                      <div className="space-y-2 text-sm">
                        {displayVehicle.created_at && (
                          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-2">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-600">Created</span>
                            </div>
                            <span className="text-gray-900">{new Date(displayVehicle.created_at).toLocaleDateString()}</span>
                          </div>
                        )}
                        {displayVehicle.updated_at && (
                          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-2">
                              <FileText className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-600">Last Updated</span>
                            </div>
                            <span className="text-gray-900">{new Date(displayVehicle.updated_at).toLocaleDateString()}</span>
                          </div>
                        )}
                        {displayVehicle.assigned_route_id && (
                          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-2">
                              <RouteIcon className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-600">Route ID</span>
                            </div>
                            <span className="text-gray-900">{displayVehicle.assigned_route_id}</span>
                          </div>
                        )}
                      </div>
                    </div>
            </div>
          </div>
        </div>

              {/* Footer */}
              <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
            Close
          </button>
        </div>
      </motion.div>
    </div>
        </div>
      )}

      {/* Live GPS Tracking Modal */}
      {isLiveTrackingOpen && displayVehicle?.routes && (
        <LiveGPSTrackingModal
          isOpen={isLiveTrackingOpen}
          onClose={() => setIsLiveTrackingOpen(false)}
          route={displayVehicle.routes}
          title={`Live Tracking - ${displayVehicle.registration_number}`}
        />
      )}
    </AnimatePresence>
  );
};

export default VehicleDetailsModal; 