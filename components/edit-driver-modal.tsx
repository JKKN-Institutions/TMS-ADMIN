'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Loader2, User, Phone, FileText } from 'lucide-react';

import toast from 'react-hot-toast';

interface EditDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  driver: any;
}

const EditDriverModal = ({ isOpen, onClose, onSuccess, driver }: EditDriverModalProps) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'contact' | 'professional'>('personal');
  
  const [formData, setFormData] = useState({
    name: '',
    licenseNumber: '',
    aadharNumber: '',
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

  useEffect(() => {
    if (isOpen && driver) {
      loadDriverData();
    }
  }, [isOpen, driver]);

  const loadDriverData = () => {
    if (!driver) return;
    
    setFormData({
      name: driver.name || driver.driver_name || '',
      licenseNumber: driver.license_number || '',
      aadharNumber: driver.aadhar_number ? driver.aadhar_number.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : '',
      experienceYears: driver.experience_years?.toString() || '',
      status: driver.status || 'active',
      phone: driver.phone || driver.phone_number || '',
      email: driver.email || '',
      address: driver.address || '',
      emergencyContactName: driver.emergency_contact_name || '',
      emergencyContactPhone: driver.emergency_contact_phone || '',
      licenseExpiry: driver.license_expiry || '',
      medicalCertificateExpiry: driver.medical_certificate_expiry || '',
      rating: driver.rating?.toString() || '4.0',
      totalTrips: driver.total_trips?.toString() || '0'
    });
  };

  const validateForm = () => {
    const newErrors: any = {};
    
    if (!formData.name.trim()) newErrors.name = 'Driver name is required';
    if (!formData.licenseNumber.trim()) newErrors.licenseNumber = 'License number is required';
    if (!formData.aadharNumber.trim()) newErrors.aadharNumber = 'Aadhar number is required';
    else if (!/^\d{12}$/.test(formData.aadharNumber.replace(/\s/g, ''))) {
      newErrors.aadharNumber = 'Aadhar number must be 12 digits';
    }
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    else if (!/^\+?[1-9]\d{9,14}$/.test(formData.phone)) newErrors.phone = 'Invalid phone format';
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!formData.experienceYears) newErrors.experienceYears = 'Experience is required';
    else if (parseInt(formData.experienceYears) < 0) newErrors.experienceYears = 'Experience cannot be negative';
    
    if (formData.licenseExpiry) {
      const expiryDate = new Date(formData.licenseExpiry);
      const today = new Date();
      if (expiryDate <= today) newErrors.licenseExpiry = 'License should not be expired';
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
        aadharNumber: formData.aadharNumber.replace(/\s/g, ''), // Remove spaces for database storage
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
      
      console.log('Edit Form Data:', formData);
      console.log('Edit Driver Data to submit:', driverData);
      
      // Use API endpoint instead of DatabaseService directly
      const response = await fetch('/api/admin/drivers', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          driverId: driver.id,
          driverData: driverData
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update driver');
      }
      
      toast.success('Driver updated successfully!');
      
      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
    } catch (error) {
      console.error('Error updating driver:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update driver';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setErrors({});
    setActiveTab('personal');
    onClose();
  };

  if (!isOpen || !driver) return null;

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
            Edit Driver: {driver.name || driver.driver_name}
          </h2>
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
          {/* Personal Information Tab */}
          {activeTab === 'personal' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`input ${errors.name ? 'border-red-500' : ''}`}
                    placeholder="Enter full name"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Aadhar Number *</label>
                  <input
                    type="text"
                    value={formData.aadharNumber}
                    onChange={(e) => {
                      // Allow only digits and format as XXXX XXXX XXXX
                      const value = e.target.value.replace(/\D/g, '');
                      const formatted = value.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
                      setFormData({ ...formData, aadharNumber: formatted });
                    }}
                    className={`input ${errors.aadharNumber ? 'border-red-500' : ''}`}
                    placeholder="1234 5678 9012"
                    maxLength={14}
                    disabled={loading}
                  />
                  {errors.aadharNumber && <p className="text-red-500 text-xs mt-1">{errors.aadharNumber}</p>}
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

          {/* Contact Information Tab */}
          {activeTab === 'contact' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={`input ${errors.phone ? 'border-red-500' : ''}`}
                    placeholder="+91 9876543210"
                    disabled={loading}
                  />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
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
                    placeholder="Enter complete address"
                    rows={3}
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
                    placeholder="Contact person name"
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
                    placeholder="+91 9876543210"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Professional Information Tab */}
          {activeTab === 'professional' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry Date</label>
                  <input
                    type="date"
                    value={formData.licenseExpiry}
                    onChange={(e) => setFormData({ ...formData, licenseExpiry: e.target.value })}
                    className={`input ${errors.licenseExpiry ? 'border-red-500' : ''}`}
                    disabled={loading}
                  />
                  {errors.licenseExpiry && <p className="text-red-500 text-xs mt-1">{errors.licenseExpiry}</p>}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                  <select
                    value={formData.rating}
                    onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                    className="input"
                    disabled={loading}
                  >
                    <option value="5.0">5.0 - Excellent</option>
                    <option value="4.5">4.5 - Very Good</option>
                    <option value="4.0">4.0 - Good</option>
                    <option value="3.5">3.5 - Average</option>
                    <option value="3.0">3.0 - Below Average</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Trips</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.totalTrips}
                    onChange={(e) => setFormData({ ...formData, totalTrips: e.target.value })}
                    className="input"
                    disabled={loading}
                  />
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
                  Updating Driver...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Update Driver
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default EditDriverModal; 