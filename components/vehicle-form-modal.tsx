'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Car,
  Calendar,
  Fuel,
  FileText,
  AlertTriangle,
  Save,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface VehicleFormData {
  id?: string;
  registrationNumber: string;
  model: string;
  manufacturer: string;
  capacity: number;
  fuelType: 'diesel' | 'petrol' | 'electric' | 'cng';
  engineNumber: string;
  chassisNumber: string;
  yearOfManufacture: number;
  insuranceProvider: string;
  insuranceNumber: string;
  insuranceExpiry: string;
  fitnessExpiry: string;
  permitExpiry: string;
  pollutionExpiry: string;
  lastMaintenance: string;
  nextMaintenance: string;
  status: 'active' | 'maintenance' | 'retired';
  assignedRoute?: string;
  mileage: number;
  purchaseDate: string;
  purchaseAmount: number;
  ownershipType: 'owned' | 'leased';
  driverLicenseRequired: string;
  rcCopy: string;
  notes: string;
}

interface VehicleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (vehicle: VehicleFormData) => void;
  vehicle?: any;
  title?: string;
}

const VehicleFormModal: React.FC<VehicleFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  vehicle,
  title = 'Add Vehicle'
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<VehicleFormData>({
    registrationNumber: '',
    model: '',
    manufacturer: '',
    capacity: 70,
    fuelType: 'diesel',
    engineNumber: '',
    chassisNumber: '',
    yearOfManufacture: new Date().getFullYear(),
    insuranceProvider: '',
    insuranceNumber: '',
    insuranceExpiry: '',
    fitnessExpiry: '',
    permitExpiry: '',
    pollutionExpiry: '',
    lastMaintenance: '',
    nextMaintenance: '',
    status: 'active',
    assignedRoute: '',
    mileage: 8.5,
    purchaseDate: '',
    purchaseAmount: 0,
    ownershipType: 'owned',
    driverLicenseRequired: 'Heavy Vehicle',
    rcCopy: '',
    notes: ''
  });

  useEffect(() => {
    if (vehicle) {
      setFormData({
        id: vehicle.id,
        registrationNumber: vehicle.registrationNumber || '',
        model: vehicle.model || '',
        manufacturer: vehicle.manufacturer || '',
        capacity: vehicle.capacity || 70,
        fuelType: vehicle.fuelType || 'diesel',
        engineNumber: vehicle.engineNumber || '',
        chassisNumber: vehicle.chassisNumber || '',
        yearOfManufacture: vehicle.yearOfManufacture || new Date().getFullYear(),
        insuranceProvider: vehicle.insuranceProvider || '',
        insuranceNumber: vehicle.insuranceNumber || '',
        insuranceExpiry: vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toISOString().split('T')[0] : '',
        fitnessExpiry: vehicle.fitnessExpiry ? new Date(vehicle.fitnessExpiry).toISOString().split('T')[0] : '',
        permitExpiry: vehicle.permitExpiry ? new Date(vehicle.permitExpiry).toISOString().split('T')[0] : '',
        pollutionExpiry: vehicle.pollutionExpiry ? new Date(vehicle.pollutionExpiry).toISOString().split('T')[0] : '',
        lastMaintenance: vehicle.lastMaintenance ? new Date(vehicle.lastMaintenance).toISOString().split('T')[0] : '',
        nextMaintenance: vehicle.nextMaintenance ? new Date(vehicle.nextMaintenance).toISOString().split('T')[0] : '',
        status: vehicle.status || 'active',
        assignedRoute: vehicle.assignedRoute || '',
        mileage: vehicle.mileage || 8.5,
        purchaseDate: vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toISOString().split('T')[0] : '',
        purchaseAmount: vehicle.purchaseAmount || 0,
        ownershipType: vehicle.ownershipType || 'owned',
        driverLicenseRequired: vehicle.driverLicenseRequired || 'Heavy Vehicle',
        rcCopy: vehicle.rcCopy || '',
        notes: vehicle.notes || ''
      });
    }
  }, [vehicle]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.registrationNumber.trim()) {
      newErrors.registrationNumber = 'Registration number is required';
    } else if (!/^[A-Z]{2}\s*\d{2}\s*[A-Z]{1,2}\s*\d{4}$/.test(formData.registrationNumber.replace(/\s/g, ''))) {
      newErrors.registrationNumber = 'Invalid registration number format (e.g., TN 33 AB 1234)';
    }

    if (!formData.model.trim()) {
      newErrors.model = 'Vehicle model is required';
    }

    if (!formData.manufacturer.trim()) {
      newErrors.manufacturer = 'Manufacturer is required';
    }

    if (!formData.engineNumber.trim()) {
      newErrors.engineNumber = 'Engine number is required';
    }

    if (!formData.chassisNumber.trim()) {
      newErrors.chassisNumber = 'Chassis number is required';
    }

    if (formData.capacity < 1 || formData.capacity > 100) {
      newErrors.capacity = 'Capacity must be between 1 and 100';
    }

    if (formData.yearOfManufacture < 1990 || formData.yearOfManufacture > new Date().getFullYear()) {
      newErrors.yearOfManufacture = `Year must be between 1990 and ${new Date().getFullYear()}`;
    }

    if (!formData.insuranceProvider.trim()) {
      newErrors.insuranceProvider = 'Insurance provider is required';
    }

    if (!formData.insuranceNumber.trim()) {
      newErrors.insuranceNumber = 'Insurance number is required';
    }

    if (!formData.insuranceExpiry) {
      newErrors.insuranceExpiry = 'Insurance expiry date is required';
    }

    if (!formData.fitnessExpiry) {
      newErrors.fitnessExpiry = 'Fitness expiry date is required';
    }

    if (formData.mileage < 1 || formData.mileage > 50) {
      newErrors.mileage = 'Mileage must be between 1 and 50 km/l';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the validation errors');
      return;
    }

    setIsLoading(true);
    
    try {
      await onSubmit(formData);
      toast.success(`Vehicle ${vehicle ? 'updated' : 'added'} successfully!`);
      onClose();
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof VehicleFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden"
      >
        {/* Enhanced Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-purple-700 px-4 sm:px-6 py-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Car className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-white">{title}</h2>
                <p className="text-xs sm:text-sm text-blue-100 hidden sm:block">Fill in the vehicle details below</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors touch-manipulation disabled:opacity-50"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-100px)] sm:max-h-[calc(90vh-100px)]">

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 sm:space-y-8">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Car className="w-5 h-5 mr-2 text-blue-600" />
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Registration Number *
                </label>
                <input
                  type="text"
                  value={formData.registrationNumber}
                  onChange={(e) => handleInputChange('registrationNumber', e.target.value.toUpperCase())}
                  className={`input ${errors.registrationNumber ? 'border-red-500' : ''}`}
                  placeholder="TN 33 AB 1234"
                />
                {errors.registrationNumber && (
                  <p className="text-red-500 text-xs mt-1">{errors.registrationNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  className="input"
                >
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Manufacturer *
                </label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => handleInputChange('manufacturer', e.target.value)}
                  className={`input ${errors.manufacturer ? 'border-red-500' : ''}`}
                  placeholder="Ashok Leyland"
                />
                {errors.manufacturer && (
                  <p className="text-red-500 text-xs mt-1">{errors.manufacturer}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model *
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => handleInputChange('model', e.target.value)}
                  className={`input ${errors.model ? 'border-red-500' : ''}`}
                  placeholder="Viking"
                />
                {errors.model && (
                  <p className="text-red-500 text-xs mt-1">{errors.model}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Capacity *
                </label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => handleInputChange('capacity', parseInt(e.target.value))}
                  className={`input ${errors.capacity ? 'border-red-500' : ''}`}
                  min="1"
                  max="100"
                />
                {errors.capacity && (
                  <p className="text-red-500 text-xs mt-1">{errors.capacity}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fuel Type</label>
                <select
                  value={formData.fuelType}
                  onChange={(e) => handleInputChange('fuelType', e.target.value)}
                  className="input"
                >
                  <option value="diesel">Diesel</option>
                  <option value="petrol">Petrol</option>
                  <option value="electric">Electric</option>
                  <option value="cng">CNG</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year of Manufacture *
                </label>
                <input
                  type="number"
                  value={formData.yearOfManufacture}
                  onChange={(e) => handleInputChange('yearOfManufacture', parseInt(e.target.value))}
                  className={`input ${errors.yearOfManufacture ? 'border-red-500' : ''}`}
                  min="1990"
                  max={new Date().getFullYear()}
                />
                {errors.yearOfManufacture && (
                  <p className="text-red-500 text-xs mt-1">{errors.yearOfManufacture}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mileage (km/l) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.mileage}
                  onChange={(e) => handleInputChange('mileage', parseFloat(e.target.value))}
                  className={`input ${errors.mileage ? 'border-red-500' : ''}`}
                  min="1"
                  max="50"
                />
                {errors.mileage && (
                  <p className="text-red-500 text-xs mt-1">{errors.mileage}</p>
                )}
              </div>
            </div>
          </div>

          {/* Technical Details */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-green-600" />
              Technical Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Engine Number *
                </label>
                <input
                  type="text"
                  value={formData.engineNumber}
                  onChange={(e) => handleInputChange('engineNumber', e.target.value)}
                  className={`input ${errors.engineNumber ? 'border-red-500' : ''}`}
                  placeholder="Engine number"
                />
                {errors.engineNumber && (
                  <p className="text-red-500 text-xs mt-1">{errors.engineNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chassis Number *
                </label>
                <input
                  type="text"
                  value={formData.chassisNumber}
                  onChange={(e) => handleInputChange('chassisNumber', e.target.value)}
                  className={`input ${errors.chassisNumber ? 'border-red-500' : ''}`}
                  placeholder="Chassis number"
                />
                {errors.chassisNumber && (
                  <p className="text-red-500 text-xs mt-1">{errors.chassisNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ownership Type
                </label>
                <select
                  value={formData.ownershipType}
                  onChange={(e) => handleInputChange('ownershipType', e.target.value)}
                  className="input"
                >
                  <option value="owned">Owned</option>
                  <option value="leased">Leased</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Driver License Required
                </label>
                <input
                  type="text"
                  value={formData.driverLicenseRequired}
                  onChange={(e) => handleInputChange('driverLicenseRequired', e.target.value)}
                  className="input"
                  placeholder="Heavy Vehicle"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => handleInputChange('purchaseDate', e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Purchase Amount (₹)
                </label>
                <input
                  type="number"
                  value={formData.purchaseAmount}
                  onChange={(e) => handleInputChange('purchaseAmount', parseInt(e.target.value))}
                  className="input"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Insurance & Compliance */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
              Insurance & Compliance
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Insurance Provider *
                </label>
                <input
                  type="text"
                  value={formData.insuranceProvider}
                  onChange={(e) => handleInputChange('insuranceProvider', e.target.value)}
                  className={`input ${errors.insuranceProvider ? 'border-red-500' : ''}`}
                  placeholder="Insurance company name"
                />
                {errors.insuranceProvider && (
                  <p className="text-red-500 text-xs mt-1">{errors.insuranceProvider}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Insurance Number *
                </label>
                <input
                  type="text"
                  value={formData.insuranceNumber}
                  onChange={(e) => handleInputChange('insuranceNumber', e.target.value)}
                  className={`input ${errors.insuranceNumber ? 'border-red-500' : ''}`}
                  placeholder="Insurance policy number"
                />
                {errors.insuranceNumber && (
                  <p className="text-red-500 text-xs mt-1">{errors.insuranceNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Insurance Expiry *
                </label>
                <input
                  type="date"
                  value={formData.insuranceExpiry}
                  onChange={(e) => handleInputChange('insuranceExpiry', e.target.value)}
                  className={`input ${errors.insuranceExpiry ? 'border-red-500' : ''}`}
                />
                {errors.insuranceExpiry && (
                  <p className="text-red-500 text-xs mt-1">{errors.insuranceExpiry}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fitness Expiry *
                </label>
                <input
                  type="date"
                  value={formData.fitnessExpiry}
                  onChange={(e) => handleInputChange('fitnessExpiry', e.target.value)}
                  className={`input ${errors.fitnessExpiry ? 'border-red-500' : ''}`}
                />
                {errors.fitnessExpiry && (
                  <p className="text-red-500 text-xs mt-1">{errors.fitnessExpiry}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Permit Expiry
                </label>
                <input
                  type="date"
                  value={formData.permitExpiry}
                  onChange={(e) => handleInputChange('permitExpiry', e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pollution Expiry
                </label>
                <input
                  type="date"
                  value={formData.pollutionExpiry}
                  onChange={(e) => handleInputChange('pollutionExpiry', e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Maintenance */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-purple-600" />
              Maintenance Schedule
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Maintenance
                </label>
                <input
                  type="date"
                  value={formData.lastMaintenance}
                  onChange={(e) => handleInputChange('lastMaintenance', e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Next Maintenance
                </label>
                <input
                  type="date"
                  value={formData.nextMaintenance}
                  onChange={(e) => handleInputChange('nextMaintenance', e.target.value)}
                  className="input"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  className="input h-24 resize-none"
                  placeholder="Additional notes about the vehicle..."
                />
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex flex-col sm:flex-row sm:justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary w-full sm:w-auto touch-manipulation"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary w-full sm:w-auto flex items-center justify-center space-x-2 touch-manipulation"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isLoading ? 'Saving...' : (vehicle ? 'Update Vehicle' : 'Add Vehicle')}</span>
            </button>
          </div>
        </form>
        </div>
      </motion.div>
    </div>
  );
};

export default VehicleFormModal; 