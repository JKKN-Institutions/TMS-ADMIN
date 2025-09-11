'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Edit,
  MessageCircle,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface GrievanceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (grievanceId: string, updateData: any) => void;
  grievance: any;
}

const GrievanceUpdateModal: React.FC<GrievanceUpdateModalProps> = ({
  isOpen,
  onClose,
  onUpdate,
  grievance
}) => {
  const [formData, setFormData] = useState({
    status: '',
    priority: '',
    updateNote: '',
    estimatedResolutionDate: '',
    isPublicUpdate: true
  });

  useEffect(() => {
    if (grievance) {
      setFormData({
        status: grievance.status || '',
        priority: grievance.priority || '',
        updateNote: '',
        estimatedResolutionDate: '',
        isPublicUpdate: true
      });
    }
  }, [grievance]);

  if (!isOpen || !grievance) return null;

  const statusOptions = [
    { value: 'open', label: 'Open', description: 'Grievance is open and awaiting action', color: 'text-red-600' },
    { value: 'in_progress', label: 'In Progress', description: 'Currently being worked on', color: 'text-yellow-600' },
    { value: 'pending_approval', label: 'Pending Approval', description: 'Waiting for approval', color: 'text-blue-600' },
    { value: 'on_hold', label: 'On Hold', description: 'Temporarily paused', color: 'text-gray-600' },
    { value: 'resolved', label: 'Resolved', description: 'Issue has been resolved', color: 'text-green-600' },
    { value: 'closed', label: 'Closed', description: 'Grievance is closed', color: 'text-gray-700' },
    { value: 'escalated', label: 'Escalated', description: 'Escalated to higher authority', color: 'text-purple-600' }
  ];

  const priorityLevels = [
    { value: 'low', label: 'Low Priority', color: 'text-green-600', description: 'Can be resolved in due course' },
    { value: 'medium', label: 'Medium Priority', color: 'text-yellow-600', description: 'Should be addressed soon' },
    { value: 'high', label: 'High Priority', color: 'text-orange-600', description: 'Needs urgent attention' },
    { value: 'urgent', label: 'Urgent', color: 'text-red-600', description: 'Immediate action required' }
  ];

  const validateForm = () => {
    // Check if any changes were made
    const hasStatusChange = formData.status !== grievance.status;
    const hasPriorityChange = formData.priority !== grievance.priority;
    const hasNote = formData.updateNote.trim().length > 0;
    const hasDateChange = formData.estimatedResolutionDate.length > 0;
    
    // Require at least one change
    if (!hasStatusChange && !hasPriorityChange && !hasNote && !hasDateChange) {
      toast.error('Please make at least one change (status, priority, date, or add a note)');
      return false;
    }
    
    return true;
  };

  const handleUpdate = () => {
    if (!validateForm()) return;

    const updateData = {
      status: formData.status,
      priority: formData.priority,
      updateNote: formData.updateNote.trim(),
      estimatedResolutionDate: formData.estimatedResolutionDate ? new Date(formData.estimatedResolutionDate) : null,
      isPublicUpdate: formData.isPublicUpdate,
      updatedAt: new Date(),
      updatedBy: 'current_admin'
    };

    onUpdate(grievance.id, updateData);
    onClose();
    
    // Reset form
    setFormData({
      status: grievance.status || '',
      priority: grievance.priority || '',
      updateNote: '',
      estimatedResolutionDate: '',
      isPublicUpdate: true
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'complaint': return AlertTriangle;
      case 'suggestion': return MessageCircle;
      case 'compliment': return CheckCircle;
      case 'technical_issue': return Edit;
      default: return MessageCircle;
    }
  };

  const CategoryIcon = getCategoryIcon(grievance.category);

  const hasChanges = formData.status !== grievance.status || 
                     formData.priority !== grievance.priority || 
                     formData.updateNote.trim().length > 0 ||
                     formData.estimatedResolutionDate.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Edit className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Update Grievance</h2>
              <p className="text-sm text-gray-600">Update status, priority, and add notes</p>
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
                <CategoryIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{grievance.subject}</h4>
                  <p className="text-sm text-gray-600 line-clamp-2">{grievance.description}</p>
                  <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                    <span className="capitalize">{grievance.category.replace('_', ' ')}</span>
                    <span>•</span>
                    <span>Current: {grievance.status.replace('_', ' ')}</span>
                    <span>•</span>
                    <span>{new Date(grievance.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Update */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Status</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {statusOptions.map((status) => (
                  <button
                    key={status.value}
                    onClick={() => setFormData(prev => ({ ...prev, status: status.value }))}
                    className={`p-3 border-2 rounded-lg text-left transition-colors ${
                      formData.status === status.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <p className={`font-medium ${status.color}`}>{status.label}</p>
                      <p className="text-sm text-gray-600 mt-1">{status.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority Update */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Priority Level</label>
              <div className="grid grid-cols-2 gap-3">
                {priorityLevels.map((priority) => (
                  <button
                    key={priority.value}
                    onClick={() => setFormData(prev => ({ ...prev, priority: priority.value }))}
                    className={`p-3 border-2 rounded-lg text-left transition-colors ${
                      formData.priority === priority.value
                        ? 'border-blue-500 bg-blue-50'
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

            {/* Update Note */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Update Note (Optional)</label>
              <textarea
                value={formData.updateNote}
                onChange={(e) => setFormData(prev => ({ ...prev, updateNote: e.target.value }))}
                placeholder="Describe what has been done, current status, next steps, or any other relevant information..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Note is optional when changing status or priority
              </p>
            </div>

            {/* Estimated Resolution Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Resolution Date (Optional)</label>
              <input
                type="date"
                value={formData.estimatedResolutionDate}
                onChange={(e) => setFormData(prev => ({ ...prev, estimatedResolutionDate: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Public Update */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="isPublicUpdate"
                  checked={formData.isPublicUpdate}
                  onChange={(e) => setFormData(prev => ({ ...prev, isPublicUpdate: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isPublicUpdate" className="text-sm font-medium text-gray-700">
                  Make this update visible to the student
                </label>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {formData.isPublicUpdate 
                  ? 'The student will be notified about this update and can see the progress.'
                  : 'This will be an internal update only, not visible to the student.'
                }
              </p>
            </div>

            {/* Changes Summary */}
            {hasChanges && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-3">Changes Summary</h3>
                <div className="space-y-2 text-sm">
                  {formData.status !== grievance.status && (
                    <div className="flex justify-between">
                      <span className="text-blue-700">Status:</span>
                      <span className="text-blue-900 font-medium">
                        {grievance.status.replace('_', ' ')} → {formData.status.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                  {formData.priority !== grievance.priority && (
                    <div className="flex justify-between">
                      <span className="text-blue-700">Priority:</span>
                      <span className="text-blue-900 font-medium">
                        {grievance.priority} → {formData.priority}
                      </span>
                    </div>
                  )}
                  {formData.updateNote.trim().length > 0 && (
                    <div>
                      <span className="text-blue-700">Update Note:</span>
                      <p className="text-blue-900 mt-1">{formData.updateNote}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {formData.isPublicUpdate ? 'Student will be notified of this update.' : 'Internal update only.'}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Edit className="w-4 h-4" />
                <span>Update Grievance</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default GrievanceUpdateModal; 