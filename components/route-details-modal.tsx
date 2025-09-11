'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  MapPin,
  Clock,
  Users,
  Car,
  Navigation,
  Activity,
  Star,
  Route as RouteIcon,
  User,
  Truck,
  DollarSign,
  Calendar,
  Phone,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  Gauge
} from 'lucide-react';
import { DatabaseService } from '@/lib/database';
import LiveTrackingMap from './live-tracking-map';

interface RouteDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: any;
}

const RouteDetailsModal: React.FC<RouteDetailsModalProps> = ({
  isOpen,
  onClose,
  route
}) => {
  const [detailedRoute, setDetailedRoute] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiveTrackingOpen, setIsLiveTrackingOpen] = useState(false);

  // Fetch detailed route information when modal opens
  useEffect(() => {
    if (isOpen && route?.id) {
      fetchDetailedRouteInfo();
    }
  }, [isOpen, route?.id]);

  const fetchDetailedRouteInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching detailed route info for route:', route?.id);

      // Get all route stops with detailed information
      const stopsResponse = await fetch('/api/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getRouteStops', routeId: route.id })
      });
      const stopsResult = await stopsResponse.json();
      const routeStops = stopsResult.success ? stopsResult.data : [];
      console.log('Route stops fetched:', routeStops);

      // Fetch driver and vehicle details if we have IDs but not full objects
      let driverInfo = route.drivers;
      let vehicleInfo = route.vehicles;

      // If we have driver_id but no driver object, fetch driver details
      if (route.driver_id && !route.drivers) {
        try {
          const driversResponse = await fetch('/api/admin/drivers');
          const driversResult = await driversResponse.json();
          if (driversResult.success) {
            const allDrivers = driversResult.data || [];
            const foundDriver = allDrivers.find((d: any) => d.id === route.driver_id);
            if (foundDriver) {
              // Map the driver data to match expected structure
              driverInfo = {
                id: foundDriver.id,
                name: foundDriver.driver_name,
                phone: foundDriver.phone_number,
                email: foundDriver.email,
                license_number: foundDriver.license_number,
                rating: foundDriver.rating,
                status: foundDriver.status
              };
              console.log('Fetched driver info:', driverInfo);
            }
          }
        } catch (error) {
          console.warn('Could not fetch driver details:', error);
        }
      }

      // If we have vehicle_id but no vehicle object, fetch vehicle details
      if (route.vehicle_id && !route.vehicles) {
        try {
          const vehiclesResponse = await fetch('/api/admin/vehicles');
          const vehiclesResult = await vehiclesResponse.json();
          if (vehiclesResult.success) {
            const allVehicles = vehiclesResult.data || [];
            const foundVehicle = allVehicles.find((v: any) => v.id === route.vehicle_id);
            if (foundVehicle) {
              // Map vehicle data to match expected structure
              vehicleInfo = {
                id: foundVehicle.id,
                registration_number: foundVehicle.registration_number || foundVehicle.vehicle_number,
                model: foundVehicle.model,
                capacity: foundVehicle.capacity,
                fuel_type: foundVehicle.fuel_type,
                status: foundVehicle.status
              };
              console.log('Fetched vehicle info:', vehicleInfo);
            }
          }
        } catch (error) {
          console.warn('Could not fetch vehicle details:', error);
        }
      }

      // Combine the original route data with detailed information
      const enhanced = {
        ...route,
        route_stops: routeStops || [],
        drivers: driverInfo || null,
        vehicles: vehicleInfo || null,
        // Ensure all required fields have default values
        start_location: route.start_location || 'Unknown Start',
        end_location: route.end_location || 'Unknown End',
        distance: route.distance || 0,
        duration: route.duration || 'Not specified',
        fare: route.fare || 0,
        total_capacity: route.total_capacity || route.capacity || 0,
        current_passengers: route.current_passengers || 0,
        departure_time: route.departure_time || 'Not scheduled',
        arrival_time: route.arrival_time || 'Not scheduled',
      };

      console.log('Enhanced route data:', enhanced);
      setDetailedRoute(enhanced);
      
    } catch (error) {
      console.error('Error fetching detailed route info:', error);
      setError('Failed to load detailed route information');
      // Fallback to original route data
      setDetailedRoute(route);
    } finally {
      setLoading(false);
    }
  };

  const handleLiveTrack = () => {
    setIsLiveTrackingOpen(true);
  };

  if (!route) return null;

  const displayRoute = detailedRoute || route;
  const hasGPSCoordinates = (displayRoute.start_latitude && displayRoute.start_longitude) || 
                           (displayRoute.route_stops && displayRoute.route_stops.some((stop: any) => stop.latitude && stop.longitude));
  const canTrack = displayRoute.status === 'active' && hasGPSCoordinates;

  const occupancyPercentage = displayRoute.current_passengers && displayRoute.total_capacity > 0 
    ? (displayRoute.current_passengers / displayRoute.total_capacity) * 100 
    : 0;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div key="route-details-modal" className="fixed inset-0 z-50 overflow-y-auto">
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
                    displayRoute.status === 'active' ? 'bg-green-100' : 
                    displayRoute.status === 'maintenance' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <RouteIcon className={`w-6 h-6 ${
                      displayRoute.status === 'active' ? 'text-green-600' : 
                      displayRoute.status === 'maintenance' ? 'text-yellow-600' : 'text-red-600'
                    }`} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Route {displayRoute.route_number}</h2>
                    <p className="text-gray-600">{displayRoute.route_name}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {loading && (
                    <div className="flex items-center space-x-2 text-sm text-blue-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading details...</span>
                    </div>
                  )}
                  {hasGPSCoordinates && (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                      <Navigation className="w-3 h-3" />
                      GPS Ready
                    </span>
                  )}
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                    displayRoute.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : displayRoute.status === 'maintenance'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {displayRoute.status}
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
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Route Information */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Route Information</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Start Location</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{displayRoute.start_location}</span>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">End Location</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{displayRoute.end_location}</span>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Navigation className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Distance</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{displayRoute.distance} km</span>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Clock className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Duration</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{displayRoute.duration}</span>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <DollarSign className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Fare</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">₹{displayRoute.fare}</span>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Total Stops</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{displayRoute.route_stops?.length || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* GPS Tracking Information */}
                    {(displayRoute.start_latitude || displayRoute.end_latitude) && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Live Tracking Coordinates</h3>
                        <div className="space-y-3">
                          {displayRoute.start_latitude && displayRoute.start_longitude && (
                            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                    <span className="text-green-600">🚌</span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-green-900">Starting Point GPS</p>
                                    <p className="text-xs text-green-700">{displayRoute.start_location}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-green-600 font-mono">
                                    {displayRoute.start_latitude.toFixed(6)}, {displayRoute.start_longitude.toFixed(6)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {displayRoute.end_latitude && displayRoute.end_longitude && (
                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                                    <span className="text-red-600">🏁</span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-red-900">Destination GPS</p>
                                    <p className="text-xs text-red-700">{displayRoute.end_location}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-red-600 font-mono">
                                    {displayRoute.end_latitude.toFixed(6)}, {displayRoute.end_longitude.toFixed(6)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="p-3 bg-blue-50 rounded-lg">
                            <div className="flex items-center space-x-2">
                              <Activity className="w-4 h-4 text-blue-600" />
                              <span className="text-sm text-blue-700 font-medium">Live Tracking Status:</span>
                              <span className="text-sm text-blue-900">
                                {displayRoute.start_latitude && displayRoute.end_latitude ? 'Enabled' : 'Partial Setup'}
                              </span>
                            </div>
                            {(!displayRoute.start_latitude || !displayRoute.end_latitude) && (
                              <p className="text-xs text-blue-600 mt-1">
                                Complete GPS setup in route edit to enable full live tracking
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Capacity & Occupancy */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Capacity & Occupancy</h3>
                      <div className="space-y-3">
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-blue-900">Current Occupancy</span>
                            <span className="text-lg font-bold text-blue-900">
                              {displayRoute.current_passengers || 0}/{displayRoute.total_capacity || displayRoute.capacity || 0}
                            </span>
                          </div>
                          <div className="w-full bg-blue-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                occupancyPercentage > 90 ? 'bg-red-500' :
                                occupancyPercentage > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${occupancyPercentage}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-blue-700 mt-1">
                            {occupancyPercentage.toFixed(1)}% capacity utilized
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Assignments & Operational Info */}
                  <div className="space-y-6">
                    
                    {/* Driver Assignment */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Driver Assignment</h3>
                      <div className="p-4 border border-gray-200 rounded-lg">
                        {displayRoute.drivers ? (
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{displayRoute.drivers.name}</h4>
                              {displayRoute.drivers.license_number && (
                                <p className="text-xs text-gray-500">License: {displayRoute.drivers.license_number}</p>
                              )}
                              <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                                {displayRoute.drivers.phone && (
                                  <div className="flex items-center space-x-1">
                                    <Phone className="w-3 h-3" />
                                    <span>{displayRoute.drivers.phone}</span>
                                  </div>
                                )}
                                {displayRoute.drivers.email && (
                                  <div className="flex items-center space-x-1">
                                    <Mail className="w-3 h-3" />
                                    <span>{displayRoute.drivers.email}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center space-x-4 mt-2">
                                {displayRoute.drivers.rating && (
                                  <div className="flex items-center space-x-1">
                                  <Star className="w-4 h-4 text-yellow-400" />
                                    <span className="text-sm text-gray-600">{displayRoute.drivers.rating}/5</span>
                                </div>
                              )}
                                {displayRoute.drivers.status && (
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    displayRoute.drivers.status === 'active' 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {displayRoute.drivers.status}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <User className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-500">No driver assigned</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vehicle Assignment */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Assignment</h3>
                      <div className="p-4 border border-gray-200 rounded-lg">
                        {displayRoute.vehicles ? (
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                              <Truck className="w-5 h-5 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{displayRoute.vehicles.registration_number}</h4>
                              <div className="text-sm text-gray-600 space-y-1">
                                <p>{displayRoute.vehicles.model || 'Model not specified'}</p>
                                <div className="flex items-center space-x-4">
                                  <div className="flex items-center space-x-1">
                                    <Users className="w-3 h-3" />
                                    <span>Capacity: {displayRoute.vehicles.capacity || 'Not specified'}</span>
                                  </div>
                                  {displayRoute.vehicles.fuel_type && (
                                    <div className="flex items-center space-x-1">
                                      <Gauge className="w-3 h-3" />
                                      <span>Fuel: {displayRoute.vehicles.fuel_type}</span>
                                    </div>
                                  )}
                                </div>
                                {displayRoute.vehicles.status && (
                                  <div className="mt-2">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      displayRoute.vehicles.status === 'active' 
                                        ? 'bg-green-100 text-green-800' 
                                        : displayRoute.vehicles.status === 'maintenance'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {displayRoute.vehicles.status}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <Truck className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-500">No vehicle assigned</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Route Stops */}
                    {displayRoute.route_stops && displayRoute.route_stops.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Route Stops ({displayRoute.route_stops.length})</h3>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {displayRoute.route_stops.map((stop: any, index: number) => (
                            <div key={index} className={`p-4 rounded-lg border ${
                              index === 0 
                                ? 'bg-green-50 border-green-200' 
                                : index === displayRoute.route_stops.length - 1
                                ? 'bg-red-50 border-red-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}>
                              <div className="flex items-start space-x-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                  index === 0 
                                    ? 'bg-green-100 text-green-800' 
                                    : index === displayRoute.route_stops.length - 1
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-blue-100 text-blue-600'
                                }`}>
                                  {index === 0 ? '🚌' : index === displayRoute.route_stops.length - 1 ? '🏁' : index + 1}
                                </div>
                                
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium text-gray-900">{stop.stop_name || `Stop ${index + 1}`}</p>
                                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                                        <div className="flex items-center space-x-1">
                                          <Clock className="w-3 h-3" />
                                          <span>
                                            {index === 0 ? 'Departure: ' : 'Arrival: '}
                                            {stop.stop_time || stop.time || 'Not specified'}
                                          </span>
                                        </div>
                                        {stop.is_major_stop && (
                                          <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                                            Major Stop
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {(index === 0 || index === displayRoute.route_stops.length - 1) && (
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        index === 0 
                                          ? 'bg-green-100 text-green-800' 
                                          : 'bg-red-100 text-red-800'
                                      }`}>
                                        {index === 0 ? 'Starting Point' : 'Destination'}
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* GPS Coordinates */}
                                  {(stop.latitude && stop.longitude) && (
                                    <div className={`p-2 rounded text-xs ${
                                      index === 0 
                                        ? 'bg-green-100 text-green-700' 
                                        : index === displayRoute.route_stops.length - 1
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      <div className="flex items-center space-x-1">
                                        <MapPin className="w-3 h-3" />
                                        <span className="font-medium">GPS:</span>
                                        <span>{stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}</span>
                                      </div>
                              </div>
                                )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Route Summary */}
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-1">
                                <Navigation className="w-4 h-4 text-blue-600" />
                                <span className="text-blue-700 font-medium">Total Journey:</span>
                                <span className="text-blue-900">{displayRoute.departure_time} → {displayRoute.arrival_time}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <MapPin className="w-4 h-4 text-blue-600" />
                                <span className="text-blue-700 font-medium">Stops:</span>
                                <span className="text-blue-900">{displayRoute.route_stops.length} total</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
                      <div className="space-y-2 text-sm">
                        {displayRoute.created_at && (
                          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-2">
                              <Calendar className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-600">Created</span>
                            </div>
                            <span className="text-gray-900">{new Date(displayRoute.created_at).toLocaleDateString()}</span>
                          </div>
                        )}
                        {displayRoute.updated_at && (
                          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-2">
                              <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-600">Last Updated</span>
                            </div>
                            <span className="text-gray-900">{new Date(displayRoute.updated_at).toLocaleDateString()}</span>
                          </div>
                        )}
                        {displayRoute.driver_id && (
                          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-2">
                              <User className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-600">Driver ID</span>
                            </div>
                            <span className="text-gray-900">{displayRoute.driver_id}</span>
                          </div>
                        )}
                        {displayRoute.vehicle_id && (
                          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-2">
                              <Truck className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-600">Vehicle ID</span>
                            </div>
                            <span className="text-gray-900">{displayRoute.vehicle_id}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center space-x-3 p-6 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  {canTrack ? (
                    <div className="flex items-center space-x-1 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Ready for live tracking</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1 text-orange-600">
                      <AlertCircle className="w-4 h-4" />
                      <span>GPS setup required for live tracking</span>
                    </div>
                  )}
                </div>
                <div className="flex space-x-3">
                  {canTrack && (
                    <button
                      onClick={handleLiveTrack}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>Live Track Route</span>
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
        )}
      </AnimatePresence>

      {/* Live Tracking Map */}
      <LiveTrackingMap
        isOpen={isLiveTrackingOpen}
        onClose={() => setIsLiveTrackingOpen(false)}
        routeData={displayRoute}
        vehicleFilter={displayRoute?.route_number || 'all'}
        title={`Live Tracking - Route ${displayRoute?.route_number} (${displayRoute?.route_name})`}
      />
    </>
  );
};

export default RouteDetailsModal; 