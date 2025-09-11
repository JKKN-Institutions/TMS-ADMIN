'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Loader2, Navigation, Phone, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

interface AddGPSDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddGPSDeviceModal: React.FC<AddGPSDeviceModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [formData, setFormData] = useState({
    device_id: '',
    device_name: '',
    device_model: '',
    sim_number: '',
    imei: '',
    notes: ''
  });

  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const newErrors: any = {};
    
    if (!formData.device_id.trim()) {
      newErrors.device_id = 'Device ID is required';
    } else if (!/^[A-Z0-9]{3,20}$/i.test(formData.device_id)) {
      newErrors.device_id = 'Device ID must be 3-20 alphanumeric characters';
    }

    if (!formData.device_name.trim()) {
      newErrors.device_name = 'Device name is required';
    } else if (formData.device_name.length < 3) {
      newErrors.device_name = 'Device name must be at least 3 characters';
    }

    if (formData.sim_number && !/^\d{10,15}$/.test(formData.sim_number)) {
      newErrors.sim_number = 'SIM number must be 10-15 digits';
    }

    if (formData.imei && !/^\d{15}$/.test(formData.imei)) {
      newErrors.imei = 'IMEI must be exactly 15 digits';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/admin/gps/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: formData.device_id.trim().toUpperCase(),
          device_name: formData.device_name.trim(),
          device_model: formData.device_model.trim() || null,
          sim_number: formData.sim_number.trim() || null,
          imei: formData.imei.trim() || null,
          notes: formData.notes.trim() || null
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to add GPS device');
      }

      toast.success('GPS device added successfully!');
      
      // Reset form
      setFormData({
        device_id: '',
        device_name: '',
        device_model: '',
        sim_number: '',
        imei: '',
        notes: ''
      });
      setErrors({});
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error adding GPS device:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add GPS device';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev: any) => ({ ...prev, [field]: '' }));
    }
  };

  const handleClose = () => {
    setFormData({
      device_id: '',
      device_name: '',
      device_model: '',
      sim_number: '',
      imei: '',
      notes: ''
    });
    setErrors({});
    onClose();
  };

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
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Navigation className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Add GPS Device</h2>
              <p className="text-sm text-gray-600">Register a new GPS tracking device</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Device Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Navigation className="w-5 h-5 mr-2 text-blue-600" />
              Device Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device ID *
                </label>
                <input
                  type="text"
                  value={formData.device_id}
                  onChange={(e) => handleInputChange('device_id', e.target.value)}
                  className={`input ${errors.device_id ? 'border-red-500' : ''}`}
                  placeholder="GPS001"
                  disabled={loading}
                />
                {errors.device_id && (
                  <p className="text-red-500 text-xs mt-1">{errors.device_id}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Unique identifier (3-20 characters, alphanumeric)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device Name *
                </label>
                <input
                  type="text"
                  value={formData.device_name}
                  onChange={(e) => handleInputChange('device_name', e.target.value)}
                  className={`input ${errors.device_name ? 'border-red-500' : ''}`}
                  placeholder="Primary Bus Tracker"
                  disabled={loading}
                />
                {errors.device_name && (
                  <p className="text-red-500 text-xs mt-1">{errors.device_name}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Descriptive name for easy identification
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device Model
                </label>
                <input
                  type="text"
                  value={formData.device_model}
                  onChange={(e) => handleInputChange('device_model', e.target.value)}
                  className="input"
                  placeholder="TrackMax Pro 4G"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Manufacturer model (optional)
                </p>
              </div>
            </div>
          </div>

          {/* Connectivity Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Smartphone className="w-5 h-5 mr-2 text-green-600" />
              Connectivity Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SIM Number
                </label>
                <input
                  type="text"
                  value={formData.sim_number}
                  onChange={(e) => handleInputChange('sim_number', e.target.value.replace(/\D/g, ''))}
                  className={`input ${errors.sim_number ? 'border-red-500' : ''}`}
                  placeholder="9876543210"
                  disabled={loading}
                  maxLength={15}
                />
                {errors.sim_number && (
                  <p className="text-red-500 text-xs mt-1">{errors.sim_number}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  SIM card number (10-15 digits, optional)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  IMEI Number
                </label>
                <input
                  type="text"
                  value={formData.imei}
                  onChange={(e) => handleInputChange('imei', e.target.value.replace(/\D/g, ''))}
                  className={`input ${errors.imei ? 'border-red-500' : ''}`}
                  placeholder="123456789012345"
                  disabled={loading}
                  maxLength={15}
                />
                {errors.imei && (
                  <p className="text-red-500 text-xs mt-1">{errors.imei}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Device IMEI (15 digits, optional)
                </p>
              </div>
            </div>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              className="input"
              rows={3}
              placeholder="Additional notes about this GPS device (installation date, location, etc.)"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional notes for reference
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-6 border-t">
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
                  Add GPS Device
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddGPSDeviceModal; 