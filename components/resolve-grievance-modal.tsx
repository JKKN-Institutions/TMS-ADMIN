'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  CheckCircle,
  MessageCircle,
  AlertTriangle,
  ThumbsUp,
  Settings
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ResolveGrievanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResolve: (grievanceId: string, resolutionData: any) => void;
  grievance: any;
}

const ResolveGrievanceModal: React.FC<ResolveGrievanceModalProps> = ({
  isOpen,
  onClose,
  onResolve,
  grievance
}) => {
  const [formData, setFormData] = useState({
    resolution: '',
    resolutionType: 'resolved',
    followUpRequired: false,
    followUpDate: '',
    satisfactionLevel: '',
    notes: ''
  });

  if (!isOpen || !grievance) return null;

  const resolutionTypes = [
    { value: 'resolved', label: 'Resolved', description: 'Issue has been completely resolved', color: 'text-green-600' },
    { value: 'partially_resolved', label: 'Partially Resolved', description: 'Issue partially addressed', color: 'text-yellow-600' },
    { value: 'closed_no_action', label: 'Closed - No Action', description: 'No further action required', color: 'text-gray-600' },
    { value: 'escalated', label: 'Escalated', description: 'Escalated to higher authority', color: 'text-orange-600' }
  ];

  const satisfactionLevels = [
    { value: 'excellent', label: 'Excellent', description: 'Exceeded expectations' },
    { value: 'good', label: 'Good', description: 'Met expectations' },
    { value: 'fair', label: 'Fair', description: 'Partially met expectations' },
    { value: 'poor', label: 'Poor', description: 'Did not meet expectations' }
  ];

  const validateForm = () => {
    if (!formData.resolution.trim()) {
      toast.error('Please provide a resolution description');
      return false;
    }
    if (!formData.resolutionType) {
      toast.error('Please select a resolution type');
      return false;
    }
    if (formData.followUpRequired && !formData.followUpDate) {
      toast.error('Please set a follow-up date');
      return false;
    }
    return true;
  };

  const handleResolve = () => {
    if (!validateForm()) return;

    const resolutionData = {
      resolution: formData.resolution.trim(),
      resolutionType: formData.resolutionType,
      followUpRequired: formData.followUpRequired,
      followUpDate: formData.followUpRequired ? new Date(formData.followUpDate) : null,
      satisfactionLevel: formData.satisfactionLevel,
      notes: formData.notes.trim(),
      resolvedAt: new Date(),
      resolvedBy: 'current_admin',
      status: formData.resolutionType === 'escalated' ? 'escalated' : 'resolved'
    };

    onResolve(grievance.id, resolutionData);
    onClose();
    
    // Reset form
    setFormData({
      resolution: '',
      resolutionType: 'resolved',
      followUpRequired: false,
      followUpDate: '',
      satisfactionLevel: '',
      notes: ''
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'complaint': return AlertTriangle;
      case 'suggestion': return MessageCircle;
      case 'compliment': return ThumbsUp;
      case 'technical_issue': return Settings;
      default: return MessageCircle;
    }
  };

  const CategoryIcon = getCategoryIcon(grievance.category);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-600 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Resolve Grievance</h2>
              <p className="text-sm text-gray-600">Provide resolution and close the grievance</p>
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
                <CategoryIcon className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{grievance.subject}</h4>
                  <p className="text-sm text-gray-600 mt-1">{grievance.description}</p>
                  <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
                    <span className="capitalize">{grievance.category.replace('_', ' ')}</span>
                    <span>•</span>
                    <span className="capitalize">{grievance.priority} Priority</span>
                    <span>•</span>
                    <span>Created: {new Date(grievance.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resolution Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Resolution Type</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resolutionTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setFormData(prev => ({ ...prev, resolutionType: type.value }))}
                    className={`p-4 border-2 rounded-lg text-left transition-colors ${
                      formData.resolutionType === type.value
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <p className={`font-medium ${type.color}`}>{type.label}</p>
                      <p className="text-sm text-gray-600 mt-1">{type.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Resolution Description</label>
              <textarea
                value={formData.resolution}
                onChange={(e) => setFormData(prev => ({ ...prev, resolution: e.target.value }))}
                placeholder="Describe how the grievance was resolved, what actions were taken, and any outcomes..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 h-32 resize-none"
              />
            </div>

            {/* Follow-up Required */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-3">
                <input
                  type="checkbox"
                  id="followUpRequired"
                  checked={formData.followUpRequired}
                  onChange={(e) => setFormData(prev => ({ ...prev, followUpRequired: e.target.checked }))}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="followUpRequired" className="text-sm font-medium text-gray-700">
                  Follow-up Required
                </label>
              </div>
              
              {formData.followUpRequired && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Follow-up Date</label>
                  <input
                    type="date"
                    value={formData.followUpDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, followUpDate: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}
            </div>

            {/* Satisfaction Level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Expected Satisfaction Level</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {satisfactionLevels.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setFormData(prev => ({ ...prev, satisfactionLevel: level.value }))}
                    className={`p-3 border-2 rounded-lg text-center transition-colors ${
                      formData.satisfactionLevel === level.value
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{level.label}</p>
                      <p className="text-xs text-gray-600 mt-1">{level.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes (Optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional notes, lessons learned, or recommendations..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 h-24 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              This will mark the grievance as resolved and notify the student.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Mark as Resolved</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ResolveGrievanceModal; 