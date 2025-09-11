'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Users,
  User,
  UserCheck,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SimpleBulkAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBulkAssign: (grievanceIds: string[], assignmentData: any) => void;
  selectedGrievances: any[];
}

const SimpleBulkAssignModal: React.FC<SimpleBulkAssignModalProps> = ({
  isOpen,
  onClose,
  onBulkAssign,
  selectedGrievances
}) => {
  const [formData, setFormData] = useState({
    assignmentType: 'single',
    assignedTo: '',
    priority: 'keep_existing',
    expectedResolutionDate: ''
  });

  if (!isOpen || !selectedGrievances.length) return null;

  const staffMembers = [
    { id: 'Dr. Sarah Johnson', name: 'Dr. Sarah Johnson', role: 'Transport Manager' },
    { id: 'Mr. Raj Patel', name: 'Mr. Raj Patel', role: 'Route Supervisor' },
    { id: 'Ms. Priya Sharma', name: 'Ms. Priya Sharma', role: 'Student Affairs Officer' },
    { id: 'Mr. Kumar Singh', name: 'Mr. Kumar Singh', role: 'Fleet Manager' },
    { id: 'Ms. Anjali Gupta', name: 'Ms. Anjali Gupta', role: 'Customer Service Lead' }
  ];

  const handleSubmit = () => {
    if (formData.assignmentType === 'single' && !formData.assignedTo) {
      toast.error('Please select a staff member');
      return;
    }
    if (!formData.expectedResolutionDate) {
      toast.error('Please set an expected resolution date');
      return;
    }

    const assignmentData = {
      type: formData.assignmentType,
      assignedTo: formData.assignedTo,
      priority: formData.priority,
      expectedResolutionDate: new Date(formData.expectedResolutionDate),
      assignedAt: new Date()
    };

    onBulkAssign(selectedGrievances.map(g => g.id), assignmentData);
    onClose();
    
    setFormData({
      assignmentType: 'single',
      assignedTo: '',
      priority: 'keep_existing',
      expectedResolutionDate: ''
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Bulk Assign Grievances</h2>
              <p className="text-sm text-gray-600">Assign {selectedGrievances.length} selected grievances</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              You have selected {selectedGrievances.length} grievances for bulk assignment.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Assignment Strategy</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setFormData(prev => ({ ...prev, assignmentType: 'single' }))}
                className={`p-4 border-2 rounded-lg text-left ${
                  formData.assignmentType === 'single'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200'
                }`}
              >
                <User className="w-5 h-5 text-indigo-600 mb-2" />
                <p className="font-medium">Single Assignment</p>
                <p className="text-sm text-gray-600">Assign all to one person</p>
              </button>
              
              <button
                onClick={() => setFormData(prev => ({ ...prev, assignmentType: 'distribute' }))}
                className={`p-4 border-2 rounded-lg text-left ${
                  formData.assignmentType === 'distribute'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200'
                }`}
              >
                <Users className="w-5 h-5 text-indigo-600 mb-2" />
                <p className="font-medium">Auto Distribute</p>
                <p className="text-sm text-gray-600">Distribute among team</p>
              </button>
            </div>
          </div>

          {formData.assignmentType === 'single' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Staff Member</label>
              <select
                value={formData.assignedTo}
                onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Choose a staff member...</option>
                {staffMembers.map((staff) => (
                  <option key={staff.id} value={staff.name}>
                    {staff.name} - {staff.role}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority Setting</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="keep_existing">Keep existing priorities</option>
              <option value="low">Set all to Low</option>
              <option value="medium">Set all to Medium</option>
              <option value="high">Set all to High</option>
              <option value="urgent">Set all to Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Expected Resolution Date</label>
            <input
              type="date"
              value={formData.expectedResolutionDate}
              onChange={(e) => setFormData(prev => ({ ...prev, expectedResolutionDate: e.target.value }))}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 flex items-center space-x-2"
            >
              <Zap className="w-4 h-4" />
              <span>Assign {selectedGrievances.length} Grievances</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SimpleBulkAssignModal; 