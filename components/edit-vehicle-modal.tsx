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
  Activity,
  Heart,
  Gauge,
  Save,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';

interface EditVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicle: any;
}

const EditVehicleModal: React.FC<EditVehicleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  vehicle
}) => {
  const [formData, setFormData] = useState({
    registration_number: '',
    model: '',
    capacity: '',
    fuel_type: 'diesel',
    status: 'active',
    mileage: '',
    last_maintenance: '',
    next_maintenance: '',
    insurance_expiry: '',
    fitness_expiry: ''
  });

  const [errors, setErrors] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form when vehicle changes
  useEffect(() => {
    if (vehicle) {
      setFormData({
        registration_number: vehicle.registration_number || vehicle.vehicle_number || '',
        model: vehicle.model || '',
        capacity: vehicle.capacity?.toString() || '',
        fuel_type: vehicle.fuel_type || 'diesel',
        status: vehicle.status || 'active',
        mileage: vehicle.mileage?.toString() || '',
        last_maintenance: vehicle.last_maintenance ? vehicle.last_maintenance.split('T')[0] : '',
        next_maintenance: vehicle.next_maintenance ? vehicle.next_maintenance.split('T')[0] : '',
        insurance_expiry: vehicle.insurance_expiry ? vehicle.insurance_expiry.split('T')[0] : '',
        fitness_expiry: vehicle.fitness_expiry ? vehicle.fitness_expiry.split('T')[0] : ''
      });
      setErrors({});
    }
  }, [vehicle]);

  const validateForm = () => {
    const newErrors: any = {};

    // Registration number validation
    if (!formData.registration_number.trim()) {
      newErrors.registration_number = 'Registration number is required';
    } else if (!/^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/.test(formData.registration_number.replace(/\s/g, ''))) {
      newErrors.registration_number = 'Invalid registration number format (e.g., MH12AB1234)';
    }

    // Model validation
    if (!formData.model.trim()) {
      newErrors.model = 'Vehicle model is required';
    }

    // Capacity validation
    if (!formData.capacity) {
      newErrors.capacity = 'Capacity is required';
    } else if (parseInt(formData.capacity) < 1 || parseInt(formData.capacity) > 100) {
      newErrors.capacity = 'Capacity must be between 1 and 100';
    }

    // Mileage validation (optional but must be valid if provided)
    if (formData.mileage && (parseFloat(formData.mileage) < 0 || parseFloat(formData.mileage) > 50)) {
      newErrors.mileage = 'Mileage must be between 0 and 50 km/l';
    }

    // Date validations
    const today = new Date().toISOString().split('T')[0];
    
    if (formData.last_maintenance && formData.last_maintenance > today) {
      newErrors.last_maintenance = 'Last maintenance date cannot be in the future';
    }

    if (formData.next_maintenance && formData.next_maintenance <= today) {
      newErrors.next_maintenance = 'Next maintenance date must be in the future';
    }

    if (formData.insurance_expiry && formData.insurance_expiry <= today) {
      newErrors.insurance_expiry = 'Insurance expiry date must be in the future';
    }

    if (formData.fitness_expiry && formData.fitness_expiry <= today) {
      newErrors.fitness_expiry = 'Fitness expiry date must be in the future';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const vehicleData = {
        registration_number: formData.registration_number.trim(),
        model: formData.model.trim(),
        capacity: parseInt(formData.capacity),
        fuel_type: formData.fuel_type,
        status: formData.status,
        mileage: formData.mileage ? parseFloat(formData.mileage) : null,
        last_maintenance: formData.last_maintenance || null,
        next_maintenance: formData.next_maintenance || null,
        insurance_expiry: formData.insurance_expiry || null,
        fitness_expiry: formData.fitness_expiry || null,
        updated_at: new Date().toISOString()
      };

      console.log('Updating vehicle with data:', vehicleData);

      // In a real implementation, this would update the database
      // await DatabaseService.updateVehicle(vehicle.id, vehicleData);
      
      // For now, simulate the API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast.success('Vehicle updated successfully!');
      onSuccess();
      handleClose();
      
    } catch (error) {
      console.error('Error updating vehicle:', error);
      toast.error('Failed to update vehicle. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      registration_number: '',
      model: '',
      capacity: '',
      fuel_type: 'diesel',
      status: 'active',
      mileage: '',
      last_maintenance: '',
      next_maintenance: '',
      insurance_expiry: '',
      fitness_expiry: ''
    });
    setErrors({});
    onClose();
  };

  const formatRegistrationNumber = (value: string) => {
    // Remove all non-alphanumeric characters and convert to uppercase
    const cleaned = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    
    // Format as XX00XX0000
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return cleaned.slice(0, 2) + ' ' + cleaned.slice(2);
    if (cleaned.length <= 6) return cleaned.slice(0, 2) + ' ' + cleaned.slice(2, 4) + ' ' + cleaned.slice(4);
    return cleaned.slice(0, 2) + ' ' + cleaned.slice(2, 4) + ' ' + cleaned.slice(4, 6) + ' ' + cleaned.slice(6, 10);
  };

  if (!isOpen || !vehicle) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-25"
            onClick={handleClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Car className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Edit Vehicle</h2>
                  <p className="text-gray-600">{vehicle.registration_number || vehicle.vehicle_number}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-6">
                
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Registration Number *
                      </label>
                      <input
                        type="text"
                        value={formData.registration_number}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          registration_number: formatRegistrationNumber(e.target.value)
                        })}
                        className={`input ${errors.registration_number ? 'border-red-500' : ''}`}
                        placeholder="MH 12 AB 1234"
                        maxLength={13}
                        disabled={isSubmitting}
                      />
                      {errors.registration_number && (
                        <p className="text-red-500 text-xs mt-1">{errors.registration_number}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Model *
                      </label>
                      <input
                        type="text"
                        value={formData.model}
                        onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                        className={`input ${errors.model ? 'border-red-500' : ''}`}
                        placeholder="e.g., Tata Starbus"
                        disabled={isSubmitting}
                      />
                      {errors.model && (
                        <p className="text-red-500 text-xs mt-1">{errors.model}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Capacity (Passengers) *
                      </label>
                      <input
                        type="number"
                        value={formData.capacity}
                        onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                        className={`input ${errors.capacity ? 'border-red-500' : ''}`}
                        placeholder="40"
                        min="1"
                        max="100"
                        disabled={isSubmitting}
                      />
                      {errors.capacity && (
                        <p className="text-red-500 text-xs mt-1">{errors.capacity}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fuel Type
                      </label>
                      <select
                        value={formData.fuel_type}
                        onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })}
                        className="input"
                        disabled={isSubmitting}
                      >
                        <option value="diesel">Diesel</option>
                        <option value="petrol">Petrol</option>
                        <option value="cng">CNG</option>
                        <option value="electric">Electric</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="input"
                        disabled={isSubmitting}
                      >
                        <option value="active">Active</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="retired">Retired</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mileage (km/l)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.mileage}
                        onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
                        className={`input ${errors.mileage ? 'border-red-500' : ''}`}
                        placeholder="12.5"
                        min="0"
                        max="50"
                        disabled={isSubmitting}
                      />
                      {errors.mileage && (
                        <p className="text-red-500 text-xs mt-1">{errors.mileage}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Maintenance & Documentation */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Maintenance & Documentation</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Maintenance Date
                      </label>
                      <input
                        type="date"
                        value={formData.last_maintenance}
                        onChange={(e) => setFormData({ ...formData, last_maintenance: e.target.value })}
                        className={`input ${errors.last_maintenance ? 'border-red-500' : ''}`}
                        disabled={isSubmitting}
                      />
                      {errors.last_maintenance && (
                        <p className="text-red-500 text-xs mt-1">{errors.last_maintenance}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Next Maintenance Date
                      </label>
                      <input
                        type="date"
                        value={formData.next_maintenance}
                        onChange={(e) => setFormData({ ...formData, next_maintenance: e.target.value })}
                        className={`input ${errors.next_maintenance ? 'border-red-500' : ''}`}
                        disabled={isSubmitting}
                      />
                      {errors.next_maintenance && (
                        <p className="text-red-500 text-xs mt-1">{errors.next_maintenance}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Insurance Expiry Date
                      </label>
                      <input
                        type="date"
                        value={formData.insurance_expiry}
                        onChange={(e) => setFormData({ ...formData, insurance_expiry: e.target.value })}
                        className={`input ${errors.insurance_expiry ? 'border-red-500' : ''}`}
                        disabled={isSubmitting}
                      />
                      {errors.insurance_expiry && (
                        <p className="text-red-500 text-xs mt-1">{errors.insurance_expiry}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fitness Certificate Expiry
                      </label>
                      <input
                        type="date"
                        value={formData.fitness_expiry}
                        onChange={(e) => setFormData({ ...formData, fitness_expiry: e.target.value })}
                        className={`input ${errors.fitness_expiry ? 'border-red-500' : ''}`}
                        disabled={isSubmitting}
                      />
                      {errors.fitness_expiry && (
                        <p className="text-red-500 text-xs mt-1">{errors.fitness_expiry}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Update Vehicle</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};

export default EditVehicleModal; 