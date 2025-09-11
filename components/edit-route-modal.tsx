'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, MapPin, Clock, Trash2, ArrowUp, ArrowDown, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';

interface Stop {
  id?: string;
  stop_name: string;
  stop_time: string;
  sequence_order: number;
  latitude?: number;
  longitude?: number;
  is_major_stop: boolean;
}

interface EditRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  route: any;
}

export default function EditRouteModal({ isOpen, onClose, onSuccess, route }: EditRouteModalProps) {
  const [loading, setLoading] = useState(false);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'basic' | 'stops' | 'assignment'>('basic');
  
  const [formData, setFormData] = useState({
    route_number: '',
    route_name: '',
    start_location: '',
    end_location: '',
    start_latitude: '',
    start_longitude: '',
    end_latitude: '',
    end_longitude: '',
    departure_time: '',
    arrival_time: '',
    distance: '',
    duration: '',
    total_capacity: '',
    fare: '',
    driver_id: '',
    vehicle_id: '',
    status: 'active'
  });

  const [stops, setStops] = useState<Stop[]>([]);
  const [newStop, setNewStop] = useState<Omit<Stop, 'sequence_order'>>({
    stop_name: '',
    stop_time: '',
    is_major_stop: false
  });
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);

  const [errors, setErrors] = useState<any>({});

  useEffect(() => {
    if (isOpen && route) {
      loadRouteData();
      fetchDriversAndVehicles();
      fetchRouteStops();
    }
  }, [isOpen, route]);

  const loadRouteData = () => {
    if (!route) return;
    
    setFormData({
      route_number: route.route_number || '',
      route_name: route.route_name || '',
      start_location: route.start_location || '',
      end_location: route.end_location || '',
      start_latitude: route.start_latitude?.toString() || '',
      start_longitude: route.start_longitude?.toString() || '',
      end_latitude: route.end_latitude?.toString() || '',
      end_longitude: route.end_longitude?.toString() || '',
      departure_time: route.departure_time || '',
      arrival_time: route.arrival_time || '',
      distance: route.distance?.toString() || '',
      duration: route.duration || '',
      total_capacity: route.total_capacity?.toString() || '',
      fare: route.fare?.toString() || '',
      driver_id: route.driver_id || '',
      vehicle_id: route.vehicle_id || '',
      status: route.status || 'active'
    });
  };

  const fetchDriversAndVehicles = async () => {
    try {
      const [driversResponse, vehiclesResponse] = await Promise.all([
        fetch('/api/admin/drivers'),
        fetch('/api/admin/vehicles')
      ]);

      const driversResult = await driversResponse.json();
      const vehiclesResult = await vehiclesResponse.json();

      const driversData = driversResult.success ? driversResult.data : [];
      const vehiclesData = vehiclesResult.success ? vehiclesResult.data : [];

      const activeDrivers = driversData.filter((d: any) => d.status === 'active');
      const activeVehicles = vehiclesData.filter((v: any) => v.status === 'active');
      
      setDrivers(activeDrivers);
      setVehicles(activeVehicles);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchRouteStops = async () => {
    if (!route?.id) return;
    
    try {
      setStopsLoading(true);
      const stopsResponse = await fetch('/api/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getRouteStops', routeId: route.id })
      });
      const stopsResult = await stopsResponse.json();
      const stopsData = stopsResult.success ? stopsResult.data : [];
      setStops(stopsData);
    } catch (error) {
      console.error('Error fetching route stops:', error);
      toast.error('Failed to load route stops');
    } finally {
      setStopsLoading(false);
    }
  };

  const addStopToRoute = async () => {
    if (!newStop.stop_name.trim() || !newStop.stop_time) {
      toast.error('Please enter stop name and time');
      return;
    }

    try {
      setLoading(true);
      const insertAfter = insertAfterIndex !== null ? stops[insertAfterIndex].sequence_order : undefined;
      
      console.log('Adding stop to route:', route.id, newStop, insertAfter);
      
      // Call the API to add the stop
      const response = await fetch(`/api/admin/routes/${route.id}/stops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          stopData: {
            stop_name: newStop.stop_name.trim(),
            stop_time: newStop.stop_time,
            is_major_stop: newStop.is_major_stop
          },
          insertAfterSequence: insertAfter
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add stop');
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to add stop');
      }
      
      // Refresh stops to show the new one
      await fetchRouteStops();
      
      // Reset form
      setNewStop({
        stop_name: '',
        stop_time: '',
        is_major_stop: false
      });
      setInsertAfterIndex(null);
      
      toast.success('Stop added successfully!');
    } catch (error: any) {
      console.error('Error adding stop:', error);
      toast.error(error.message || 'Failed to add stop');
    } finally {
      setLoading(false);
    }
  };

  const deleteStopFromRoute = async (stopId: string, stopName: string) => {
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete the stop "${stopName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      
      console.log('Deleting stop from route:', route.id, stopId);
      
      // Call the API to delete the stop
      const response = await fetch(`/api/admin/routes/${route.id}/stops?stopId=${stopId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete stop');
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete stop');
      }
      
      // Refresh stops to show the updated list
      await fetchRouteStops();
      
      toast.success('Stop deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting stop:', error);
      toast.error(error.message || 'Failed to delete stop');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setActiveTab('basic');
      return;
    }

    setLoading(true);
    try {
      const routeData = {
        route_number: formData.route_number,
        route_name: formData.route_name,
        start_location: formData.start_location,
        end_location: formData.end_location,
        start_latitude: formData.start_latitude ? parseFloat(formData.start_latitude) : null,
        start_longitude: formData.start_longitude ? parseFloat(formData.start_longitude) : null,
        end_latitude: formData.end_latitude ? parseFloat(formData.end_latitude) : null,
        end_longitude: formData.end_longitude ? parseFloat(formData.end_longitude) : null,
        departure_time: formData.departure_time,
        arrival_time: formData.arrival_time,
        distance: parseInt(formData.distance),
        duration: formData.duration,
        total_capacity: parseInt(formData.total_capacity),
        fare: parseInt(formData.fare),
        status: formData.status,
        driver_id: formData.driver_id || null,
        vehicle_id: formData.vehicle_id || null
      };

      // Call the route update API
      const response = await fetch('/api/admin/routes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          routeId: route.id,
          routeData: routeData
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update route');
      }

      toast.success('Route updated successfully!');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error updating route:', error);
      toast.error(error.message || 'Failed to update route');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: any = {};

    if (!formData.route_number.trim()) newErrors.route_number = 'Route number is required';
    if (!formData.route_name.trim()) newErrors.route_name = 'Route name is required';
    if (!formData.start_location.trim()) newErrors.start_location = 'Start location is required';
    if (!formData.end_location.trim()) newErrors.end_location = 'End location is required';
    if (!formData.departure_time) newErrors.departure_time = 'Departure time is required';
    if (!formData.arrival_time) newErrors.arrival_time = 'Arrival time is required';
    if (!formData.distance) newErrors.distance = 'Distance is required';
    if (!formData.duration.trim()) newErrors.duration = 'Duration is required';
    if (!formData.total_capacity) newErrors.total_capacity = 'Capacity is required';
    if (!formData.fare) newErrors.fare = 'Fare is required';

    if (formData.departure_time && formData.arrival_time) {
      if (formData.departure_time >= formData.arrival_time) {
        newErrors.arrival_time = 'Arrival time must be after departure time';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleClose = () => {
    setStops([]);
    setNewStop({
      stop_name: '',
      stop_time: '',
      is_major_stop: false
    });
    setInsertAfterIndex(null);
    setErrors({});
    setActiveTab('basic');
    onClose();
  };

  if (!isOpen || !route) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            Edit Route: {route.route_number}
          </h2>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('basic')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'basic'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Basic Information
          </button>
          <button
            onClick={() => setActiveTab('stops')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'stops'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Route Stops ({stops.length})
          </button>
          <button
            onClick={() => setActiveTab('assignment')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'assignment'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Driver & Vehicle Assignment
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Basic Information Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Route Number *</label>
                  <input
                    type="text"
                    value={formData.route_number}
                    onChange={(e) => setFormData({ ...formData, route_number: e.target.value })}
                    className={`input ${errors.route_number ? 'border-red-500' : ''}`}
                    placeholder="01"
                  />
                  {errors.route_number && <p className="text-red-500 text-xs mt-1">{errors.route_number}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Route Name *</label>
                  <input
                    type="text"
                    value={formData.route_name}
                    onChange={(e) => setFormData({ ...formData, route_name: e.target.value })}
                    className={`input ${errors.route_name ? 'border-red-500' : ''}`}
                    placeholder="City - College Express"
                  />
                  {errors.route_name && <p className="text-red-500 text-xs mt-1">{errors.route_name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Location *</label>
                  <input
                    type="text"
                    value={formData.start_location}
                    onChange={(e) => setFormData({ ...formData, start_location: e.target.value })}
                    className={`input ${errors.start_location ? 'border-red-500' : ''}`}
                  />
                  {errors.start_location && <p className="text-red-500 text-xs mt-1">{errors.start_location}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Location *</label>
                  <input
                    type="text"
                    value={formData.end_location}
                    onChange={(e) => setFormData({ ...formData, end_location: e.target.value })}
                    className={`input ${errors.end_location ? 'border-red-500' : ''}`}
                  />
                  {errors.end_location && <p className="text-red-500 text-xs mt-1">{errors.end_location}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Departure Time *</label>
                  <input
                    type="time"
                    value={formData.departure_time}
                    onChange={(e) => setFormData({ ...formData, departure_time: e.target.value })}
                    className={`input ${errors.departure_time ? 'border-red-500' : ''}`}
                  />
                  {errors.departure_time && <p className="text-red-500 text-xs mt-1">{errors.departure_time}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Arrival Time *</label>
                  <input
                    type="time"
                    value={formData.arrival_time}
                    onChange={(e) => setFormData({ ...formData, arrival_time: e.target.value })}
                    className={`input ${errors.arrival_time ? 'border-red-500' : ''}`}
                  />
                  {errors.arrival_time && <p className="text-red-500 text-xs mt-1">{errors.arrival_time}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Distance (km) *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.distance}
                    onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                    className={`input ${errors.distance ? 'border-red-500' : ''}`}
                  />
                  {errors.distance && <p className="text-red-500 text-xs mt-1">{errors.distance}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration *</label>
                  <input
                    type="text"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className={`input ${errors.duration ? 'border-red-500' : ''}`}
                    placeholder="1h 30m"
                  />
                  {errors.duration && <p className="text-red-500 text-xs mt-1">{errors.duration}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Capacity *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.total_capacity}
                    onChange={(e) => setFormData({ ...formData, total_capacity: e.target.value })}
                    className={`input ${errors.total_capacity ? 'border-red-500' : ''}`}
                  />
                  {errors.total_capacity && <p className="text-red-500 text-xs mt-1">{errors.total_capacity}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Fare (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.fare}
                    onChange={(e) => setFormData({ ...formData, fare: e.target.value })}
                    className={`input ${errors.fare ? 'border-red-500' : ''}`}
                  />
                  {errors.fare && <p className="text-red-500 text-xs mt-1">{errors.fare}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="input"
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Route Stops Tab */}
          {activeTab === 'stops' && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Manage Route Stops</h3>
                <p className="text-blue-700 text-sm">
                  Add new stops or manage existing ones. Choose where to insert new stops in the route sequence.
                </p>
              </div>

              {/* Add New Stop */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Add New Stop</h4>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <input
                      type="text"
                      value={newStop.stop_name}
                      onChange={(e) => setNewStop({ ...newStop, stop_name: e.target.value })}
                      className="input"
                      placeholder="Stop name"
                    />
                  </div>
                  <div>
                    <input
                      type="time"
                      value={newStop.stop_time}
                      onChange={(e) => setNewStop({ ...newStop, stop_time: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <select
                      value={insertAfterIndex !== null ? insertAfterIndex : ''}
                      onChange={(e) => setInsertAfterIndex(e.target.value ? parseInt(e.target.value) : null)}
                      className="input"
                    >
                      <option value="">Add to end</option>
                      {stops.map((stop, index) => (
                        <option key={index} value={index}>
                          After: {stop.stop_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center space-x-1">
                      <input
                        type="checkbox"
                        checked={newStop.is_major_stop}
                        onChange={(e) => setNewStop({ ...newStop, is_major_stop: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm">Major</span>
                    </label>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={addStopToRoute}
                      disabled={loading}
                      className="btn-primary w-full flex items-center justify-center space-x-1"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Add</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Stops List */}
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">Current Stops ({stops.length})</h4>
                {stopsLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-gray-500">Loading stops...</p>
                  </div>
                ) : stops.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>No stops configured for this route yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stops.map((stop, index) => (
                      <div key={stop.id || index} className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg">
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-medium text-gray-600 bg-white px-2 py-1 rounded">
                            {stop.sequence_order}
                          </span>
                        </div>
                        
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <p className="font-medium text-gray-900">{stop.stop_name}</p>
                            {stop.is_major_stop && (
                              <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mt-1">
                                Major Stop
                              </span>
                            )}
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Clock className="w-4 h-4 mr-1" />
                            {stop.stop_time}
                          </div>
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => stop.id && deleteStopFromRoute(stop.id, stop.stop_name)}
                              disabled={loading || !stop.id}
                              className="p-1 text-red-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete stop"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Assignment Tab */}
          {activeTab === 'assignment' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign Driver</label>
                  <select
                    value={formData.driver_id}
                    onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })}
                    className="input"
                  >
                    <option value="">Select a driver</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.driver_name} - {driver.license_number}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign Vehicle</label>
                  <select
                    value={formData.vehicle_id}
                    onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                    className="input"
                  >
                    <option value="">Select a vehicle</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.registration_number} - {vehicle.model} (Capacity: {vehicle.capacity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t mt-6">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Update Route</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
} 