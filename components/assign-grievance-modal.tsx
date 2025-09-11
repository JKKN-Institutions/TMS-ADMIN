'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  User,
  UserCheck,
  Calendar,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  Settings,
  Star,
  Loader2,
  Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import EnhancedStaffPicker from './enhanced-staff-picker';

interface AssignGrievanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (grievanceId: string, assignmentData: any) => void;
  grievance: any;
}

const AssignGrievanceModal: React.FC<AssignGrievanceModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  grievance
}) => {
  const [formData, setFormData] = useState({
    assignedTo: '',
    assignedToName: '',
    assignedToRole: '',
    priority: '',
    notes: '',
    expectedResolutionDate: ''
  });

  const [showStaffPicker, setShowStaffPicker] = useState(false);

  console.log('🔍 Assignment Modal State:', { isOpen, grievance: grievance?.id });

  if (!isOpen || !grievance) return null;

  const priorityLevels = [
    { value: 'low', label: 'Low Priority', color: 'text-green-600', description: 'Can be resolved in due course' },
    { value: 'medium', label: 'Medium Priority', color: 'text-yellow-600', description: 'Should be addressed soon' },
    { value: 'high', label: 'High Priority', color: 'text-orange-600', description: 'Needs urgent attention' },
    { value: 'urgent', label: 'Urgent', color: 'text-red-600', description: 'Immediate action required' }
  ];

  const validateForm = () => {
    if (!formData.assignedTo) {
      toast.error('Please select a staff member to assign');
      return false;
    }
    if (!formData.priority) {
      toast.error('Please set the priority level');
      return false;
    }
    if (!formData.expectedResolutionDate) {
      toast.error('Please set an expected resolution date');
      return false;
    }
    return true;
  };

  const handleAssign = () => {
    console.log('🎯 Assignment button clicked in modal');
    console.log('📝 Form data:', formData);
    console.log('📋 Grievance data:', grievance);
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      return;
    }

    console.log('✅ Form validation passed');

    const assignmentData = {
      assigned_to: formData.assignedTo,
      priority: formData.priority,
      notes: formData.notes,
      expected_resolution_date: formData.expectedResolutionDate,
      assigned_at: new Date().toISOString(),
      assigned_by: 'current_admin',
      status: 'in_progress',
      assigned_staff_name: formData.assignedToName,
      assigned_staff_role: formData.assignedToRole
    };

    console.log('📦 Assignment data prepared:', assignmentData);
    console.log('🚀 Calling onAssign function...');
    
    onAssign(grievance.id, assignmentData);
    onClose();
    
    // Reset form
    setFormData({
      assignedTo: '',
      assignedToName: '',
      assignedToRole: '',
      priority: '',
      notes: '',
      expectedResolutionDate: ''
    });
  };

  const handleStaffSelect = (staff: any) => {
    setFormData(prev => ({
      ...prev,
      assignedTo: staff.id,
      assignedToName: staff.name,
      assignedToRole: staff.role
    }));
    setShowStaffPicker(false);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'complaint': return AlertTriangle;
      case 'suggestion': return MessageCircle;
      case 'compliment': return CheckCircle;
      case 'technical_issue': return Settings;
      default: return MessageCircle;
    }
  };

  const CategoryIcon = getCategoryIcon(grievance.category);

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[95vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Assign Grievance</h2>
                <p className="text-sm text-gray-600">Assign this grievance to a staff member</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[calc(95vh-200px)]">
            <div className="p-6 space-y-6">
              {/* Grievance Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Grievance Summary</h3>
                <div className="flex items-start space-x-3">
                  <CategoryIcon className="w-5 h-5 text-purple-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{grievance.subject}</h4>
                    <p className="text-sm text-gray-600 line-clamp-2">{grievance.description}</p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                      <span className="capitalize">{grievance.category.replace('_', ' ')}</span>
                      <span>•</span>
                      <span className="capitalize">{grievance.priority} Priority</span>
                      <span>•</span>
                      <span>{new Date(grievance.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Staff Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Assign To Staff Member</label>
                
                {formData.assignedTo ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-medium text-sm">
                            {formData.assignedToName.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-blue-900">{formData.assignedToName}</p>
                          <p className="text-sm text-blue-700 capitalize">
                            {formData.assignedToRole.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowStaffPicker(true)}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowStaffPicker(true)}
                    className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors flex items-center justify-center space-x-2 text-gray-600 hover:text-gray-800"
                  >
                    <Users className="w-5 h-5" />
                    <span>Select Staff Member</span>
                  </button>
                )}
              </div>

              {/* Priority Setting */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Set Priority Level</label>
                <div className="grid grid-cols-2 gap-3">
                  {priorityLevels.map((priority) => (
                    <button
                      key={priority.value}
                      onClick={() => setFormData(prev => ({ ...prev, priority: priority.value }))}
                      className={`p-3 border-2 rounded-lg text-left transition-colors ${
                        formData.priority === priority.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div>
                        <p className={`font-medium ${priority.color}`}>{priority.label}</p>
                        <p className="text-sm text-gray-600">{priority.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Expected Resolution Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expected Resolution Date</label>
                <input
                  type="date"
                  value={formData.expectedResolutionDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, expectedResolutionDate: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Assignment Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Notes (Optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add any special instructions or context for the assignee..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 h-24 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                This will assign the grievance and notify the selected staff member.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssign}
                  disabled={!formData.assignedTo || !formData.priority}
                  className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Assign Grievance</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Enhanced Staff Picker */}
      <EnhancedStaffPicker
        isOpen={showStaffPicker}
        onClose={() => setShowStaffPicker(false)}
        onSelectStaff={handleStaffSelect}
        grievanceCategory={grievance.category}
        grievancePriority={grievance.priority}
        selectedStaffId={formData.assignedTo}
        title="Select Staff Member for Assignment"
        showRecommendations={true}
      />
    </>
  );
};

export default AssignGrievanceModal; 