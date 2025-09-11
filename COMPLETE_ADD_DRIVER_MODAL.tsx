'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Loader2, User, Phone, FileText } from 'lucide-react';
import { DatabaseService } from '@/lib/database';
import toast from 'react-hot-toast';

interface AddDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddDriverModal = ({ isOpen, onClose, onSuccess }: AddDriverModalProps) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'contact' | 'professional'>('personal');
  
  const [formData, setFormData] = useState({
    name: '',
    licenseNumber: '',
    experienceYears: '',
    status: 'active',
    phone: '',
    email: '',
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    licenseExpiry: '',
    medicalCertificateExpiry: '',
    rating: '4.0',
    totalTrips: '0'
  });

  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const newErrors: any = {};

    // Personal Info Validation
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.licenseNumber.trim()) newErrors.licenseNumber = 'License number is required';
    if (!formData.experienceYears) {
      newErrors.experienceYears = 'Experience years is required';
    } else if (parseInt(formData.experienceYears) < 0) {
      newErrors.experienceYears = 'Experience years must be positive';
    }

    // Contact Info Validation
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[0-9]{10}$/.test(formData.phone.replace(/\D/g, ''))) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Professional Info Validation
    if (formData.rating && (parseFloat(formData.rating) < 0 || parseFloat(formData.rating) > 5)) {
      newErrors.rating = 'Rating must be between 0 and 5';
    }

    if (formData.totalTrips && parseInt(formData.totalTrips) < 0) {
      newErrors.totalTrips = 'Total trips must be positive';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const driverData = {
        name: formData.name.trim(),
        licenseNumber: formData.licenseNumber.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || null,
        experienceYears: parseInt(formData.experienceYears),
        status: formData.status,
        address: formData.address.trim() || null,
        emergencyContactName: formData.emergencyContactName.trim() || null,
        emergencyContactPhone: formData.emergencyContactPhone.trim() || null,
        licenseExpiry: formData.licenseExpiry || null,
        medicalCertificateExpiry: formData.medicalCertificateExpiry || null,
        rating: parseFloat(formData.rating),
        totalTrips: parseInt(formData.totalTrips)
      };
      
      await DatabaseService.addDriver(driverData);
      
      toast.success('Driver added successfully!');
      
      handleClose();
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error adding driver:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add driver';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      licenseNumber: '',
      experienceYears: '',
      status: 'active',
      phone: '',
      email: '',
      address: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      licenseExpiry: '',
      medicalCertificateExpiry: '',
      rating: '4.0',
      totalTrips: '0'
    });
    setErrors({});
    setActiveTab('personal');
    onClose();
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
          <h2 className="text-2xl font-bold text-gray-900">Add New Driver</h2>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 ${
              activeTab === 'personal'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Personal Info</span>
          </button>
          <button
            onClick={() => setActiveTab('contact')}
            className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 ${
              activeTab === 'contact'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span>Contact Info</span>
          </button>
          <button
            onClick={() => setActiveTab('professional')}
            className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 ${
              activeTab === 'professional'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Professional Info</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Personal Info Tab */}
          {activeTab === 'personal' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">👤 Driver Personal Information</h3>
                <p className="text-blue-700 text-sm">
                  Enter the driver's basic personal details and license information.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`input ${errors.name ? 'border-red-500' : ''}`}
                    placeholder="Enter driver's full name"
                    disabled={loading}
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Number *</label>
                  <input
                    type="text"
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className={`input ${errors.licenseNumber ? 'border-red-500' : ''}`}
                    placeholder="DL123456789012"
                    disabled={loading}
                  />
                  {errors.licenseNumber && <p className="text-red-500 text-xs mt-1">{errors.licenseNumber}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Experience (Years) *</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={formData.experienceYears}
                    onChange={(e) => setFormData({ ...formData, experienceYears: e.target.value })}
                    className={`input ${errors.experienceYears ? 'border-red-500' : ''}`}
                    placeholder="5"
                    disabled={loading}
                  />
                  {errors.experienceYears && <p className="text-red-500 text-xs mt-1">{errors.experienceYears}</p>}
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
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Contact Info Tab */}
          {activeTab === 'contact' && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg mb-4">
                <h3 className="text-lg font-semibold text-green-900 mb-2">📞 Contact Information</h3>
                <p className="text-green-700 text-sm">
                  Add contact details and emergency contact information for the driver.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={`input ${errors.phone ? 'border-red-500' : ''}`}
                    placeholder="9876543210"
                    disabled={loading}
                  />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`input ${errors.email ? 'border-red-500' : ''}`}
                    placeholder="driver@example.com"
                    disabled={loading}
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Full residential address"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    value={formData.emergencyContactName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                    className="input"
                    placeholder="Emergency contact person"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.emergencyContactPhone}
                    onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                    className="input"
                    placeholder="Emergency contact number"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Professional Info Tab */}
          {activeTab === 'professional' && (
            <div className="space-y-4">
              <div className="bg-yellow-50 p-4 rounded-lg mb-4">
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">📋 Professional Information</h3>
                <p className="text-yellow-700 text-sm">
                  Professional credentials, ratings, and performance data for the driver.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry Date</label>
                  <input
                    type="date"
                    value={formData.licenseExpiry}
                    onChange={(e) => setFormData({ ...formData, licenseExpiry: e.target.value })}
                    className="input"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medical Certificate Expiry</label>
                  <input
                    type="date"
                    value={formData.medicalCertificateExpiry}
                    onChange={(e) => setFormData({ ...formData, medicalCertificateExpiry: e.target.value })}
                    className="input"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rating (0-5)</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={formData.rating}
                    onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                    className={`input ${errors.rating ? 'border-red-500' : ''}`}
                    placeholder="4.0"
                    disabled={loading}
                  />
                  {errors.rating && <p className="text-red-500 text-xs mt-1">{errors.rating}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Trips</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.totalTrips}
                    onChange={(e) => setFormData({ ...formData, totalTrips: e.target.value })}
                    className={`input ${errors.totalTrips ? 'border-red-500' : ''}`}
                    placeholder="0"
                    disabled={loading}
                  />
                  {errors.totalTrips && <p className="text-red-500 text-xs mt-1">{errors.totalTrips}</p>}
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
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding Driver...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Driver
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddDriverModal; 