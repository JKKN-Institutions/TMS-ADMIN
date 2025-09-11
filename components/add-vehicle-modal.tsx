'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const AddVehicleModal = ({ isOpen, onClose, onSuccess }: any) => {
  const [gpsDevices, setGpsDevices] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    registrationNumber: '',
    model: '',
    capacity: '',
    fuelType: 'diesel',
    status: 'active',
    insuranceExpiry: '',
    fitnessExpiry: '',
    nextMaintenance: '',
    mileage: '',
    purchaseDate: '',
    chassisNumber: '',
    engineNumber: '',
    gpsDeviceId: '',
    liveTrackingEnabled: false
  });

  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // Fetch GPS devices when modal opens
  React.useEffect(() => {
    if (isOpen) {
      fetchGpsDevices();
    }
  }, [isOpen]);

  const fetchGpsDevices = async () => {
    try {
      const response = await fetch('/api/admin/gps/devices');
      const result = await response.json();
      if (result.success) {
        const activeDevices = result.data.filter((device: any) => device.status === 'active');
        setGpsDevices(activeDevices);
      }
    } catch (error) {
      console.error('Error fetching GPS devices:', error);
    }
  };

  const validateForm = () => {
    const newErrors: any = {};
    
    if (!formData.registrationNumber.trim()) newErrors.registrationNumber = 'Registration number is required';
    if (!formData.model.trim()) newErrors.model = 'Vehicle model is required';
    if (!formData.capacity) newErrors.capacity = 'Capacity is required';
    else if (parseInt(formData.capacity) <= 0) newErrors.capacity = 'Capacity must be greater than 0';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const vehicleData = {
        registrationNumber: formData.registrationNumber.trim(),
        model: formData.model.trim(),
        capacity: parseInt(formData.capacity),
        fuelType: formData.fuelType,
        status: formData.status,
        insuranceExpiry: formData.insuranceExpiry || null,
        fitnessExpiry: formData.fitnessExpiry || null,
        nextMaintenance: formData.nextMaintenance || null,
        mileage: formData.mileage ? parseFloat(formData.mileage) : 0,
        purchaseDate: formData.purchaseDate || null,
        chassisNumber: formData.chassisNumber.trim() || null,
        engineNumber: formData.engineNumber.trim() || null,
        gpsDeviceId: formData.gpsDeviceId || null,
        liveTrackingEnabled: formData.liveTrackingEnabled || false
      };
      
      // Call API instead of DatabaseService
      const response = await fetch('/api/admin/vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vehicleData),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to add vehicle');
      }
      
      toast.success('Vehicle added successfully!');
      
      // Reset form
      setFormData({
        registrationNumber: '',
        model: '',
        capacity: '',
        fuelType: 'diesel',
        status: 'active',
        insuranceExpiry: '',
        fitnessExpiry: '',
        nextMaintenance: '',
        mileage: '',
        purchaseDate: '',
        chassisNumber: '',
        engineNumber: '',
        gpsDeviceId: '',
        liveTrackingEnabled: false
      });
      setErrors({});
      
      // Call success callback to refresh the vehicles list
      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
    } catch (error) {
      console.error('Error adding vehicle:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add vehicle';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
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
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Add New Vehicle</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number *</label>
                <input
                  type="text"
                  value={formData.registrationNumber}
                  onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                  className={`input ${errors.registrationNumber ? 'border-red-500' : ''}`}
                  placeholder="TN01AB1234"
                  disabled={loading}
                />
                {errors.registrationNumber && <p className="text-red-500 text-xs mt-1">{errors.registrationNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Model *</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className={`input ${errors.model ? 'border-red-500' : ''}`}
                  placeholder="Tata Ultra 1412"
                  disabled={loading}
                />
                {errors.model && <p className="text-red-500 text-xs mt-1">{errors.model}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (Passengers) *</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  className={`input ${errors.capacity ? 'border-red-500' : ''}`}
                  placeholder="40"
                  disabled={loading}
                />
                {errors.capacity && <p className="text-red-500 text-xs mt-1">{errors.capacity}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
                <select
                  value={formData.fuelType}
                  onChange={(e) => setFormData({ ...formData, fuelType: e.target.value })}
                  className="input"
                  disabled={loading}
                >
                  <option value="diesel">Diesel</option>
                  <option value="petrol">Petrol</option>
                  <option value="electric">Electric</option>
                  <option value="cng">CNG</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="input"
                  disabled={loading}
                >
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mileage (km/l)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.mileage}
                  onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
                  className="input"
                  placeholder="12.5"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Legal & Compliance */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Legal & Compliance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Expiry</label>
                <input
                  type="date"
                  value={formData.insuranceExpiry}
                  onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
                  className="input"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fitness Certificate Expiry</label>
                <input
                  type="date"
                  value={formData.fitnessExpiry}
                  onChange={(e) => setFormData({ ...formData, fitnessExpiry: e.target.value })}
                  className="input"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next Maintenance Due</label>
                <input
                  type="date"
                  value={formData.nextMaintenance}
                  onChange={(e) => setFormData({ ...formData, nextMaintenance: e.target.value })}
                  className="input"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  className="input"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chassis Number</label>
                <input
                  type="text"
                  value={formData.chassisNumber}
                  onChange={(e) => setFormData({ ...formData, chassisNumber: e.target.value })}
                  className="input"
                  placeholder="MA3FKA1BHGM123456"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Engine Number</label>
                <input
                  type="text"
                  value={formData.engineNumber}
                  onChange={(e) => setFormData({ ...formData, engineNumber: e.target.value })}
                  className="input"
                  placeholder="497TCIC123456"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* GPS Tracking */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              GPS Tracking
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GPS Device</label>
                <select
                  value={formData.gpsDeviceId}
                  onChange={(e) => setFormData({ ...formData, gpsDeviceId: e.target.value })}
                  className="input"
                  disabled={loading}
                >
                  <option value="">No GPS Device</option>
                  {gpsDevices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.device_name} ({device.device_id})
                    </option>
                  ))}
                </select>
                {gpsDevices.length === 0 ? (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-700 mb-2">
                      No GPS devices available. Add GPS devices first to enable vehicle tracking.
                    </p>
                    <a 
                      href="/gps-devices" 
                      target="_blank"
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      → Manage GPS Devices
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    Assign a GPS device for real-time vehicle tracking
                  </p>
                )}
              </div>

              <div className="flex flex-col">
                <label className="flex items-center space-x-2 mb-2">
                  <input
                    type="checkbox"
                    checked={formData.liveTrackingEnabled}
                    onChange={(e) => setFormData({ ...formData, liveTrackingEnabled: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    disabled={loading || !formData.gpsDeviceId}
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable Live Tracking
                  </span>
                </label>
                <p className="text-xs text-gray-500">
                  {!formData.gpsDeviceId 
                    ? 'Select a GPS device to enable live tracking'
                    : 'Allow real-time location tracking for this vehicle'
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Add Vehicle
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddVehicleModal; 