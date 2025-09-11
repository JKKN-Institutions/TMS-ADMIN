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

interface AddRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddRouteModal({ isOpen, onClose, onSuccess }: AddRouteModalProps) {
  const [loading, setLoading] = useState(false);
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
    vehicle_id: ''
  });

  const [stops, setStops] = useState<Stop[]>([]);
  const [newStop, setNewStop] = useState<Omit<Stop, 'sequence_order'>>({
    stop_name: '',
    stop_time: '',
    latitude: undefined,
    longitude: undefined,
    is_major_stop: false
  });

  const [errors, setErrors] = useState<any>({});
  const [completedSteps, setCompletedSteps] = useState({
    basic: false,
    stops: false,
    assignment: false
  });

  useEffect(() => {
    if (isOpen) {
      fetchDriversAndVehicles();
    }
  }, [isOpen]);

  // Check step completion status without side effects
  const isBasicInfoComplete = () => {
    return !!(
      formData.route_number.trim() &&
      formData.route_name.trim() &&
      formData.start_location.trim() &&
      formData.end_location.trim() &&
      formData.departure_time &&
      formData.arrival_time &&
      formData.distance &&
      formData.duration.trim() &&
      formData.total_capacity &&
      formData.fare &&
      formData.departure_time < formData.arrival_time
    );
  };

  // Check step completion status
  useEffect(() => {
    setCompletedSteps({
      basic: isBasicInfoComplete(),
      stops: stops.length > 0,
      assignment: true // Assignment is optional
    });
  }, [formData, stops]);

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

  const validateCoordinates = (lat: string, lng: string, fieldPrefix: string) => {
    const errors: any = {};
    
    if (lat && lng) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      
      if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        errors[`${fieldPrefix}_latitude`] = 'Latitude must be between -90 and 90';
      }
      if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        errors[`${fieldPrefix}_longitude`] = 'Longitude must be between -180 and 180';
      }
    } else if (lat || lng) {
      // If only one coordinate is provided, both are required
      if (!lat) errors[`${fieldPrefix}_latitude`] = 'Latitude is required when longitude is provided';
      if (!lng) errors[`${fieldPrefix}_longitude`] = 'Longitude is required when latitude is provided';
    }
    
    return errors;
  };

  const validateStopTimes = () => {
    const errors: any = {};
    
    if (stops.length === 0) return errors;
    
    const departureMinutes = timeToMinutes(formData.departure_time);
    const arrivalMinutes = timeToMinutes(formData.arrival_time);
    
    // Check if stops are in chronological order
    for (let i = 0; i < stops.length; i++) {
      const stopMinutes = timeToMinutes(stops[i].stop_time);
      
      // First stop should equal departure time (since it's the starting location)
      if (i === 0 && stopMinutes !== departureMinutes) {
        errors.stops_sequence = 'Starting location time must match departure time';
        break;
      }
      
      // Last stop should be before arrival time
      if (i === stops.length - 1 && stopMinutes >= arrivalMinutes) {
        errors.stops_sequence = 'Last stop time must be before arrival time';
        break;
      }
      
      // Each intermediate stop should be after the previous one
      if (i > 0) {
        const prevStopMinutes = timeToMinutes(stops[i - 1].stop_time);
        if (stopMinutes <= prevStopMinutes) {
          errors.stops_sequence = `Stop "${stops[i].stop_name}" time must be after previous stop`;
          break;
        }
      }
    }
    
    return errors;
  };

  const timeToMinutes = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const validateBasicInfo = () => {
    const newErrors: any = {};

    // Basic required fields
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

    // Time sequence validation
    if (formData.departure_time && formData.arrival_time) {
      const depMinutes = timeToMinutes(formData.departure_time);
      const arrMinutes = timeToMinutes(formData.arrival_time);
      
      if (arrMinutes <= depMinutes) {
        newErrors.arrival_time = 'Arrival time must be after departure time';
      }
    }

    // Coordinate validation
    const startCoordErrors = validateCoordinates(
      formData.start_latitude, 
      formData.start_longitude, 
      'start'
    );
    const endCoordErrors = validateCoordinates(
      formData.end_latitude, 
      formData.end_longitude, 
      'end'
    );
    
    Object.assign(newErrors, startCoordErrors, endCoordErrors);

    // Numeric validation
    if (formData.distance && parseFloat(formData.distance) <= 0) {
      newErrors.distance = 'Distance must be greater than 0';
    }
    if (formData.total_capacity && parseInt(formData.total_capacity) <= 0) {
      newErrors.total_capacity = 'Capacity must be greater than 0';
    }
    if (formData.fare && parseFloat(formData.fare) <= 0) {
      newErrors.fare = 'Fare must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateForm = () => {
    const newErrors: any = {};

    // Basic required fields
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

    // Time sequence validation
    if (formData.departure_time && formData.arrival_time) {
      const depMinutes = timeToMinutes(formData.departure_time);
      const arrMinutes = timeToMinutes(formData.arrival_time);
      
      if (arrMinutes <= depMinutes) {
        newErrors.arrival_time = 'Arrival time must be after departure time';
      }
    }

    // Coordinate validation
    const startCoordErrors = validateCoordinates(
      formData.start_latitude, 
      formData.start_longitude, 
      'start'
    );
    const endCoordErrors = validateCoordinates(
      formData.end_latitude, 
      formData.end_longitude, 
      'end'
    );
    
    Object.assign(newErrors, startCoordErrors, endCoordErrors);

    // Stop time sequence validation
    const stopTimeErrors = validateStopTimes();
    Object.assign(newErrors, stopTimeErrors);

    // Numeric validation
    if (formData.distance && parseFloat(formData.distance) <= 0) {
      newErrors.distance = 'Distance must be greater than 0';
    }
    if (formData.total_capacity && parseInt(formData.total_capacity) <= 0) {
      newErrors.total_capacity = 'Capacity must be greater than 0';
    }
    if (formData.fare && parseFloat(formData.fare) <= 0) {
      newErrors.fare = 'Fare must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addStartingLocationAsFirstStop = () => {
    // Only add if no stops exist yet
    if (stops.length > 0) return;

    const startingStop: Stop = {
      stop_name: formData.start_location,
      stop_time: formData.departure_time,
      latitude: formData.start_latitude ? parseFloat(formData.start_latitude) : undefined,
      longitude: formData.start_longitude ? parseFloat(formData.start_longitude) : undefined,
      sequence_order: 1,
      is_major_stop: true // Starting location is always a major stop
    };

    setStops([startingStop]);
  };

  const addStop = () => {
    if (!newStop.stop_name.trim() || !newStop.stop_time) {
      toast.error('Please enter stop name and time');
      return;
    }

    // Validate coordinates if provided
    if ((newStop.latitude !== undefined && newStop.longitude === undefined) || 
        (newStop.latitude === undefined && newStop.longitude !== undefined)) {
      toast.error('Both latitude and longitude are required for GPS coordinates');
      return;
    }

    if (newStop.latitude !== undefined && newStop.longitude !== undefined) {
      if (newStop.latitude < -90 || newStop.latitude > 90) {
        toast.error('Latitude must be between -90 and 90');
        return;
      }
      if (newStop.longitude < -180 || newStop.longitude > 180) {
        toast.error('Longitude must be between -180 and 180');
        return;
      }
    }

    const stop: Stop = {
      ...newStop,
      sequence_order: stops.length + 1
    };

    setStops([...stops, stop]);
    setNewStop({
      stop_name: '',
      stop_time: '',
      latitude: undefined,
      longitude: undefined,
      is_major_stop: false
    });
  };

  const removeStop = (index: number) => {
    // Prevent removing the first stop (starting location)
    if (index === 0) {
      toast.error('Cannot remove the starting location');
      return;
    }
    
    setStops(stops.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    console.log('handleSubmit called, activeTab:', activeTab);
    if (e) e.preventDefault();
    
    // Only allow submission from the assignment tab
    if (activeTab !== 'assignment') {
      console.log('Submission blocked - not on assignment tab');
      toast.error('Please complete all steps before submitting');
      return;
    }
    
    console.log('Proceeding with route creation...');
    
    if (!validateForm()) {
      // If validation fails, go back to basic tab to show errors
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
        status: 'active',
        driver_id: formData.driver_id || null,
        vehicle_id: formData.vehicle_id || null
      };

      const response = await fetch('/api/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addRoute', routeData, stops })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to add route');
      }

      toast.success('Route added successfully with coordinates for live tracking!');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error adding route:', error);
      toast.error(error.message || 'Failed to add route');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
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
      vehicle_id: ''
    });
    setStops([]);
    setNewStop({
      stop_name: '',
      stop_time: '',
      latitude: undefined,
      longitude: undefined,
      is_major_stop: false
    });
    setErrors({});
    setCompletedSteps({
      basic: false,
      stops: false,
      assignment: false
    });
    setActiveTab('basic');
    onClose();
  };

  // Handle Enter key press to prevent unwanted form submission
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Only allow Enter to progress if on basic info tab and form is valid
      if (activeTab === 'basic' && completedSteps.basic) {
        addStartingLocationAsFirstStop();
        setActiveTab('stops');
        toast.success('Starting location added as first stop');
      } else if (activeTab === 'stops') {
        setActiveTab('assignment');
        toast('Driver and vehicle assignment is optional', { 
          icon: 'ℹ️',
          duration: 3000
        });
      }
      // Don't handle Enter on assignment tab to prevent accidental submission
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Add New Route</h2>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation with Progress */}
        <div className="flex border-b bg-gray-50">
          <button
            onClick={() => setActiveTab('basic')}
            className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 ${
              activeTab === 'basic'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              completedSteps.basic 
                ? 'bg-green-100 text-green-800' 
                : activeTab === 'basic'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-200 text-gray-600'
            }`}>
              {completedSteps.basic ? '✓' : '1'}
            </div>
            <span>Basic Information</span>
          </button>
          <button
            onClick={() => setActiveTab('stops')}
            disabled={!completedSteps.basic}
            className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 ${
              activeTab === 'stops'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : completedSteps.basic
                ? 'text-gray-500 hover:text-gray-700'
                : 'text-gray-400 cursor-not-allowed'
            }`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              completedSteps.stops 
                ? 'bg-green-100 text-green-800' 
                : activeTab === 'stops'
                ? 'bg-blue-100 text-blue-800'
                : completedSteps.basic
                ? 'bg-gray-200 text-gray-600'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {completedSteps.stops ? '✓' : '2'}
            </div>
            <span>Route Stops ({stops.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('assignment')}
            disabled={!completedSteps.basic}
            className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 ${
              activeTab === 'assignment'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : completedSteps.basic
                ? 'text-gray-500 hover:text-gray-700'
                : 'text-gray-400 cursor-not-allowed'
            }`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              activeTab === 'assignment'
                ? 'bg-blue-100 text-blue-800'
                : completedSteps.basic
                ? 'bg-gray-200 text-gray-600'
                : 'bg-gray-100 text-gray-400'
            }`}>
              3
            </div>
            <span>Driver & Vehicle Assignment</span>
          </button>
        </div>

        <div className="p-6">
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
                    onChange={(e) => {
                      setFormData({ ...formData, start_location: e.target.value });
                      // Update first stop name if it exists (starting location)
                      if (stops.length > 0) {
                        const updatedStops = [...stops];
                        updatedStops[0] = { ...updatedStops[0], stop_name: e.target.value };
                        setStops(updatedStops);
                      }
                    }}
                    className={`input ${errors.start_location ? 'border-red-500' : ''}`}
                    placeholder="Starting point"
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
                    placeholder="Destination"
                  />
                  {errors.end_location && <p className="text-red-500 text-xs mt-1">{errors.end_location}</p>}
                </div>

                {/* Start Point Coordinates */}
                <div className="md:col-span-2">
                  <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <h4 className="text-sm font-semibold text-blue-900 mb-2">📍 Start Point Coordinates (for Live Tracking)</h4>
                    <p className="text-blue-700 text-xs mb-3">Add GPS coordinates for the starting point to enable live tracking on maps</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Start Latitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={formData.start_latitude}
                          onChange={(e) => {
                            setFormData({ ...formData, start_latitude: e.target.value });
                            // Update first stop latitude if it exists
                            if (stops.length > 0) {
                              const updatedStops = [...stops];
                              updatedStops[0] = { 
                                ...updatedStops[0], 
                                latitude: e.target.value ? parseFloat(e.target.value) : undefined 
                              };
                              setStops(updatedStops);
                            }
                          }}
                          className={`input text-sm ${errors.start_latitude ? 'border-red-500' : ''}`}
                          placeholder="12.9716 (e.g., Bangalore)"
                        />
                        {errors.start_latitude && <p className="text-red-500 text-xs mt-1">{errors.start_latitude}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Start Longitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={formData.start_longitude}
                          onChange={(e) => {
                            setFormData({ ...formData, start_longitude: e.target.value });
                            // Update first stop longitude if it exists
                            if (stops.length > 0) {
                              const updatedStops = [...stops];
                              updatedStops[0] = { 
                                ...updatedStops[0], 
                                longitude: e.target.value ? parseFloat(e.target.value) : undefined 
                              };
                              setStops(updatedStops);
                            }
                          }}
                          className={`input text-sm ${errors.start_longitude ? 'border-red-500' : ''}`}
                          placeholder="77.5946 (e.g., Bangalore)"
                        />
                        {errors.start_longitude && <p className="text-red-500 text-xs mt-1">{errors.start_longitude}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* End Point Coordinates */}
                <div className="md:col-span-2">
                  <div className="bg-green-50 p-4 rounded-lg mb-4">
                    <h4 className="text-sm font-semibold text-green-900 mb-2">🏁 End Point Coordinates (for Live Tracking)</h4>
                    <p className="text-green-700 text-xs mb-3">Add GPS coordinates for the destination to enable live tracking on maps</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">End Latitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={formData.end_latitude}
                          onChange={(e) => setFormData({ ...formData, end_latitude: e.target.value })}
                          className={`input text-sm ${errors.end_latitude ? 'border-red-500' : ''}`}
                          placeholder="12.8797 (e.g., Electronic City)"
                        />
                        {errors.end_latitude && <p className="text-red-500 text-xs mt-1">{errors.end_latitude}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">End Longitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={formData.end_longitude}
                          onChange={(e) => setFormData({ ...formData, end_longitude: e.target.value })}
                          className={`input text-sm ${errors.end_longitude ? 'border-red-500' : ''}`}
                          placeholder="77.6130 (e.g., Electronic City)"
                        />
                        {errors.end_longitude && <p className="text-red-500 text-xs mt-1">{errors.end_longitude}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Departure Time *</label>
                  <input
                    type="time"
                    value={formData.departure_time}
                    onChange={(e) => {
                      setFormData({ ...formData, departure_time: e.target.value });
                      // Update first stop time if it exists (starting location)
                      if (stops.length > 0) {
                        const updatedStops = [...stops];
                        updatedStops[0] = { ...updatedStops[0], stop_time: e.target.value };
                        setStops(updatedStops);
                      }
                    }}
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
                    placeholder="45"
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
                    placeholder="70"
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
                    placeholder="2500"
                  />
                  {errors.fare && <p className="text-red-500 text-xs mt-1">{errors.fare}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Route Stops Tab */}
          {activeTab === 'stops' && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Route Stops Management</h3>
                  <p className="text-blue-700 text-sm mb-2">
                    The starting location is automatically added as the first stop. Add intermediate stops in chronological order before the destination.
                  </p>
                  <p className="text-blue-600 text-xs">
                    💡 The first stop automatically syncs with your starting location and departure time from the Basic Information tab.
                </p>
              </div>

              {/* Add New Stop */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Add New Stop</h4>
                <div className="space-y-4">
                  {/* Stop Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Stop Name *</label>
                    <input
                      type="text"
                      value={newStop.stop_name}
                      onChange={(e) => setNewStop({ ...newStop, stop_name: e.target.value })}
                      className="input"
                      placeholder="Stop name"
                    />
                  </div>
                  <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Arrival Time *</label>
                    <input
                      type="time"
                      value={newStop.stop_time}
                      onChange={(e) => setNewStop({ ...newStop, stop_time: e.target.value })}
                      className="input"
                    />
                  </div>
                    <div className="flex items-center justify-center">
                      <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={newStop.is_major_stop}
                        onChange={(e) => setNewStop({ ...newStop, is_major_stop: e.target.checked })}
                        className="rounded"
                      />
                        <span className="text-sm text-gray-600">Major Stop</span>
                    </label>
                    </div>
                  </div>

                  {/* Stop GPS Coordinates */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <h5 className="text-sm font-medium text-gray-800 mb-2">📍 GPS Coordinates (Optional for Live Tracking)</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={newStop.latitude || ''}
                          onChange={(e) => setNewStop({ ...newStop, latitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                          className="input text-sm"
                          placeholder="12.9716"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={newStop.longitude || ''}
                          onChange={(e) => setNewStop({ ...newStop, longitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                          className="input text-sm"
                          placeholder="77.5946"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Add Stop Button */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={addStop}
                      className="btn-primary flex items-center space-x-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Stop</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Stops List */}
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">Route Stops ({stops.length})</h4>
                {errors.stops_sequence && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-800 text-sm font-medium">⚠️ Stop Time Error</p>
                    <p className="text-red-700 text-sm">{errors.stops_sequence}</p>
                  </div>
                )}
                {stops.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>No stops added yet. Add your first stop above.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stops.map((stop, index) => (
                      <div key={index} className={`flex items-center space-x-3 p-3 rounded-lg ${
                        index === 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                      }`}>
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            index === 0 
                              ? 'text-green-800 bg-green-100' 
                              : 'text-gray-600 bg-white'
                          }`}>
                            {index === 0 ? '🚌' : index + 1}
                          </span>
                        </div>
                        
                        <div className="flex-1 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                              <div className="flex items-center space-x-2">
                            <p className="font-medium text-gray-900">{stop.stop_name}</p>
                                {index === 0 && (
                                  <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                                    Starting Point
                                  </span>
                                )}
                              </div>
                              {stop.is_major_stop && index !== 0 && (
                              <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mt-1">
                                Major Stop
                              </span>
                            )}
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Clock className="w-4 h-4 mr-1" />
                              {index === 0 ? (
                                <span className="font-medium text-green-700">
                                  Departure: {stop.stop_time}
                                </span>
                              ) : (
                                <span>Arrival: {stop.stop_time}</span>
                              )}
                          </div>
                          <div className="flex items-center justify-end">
                              {index === 0 ? (
                                <div className="p-1 text-gray-400" title="Starting location cannot be removed">
                                  <Trash2 className="w-4 h-4 opacity-30" />
                                </div>
                              ) : (
                            <button
                              type="button"
                              onClick={() => removeStop(index)}
                              className="p-1 text-red-400 hover:text-red-600"
                                  title="Remove this stop"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                              )}
                          </div>
                          </div>
                          
                          {/* GPS Coordinates Display */}
                          {stop.latitude && stop.longitude && (
                            <div className={`px-3 py-2 rounded text-xs ${
                              index === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              <span className="font-medium">📍 GPS:</span> {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                            </div>
                          )}
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
            <div className="space-y-6">
              {/* Route Summary */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">Route Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-blue-700"><span className="font-medium">Route:</span> {formData.route_number} - {formData.route_name}</p>
                    <p className="text-blue-700"><span className="font-medium">Journey:</span> {formData.start_location} → {formData.end_location}</p>
                    <p className="text-blue-700"><span className="font-medium">Time:</span> {formData.departure_time} - {formData.arrival_time}</p>
                  </div>
                  <div>
                    <p className="text-blue-700"><span className="font-medium">Distance:</span> {formData.distance} km</p>
                    <p className="text-blue-700"><span className="font-medium">Capacity:</span> {formData.total_capacity} passengers</p>
                    <p className="text-blue-700"><span className="font-medium">Fare:</span> ₹{formData.fare}/month</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-blue-700 text-sm">
                    <span className="font-medium">Stops:</span> {stops.length} total 
                    {stops.length > 0 && (
                      <span className="ml-2">
                        ({stops[0]?.stop_name} → {stops[stops.length - 1]?.stop_name})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">Route Resources Assignment</h3>
                <p className="text-yellow-700 text-sm">
                  Assigning driver, vehicle, and GPS device is optional during route creation. You can assign them later from the route management page.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign Driver (Optional)</label>
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
                  <p className="text-xs text-gray-500 mt-1">
                    {drivers.length} active drivers available
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign Vehicle (Optional)</label>
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
                  <p className="text-xs text-gray-500 mt-1">
                    {vehicles.length} active vehicles available
                  </p>
                  {formData.vehicle_id && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-700 font-medium">
                        📍 GPS Tracking Note
                      </p>
                      <p className="text-xs text-blue-600">
                        GPS tracking will be available if the selected vehicle has an assigned GPS device.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex justify-between items-center space-x-3 pt-6 border-t mt-6">
            <div className="flex space-x-2">
              {activeTab !== 'basic' && (
                <button
                  type="button"
                  onClick={() => {
                    const tabs = ['basic', 'stops', 'assignment'];
                    const currentIndex = tabs.indexOf(activeTab);
                    setActiveTab(tabs[currentIndex - 1] as any);
                  }}
                  className="btn-secondary"
                  disabled={loading}
                >
                  Previous
                </button>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              
              {activeTab === 'basic' ? (
                <button
                  type="button"
                  onClick={() => {
                    console.log('Next: Add Stops clicked');
                    // Validate basic info before moving to next step
                    if (validateBasicInfo()) {
                      // Automatically add starting location as first stop
                      addStartingLocationAsFirstStop();
                      setActiveTab('stops');
                      toast.success('Starting location added as first stop');
                      console.log('Moved to stops tab');
                    } else {
                      toast.error('Please complete all required fields');
                      console.log('Basic info validation failed');
                    }
                  }}
                  className={`btn-primary ${!completedSteps.basic ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={loading || !completedSteps.basic}
                >
                  Next: Add Stops
                </button>
              ) : activeTab === 'stops' ? (
                <button
                  type="button"
                  onClick={() => {
                    console.log('Next: Assignment clicked');
                    // Can proceed to assignment even without stops
                    setActiveTab('assignment');
                    toast('Driver and vehicle assignment is optional', { 
                      icon: 'ℹ️',
                      duration: 3000
                    });
                    console.log('Moved to assignment tab');
                  }}
                  className="btn-primary"
                  disabled={loading}
                >
                  Next: Assignment
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    console.log('Create Route button clicked');
                    e.preventDefault();
                    handleSubmit(e as any);
                  }}
                  disabled={loading || !completedSteps.basic}
                  className={`btn-primary flex items-center space-x-2 ${
                    !completedSteps.basic ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Route...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Create Route</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 