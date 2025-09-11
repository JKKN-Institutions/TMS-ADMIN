'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Users,
  UserCheck,
  Calendar,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  Settings,
  Star,
  ThumbsUp,
  Clock,
  User,
  FileText,
  Zap,
  Target,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BulkAssignGrievancesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBulkAssign: (grievanceIds: string[], assignmentData: any) => void;
  selectedGrievances: any[];
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  currentWorkload: number;
  maxCapacity: number;
  workloadPercentage: number;
  specializations: string[];
  skillLevel: number;
  avgResponseTime: string;
  recentActivity: string;
  performanceRating: number;
  workloadColor: string;
  isAvailable: boolean;
  workloadStatus: string;
}

const BulkAssignGrievancesModal: React.FC<BulkAssignGrievancesModalProps> = ({
  isOpen,
  onClose,
  onBulkAssign,
  selectedGrievances
}) => {
  const [formData, setFormData] = useState({
    assignmentType: 'single', // 'single' or 'distribute'
    assignedTo: '',
    priority: 'keep_existing',
    notes: '',
    expectedResolutionDate: '',
    distributionStrategy: 'balanced' // 'balanced', 'priority_based', 'category_based'
  });

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch admin staff when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAdminStaff();
    }
  }, [isOpen]);

  const fetchAdminStaff = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/staff');
      
      if (!response.ok) {
        throw new Error('Failed to fetch admin staff');
      }
      
      const data = await response.json();
      if (data.success) {
        setStaffMembers(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch admin staff');
      }
    } catch (error) {
      console.error('Error fetching admin staff:', error);
      toast.error('Failed to load admin staff. Please try again.');
      setStaffMembers([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !selectedGrievances || !selectedGrievances.length) return null;

  const priorityLevels = [
    { value: 'keep_existing', label: 'Keep Existing', description: 'Maintain current priority levels' },
    { value: 'low', label: 'Set All to Low', description: 'Set all selected grievances to low priority' },
    { value: 'medium', label: 'Set All to Medium', description: 'Set all selected grievances to medium priority' },
    { value: 'high', label: 'Set All to High', description: 'Set all selected grievances to high priority' },
    { value: 'urgent', label: 'Set All to Urgent', description: 'Set all selected grievances to urgent priority' }
  ];

  const distributionStrategies = [
    { 
      value: 'balanced', 
      label: 'Balanced Distribution', 
      description: 'Distribute evenly based on current workload',
      icon: Target
    },
    { 
      value: 'priority_based', 
      label: 'Priority-Based', 
      description: 'Assign high priority items to senior staff',
      icon: Star
    },
    { 
      value: 'category_based', 
      label: 'Category-Based', 
      description: 'Assign based on staff specializations',
      icon: Settings
    }
  ];

  // Calculate assignment recommendations
  const getRecommendedDistribution = () => {
    if (formData.distributionStrategy === 'balanced') {
      return distributeBalanced();
    } else if (formData.distributionStrategy === 'priority_based') {
      return distributePriorityBased();
    } else {
      return distributeCategoryBased();
    }
  };

  const distributeBalanced = () => {
    const availableStaff = staffMembers.filter(s => s.currentWorkload < s.maxCapacity);
    const distribution: { [key: string]: any[] } = {};
    
    availableStaff.forEach(staff => {
      distribution[staff.id] = [];
    });

    selectedGrievances.forEach((grievance, index) => {
      const staffIndex = index % availableStaff.length;
      const staff = availableStaff[staffIndex];
      if (staff) {
        distribution[staff.id].push(grievance);
      }
    });

    return distribution;
  };

  const distributePriorityBased = () => {
    const distribution: { [key: string]: any[] } = {};
    const sortedStaff = [...staffMembers].sort((a, b) => (a.currentWorkload / a.maxCapacity) - (b.currentWorkload / b.maxCapacity));
    
    sortedStaff.forEach(staff => {
      distribution[staff.id] = [];
    });

    const sortedGrievances = [...selectedGrievances].sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      return (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) - (priorityOrder[a.priority as keyof typeof priorityOrder] || 0);
    });

    sortedGrievances.forEach((grievance, index) => {
      const staff = sortedStaff[index % sortedStaff.length];
      if (staff) {
        distribution[staff.id].push(grievance);
      }
    });

    return distribution;
  };

  const distributeCategoryBased = () => {
    const distribution: { [key: string]: any[] } = {};
    
    staffMembers.forEach(staff => {
      distribution[staff.id] = [];
    });

    selectedGrievances.forEach(grievance => {
      const specializedStaff = staffMembers.filter(s => 
        s.specializations.includes(grievance.category) && 
        s.currentWorkload < s.maxCapacity
      );
      
      if (specializedStaff.length > 0) {
        const bestStaff = specializedStaff.sort((a, b) => a.currentWorkload - b.currentWorkload)[0];
        distribution[bestStaff.id].push(grievance);
      } else {
        // Fallback to least loaded staff
        const fallbackStaff = staffMembers.sort((a, b) => a.currentWorkload - b.currentWorkload)[0];
        if (fallbackStaff) {
          distribution[fallbackStaff.id].push(grievance);
        }
      }
    });

    return distribution;
  };

  const validateForm = () => {
    if (formData.assignmentType === 'single' && !formData.assignedTo) {
      toast.error('Please select a staff member for assignment');
      return false;
    }
    if (!formData.expectedResolutionDate) {
      toast.error('Please set an expected resolution date');
      return false;
    }
    return true;
  };

  const handleBulkAssign = () => {
    if (!validateForm()) return;

    let assignmentData;

    if (formData.assignmentType === 'single') {
      // Assign all to one person
      const selectedStaff = staffMembers.find(s => s.id === formData.assignedTo);
      assignmentData = {
        type: 'single',
        assignedTo: formData.assignedTo,
        assignedToName: selectedStaff?.name || 'Unknown',
        assignedToRole: selectedStaff?.role || 'Unknown',
        priority: formData.priority,
        notes: formData.notes,
        expectedResolutionDate: formData.expectedResolutionDate,
        assignedAt: new Date().toISOString(),
        assignedBy: 'current_admin'
      };
    } else {
      // Distribute among multiple staff
      const distribution = getRecommendedDistribution();
      assignmentData = {
        type: 'distribute',
        distribution,
        priority: formData.priority,
        notes: formData.notes,
        expectedResolutionDate: formData.expectedResolutionDate,
        assignedAt: new Date().toISOString(),
        assignedBy: 'current_admin',
        strategy: formData.distributionStrategy
      };
    }

    // Call the API endpoint instead of the onBulkAssign prop
    handleAPIBulkAssign(selectedGrievances.map(g => g.id), assignmentData);
  };

  const handleAPIBulkAssign = async (grievanceIds: string[], assignmentData: any) => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/admin/grievances/bulk-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grievanceIds,
          assignmentData
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        toast.success(result.message || 'Grievances assigned successfully');
        
        // Call the original onBulkAssign prop for UI updates
        onBulkAssign(grievanceIds, assignmentData);
        
        onClose();
        
        // Reset form
        setFormData({
          assignmentType: 'single',
          assignedTo: '',
          priority: 'keep_existing',
          notes: '',
          expectedResolutionDate: '',
          distributionStrategy: 'balanced'
        });
      } else {
        throw new Error(result.error || 'Failed to assign grievances');
      }
    } catch (error) {
      console.error('Bulk assignment error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to assign grievances');
    } finally {
      setLoading(false);
    }
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

  const getWorkloadColor = (staff: StaffMember) => {
    const percentage = staff.workloadPercentage;
    if (percentage >= 90) return 'text-red-600 bg-red-100';
    if (percentage >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  // Group grievances by category and priority for display
  const grievanceStats = {
    byCategory: selectedGrievances.reduce((acc: any, g) => {
      acc[g.category] = (acc[g.category] || 0) + 1;
      return acc;
    }, {}),
    byPriority: selectedGrievances.reduce((acc: any, g) => {
      acc[g.priority] = (acc[g.priority] || 0) + 1;
      return acc;
    }, {}),
    total: selectedGrievances.length
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Bulk Assign Grievances</h2>
              <p className="text-sm text-gray-600">Assign {selectedGrievances.length} grievances to staff members</p>
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
            {/* Selection Summary */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-3 flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>Selected Grievances Summary</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{grievanceStats.total}</p>
                    <p className="text-sm text-gray-600">Total Selected</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">By Category</h4>
                  <div className="space-y-1">
                    {Object.entries(grievanceStats.byCategory).map(([category, count]) => (
                      <div key={category} className="flex justify-between text-xs">
                        <span className="capitalize">{category.replace('_', ' ')}</span>
                        <span className="font-medium">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">By Priority</h4>
                  <div className="space-y-1">
                    {Object.entries(grievanceStats.byPriority).map(([priority, count]) => (
                      <div key={priority} className="flex justify-between text-xs">
                        <span className="capitalize">{priority}</span>
                        <span className="font-medium">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Assignment Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Assignment Strategy</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setFormData(prev => ({ ...prev, assignmentType: 'single' }))}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    formData.assignmentType === 'single'
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-indigo-600" />
                    <div>
                      <p className="font-medium text-gray-900">Single Assignment</p>
                      <p className="text-sm text-gray-600">Assign all grievances to one staff member</p>
                    </div>
                  </div>
                </button>
                
                <button
                  onClick={() => setFormData(prev => ({ ...prev, assignmentType: 'distribute' }))}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    formData.assignmentType === 'distribute'
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Users className="w-5 h-5 text-indigo-600" />
                    <div>
                      <p className="font-medium text-gray-900">Smart Distribution</p>
                      <p className="text-sm text-gray-600">Distribute among multiple staff members</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Single Assignment */}
            {formData.assignmentType === 'single' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Select Staff Member</label>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="ml-2 text-gray-600">Loading admin staff...</span>
                  </div>
                ) : staffMembers.length > 0 ? (
                  <div className="space-y-2">
                    {staffMembers.map((staff) => (
                      <button
                        key={staff.id}
                        onClick={() => setFormData(prev => ({ ...prev, assignedTo: staff.id }))}
                        className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${
                          formData.assignedTo === staff.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                              <span className="text-white font-medium text-sm">
                                {staff.name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{staff.name}</p>
                              <p className="text-sm text-gray-600 capitalize">
                                {staff.role.replace('_', ' ')} • {staff.email}
                              </p>
                              <p className="text-xs text-gray-500">
                                Specializes in: {staff.specializations.length > 0 
                                  ? staff.specializations.join(', ') 
                                  : 'General administration'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getWorkloadColor(staff)}`}>
                              {staff.currentWorkload}/{staff.maxCapacity}
                            </span>
                            <p className="text-xs text-gray-500 mt-1">
                              {staff.workloadPercentage}% load
                            </p>
                            <div className="flex items-center mt-1">
                              <Star className="w-3 h-3 text-yellow-500 mr-1" />
                              <span className="text-xs text-gray-500">
                                {staff.performanceRating.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>No admin staff available for assignment.</p>
                    <button
                      onClick={fetchAdminStaff}
                      className="mt-2 text-indigo-600 hover:text-indigo-700"
                    >
                      Retry loading
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Distribution Strategy */}
            {formData.assignmentType === 'distribute' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Distribution Strategy</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {distributionStrategies.map((strategy) => {
                    const IconComponent = strategy.icon;
                    return (
                      <button
                        key={strategy.value}
                        onClick={() => setFormData(prev => ({ ...prev, distributionStrategy: strategy.value }))}
                        className={`p-4 border-2 rounded-lg text-center transition-colors ${
                          formData.distributionStrategy === strategy.value
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <IconComponent className="w-6 h-6 mx-auto mb-2 text-indigo-600" />
                        <p className="font-medium text-gray-900 mb-1">{strategy.label}</p>
                        <p className="text-xs text-gray-600">{strategy.description}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Distribution Preview */}
                {formData.distributionStrategy && staffMembers.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4 mt-4">
                    <h4 className="font-medium text-gray-900 mb-3">Distribution Preview</h4>
                    <div className="space-y-2">
                      {Object.entries(getRecommendedDistribution()).map(([staffId, grievances]) => {
                        const staff = staffMembers.find(s => s.id === staffId);
                        const grievanceList = grievances as any[];
                        if (!staff || grievanceList.length === 0) return null;
                        
                        return (
                          <div key={staffId} className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium text-gray-900">{staff.name}</p>
                                <p className="text-sm text-gray-600 capitalize">
                                  {staff.role.replace('_', ' ')}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="font-medium text-indigo-600">{grievanceList.length} grievances</span>
                                <p className="text-xs text-gray-500">
                                  New load: {staff.currentWorkload + grievanceList.length}/{staff.maxCapacity}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Priority Setting */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Priority Management</label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {priorityLevels.map((priority) => (
                  <button
                    key={priority.value}
                    onClick={() => setFormData(prev => ({ ...prev, priority: priority.value }))}
                    className={`p-3 border-2 rounded-lg text-left transition-colors ${
                      formData.priority === priority.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900 mb-1">{priority.label}</p>
                    <p className="text-xs text-gray-600">{priority.description}</p>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Assignment Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Notes (Optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add any special instructions or context for the assignees..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {formData.assignmentType === 'single' 
                ? `All ${selectedGrievances.length} grievances will be assigned to one staff member.`
                : `${selectedGrievances.length} grievances will be distributed among available staff.`
              }
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={loading || (formData.assignmentType === 'single' && !formData.assignedTo)}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserCheck className="w-4 h-4" />
                <span>Assign {selectedGrievances.length} Grievances</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default BulkAssignGrievancesModal; 