'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Wrench,
  Calendar,
  AlertTriangle,
  Save,
  Clock,
  FileText,
  DollarSign,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface MaintenanceData {
  vehicleId: string;
  maintenanceType: 'routine' | 'repair' | 'inspection' | 'emergency';
  scheduledDate: string;
  estimatedDuration: number;
  description: string;
  serviceProvider: string;
  estimatedCost: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  notes: string;
}

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  vehicle: any;
}

const MaintenanceModal: React.FC<MaintenanceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  vehicle
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    scheduledDate: '',
    maintenanceType: 'routine',
    description: '',
    serviceProvider: '',
    estimatedCost: 0,
    priority: 'medium'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await onSubmit(formData);
      toast.success('Maintenance scheduled successfully!');
      onClose();
    } catch (error) {
      toast.error('Error scheduling maintenance');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !vehicle) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
      >
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <Wrench className="w-6 h-6 text-orange-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Schedule Maintenance</h2>
              <p className="text-sm text-gray-600">{vehicle.registrationNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scheduled Date</label>
            <input
              type="date"
              value={formData.scheduledDate}
              onChange={(e) => setFormData({...formData, scheduledDate: e.target.value})}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Maintenance Type</label>
            <select
              value={formData.maintenanceType}
              onChange={(e) => setFormData({...formData, maintenanceType: e.target.value})}
              className="input"
            >
              <option value="routine">Routine Maintenance</option>
              <option value="repair">Repair</option>
              <option value="inspection">Inspection</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="input h-20 resize-none"
              placeholder="Describe the maintenance work..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Service Provider</label>
            <input
              type="text"
              value={formData.serviceProvider}
              onChange={(e) => setFormData({...formData, serviceProvider: e.target.value})}
              className="input"
              placeholder="Service center name"
              required
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex items-center space-x-2" disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Schedule</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default MaintenanceModal; 