'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Filter,
  Star,
  Activity,
  Clock,
  AlertCircle,
  CheckCircle,
  UserCheck,
  MoreHorizontal,
  TrendingUp,
  Award,
  Target,
  Zap,
  User,
  X,
  ChevronDown,
  ChevronUp,
  Settings,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';

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

interface EnhancedStaffPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStaff: (staffMember: StaffMember) => void;
  grievanceCategory?: string;
  grievancePriority?: string;
  selectedStaffId?: string;
  title?: string;
  showRecommendations?: boolean;
}

const EnhancedStaffPicker: React.FC<EnhancedStaffPickerProps> = ({
  isOpen,
  onClose,
  onSelectStaff,
  grievanceCategory = '',
  grievancePriority = '',
  selectedStaffId = '',
  title = 'Select Staff Member',
  showRecommendations = true
}) => {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('workload');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchStaffMembers();
      if (showRecommendations && grievanceCategory) {
        fetchRecommendations();
      }
    }
  }, [isOpen, grievanceCategory, grievancePriority, showRecommendations]);

  const fetchStaffMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/staff');
      
      if (!response.ok) {
        throw new Error('Failed to fetch staff members');
      }
      
      const data = await response.json();
      if (data.success) {
        setStaffMembers(data.data);
        
        // Auto-select if selectedStaffId is provided
        if (selectedStaffId) {
          const selected = data.data.find((staff: StaffMember) => staff.id === selectedStaffId);
          if (selected) {
            setSelectedStaff(selected);
          }
        }
      } else {
        throw new Error(data.error || 'Failed to fetch staff members');
      }
    } catch (error) {
      console.error('Error fetching staff members:', error);
      toast.error('Failed to load staff members');
      setStaffMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async () => {
    try {
      const response = await fetch('/api/admin/staff/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: grievanceCategory,
          priority: grievancePriority
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRecommendations(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    }
  };

  const filteredAndSortedStaff = useMemo(() => {
    let filtered = staffMembers.filter(staff => {
      const matchesSearch = staff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           staff.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           staff.role.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRole = roleFilter === 'all' || staff.role === roleFilter;
      
      const matchesAvailability = availabilityFilter === 'all' ||
                                  (availabilityFilter === 'available' && staff.isAvailable) ||
                                  (availabilityFilter === 'busy' && staff.workloadStatus === 'busy') ||
                                  (availabilityFilter === 'overloaded' && staff.workloadStatus === 'overloaded');
      
      return matchesSearch && matchesRole && matchesAvailability;
    });

    // Sort the filtered results
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'workload':
          aValue = a.workloadPercentage;
          bValue = b.workloadPercentage;
          break;
        case 'performance':
          aValue = a.performanceRating;
          bValue = b.performanceRating;
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'role':
          aValue = a.role.toLowerCase();
          bValue = b.role.toLowerCase();
          break;
        case 'skillLevel':
          aValue = a.skillLevel;
          bValue = b.skillLevel;
          break;
        default:
          aValue = a.workloadPercentage;
          bValue = b.workloadPercentage;
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [staffMembers, searchTerm, roleFilter, availabilityFilter, sortBy, sortOrder]);

  const handleStaffSelect = (staff: StaffMember) => {
    setSelectedStaff(staff);
  };

  const handleConfirmSelection = () => {
    if (selectedStaff) {
      onSelectStaff(selectedStaff);
      onClose();
    }
  };

  const getWorkloadIcon = (status: string) => {
    switch (status) {
      case 'available': return CheckCircle;
      case 'busy': return Clock;
      case 'overloaded': return AlertCircle;
      default: return Activity;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin': return Award;
      case 'operations_admin': return Target;
      case 'transport_manager': return TrendingUp;
      case 'finance_admin': return Star;
      default: return User;
    }
  };

  const getSpecializationMatch = (staff: StaffMember) => {
    if (!grievanceCategory) return 0;
    return staff.specializations.includes(grievanceCategory) ? 100 : 0;
  };

  const uniqueRoles = [...new Set(staffMembers.map(s => s.role))];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-600">
                Choose the best staff member for this assignment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search staff by name, email, or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Quick Sort */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="workload">Workload</option>
                <option value="performance">Performance</option>
                <option value="name">Name</option>
                <option value="role">Role</option>
                <option value="skillLevel">Skill Level</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {/* Filters Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
          </div>

          {/* Expanded Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 p-4 bg-white rounded-lg border border-gray-200"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Roles</option>
                      {uniqueRoles.map(role => (
                        <option key={role} value={role}>
                          {role.replace('_', ' ').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Availability</label>
                    <select
                      value={availabilityFilter}
                      onChange={(e) => setAvailabilityFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Staff</option>
                      <option value="available">Available</option>
                      <option value="busy">Busy</option>
                      <option value="overloaded">Overloaded</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recommendations Section */}
        {showRecommendations && recommendations.length > 0 && (
          <div className="p-6 border-b border-gray-200 bg-blue-50">
            <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-blue-600" />
              Recommended for this grievance
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recommendations.slice(0, 3).map((rec, index) => {
                const staff = staffMembers.find(s => s.id === rec.admin_id);
                if (!staff) return null;
                
                return (
                  <div
                    key={staff.id}
                    onClick={() => handleStaffSelect(staff)}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      selectedStaff?.id === staff.id
                        ? 'border-blue-500 bg-blue-100'
                        : 'border-blue-200 hover:border-blue-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-600">
                        #{index + 1} Recommended
                      </span>
                      <span className="text-sm text-blue-500">
                        {rec.match_score}% match
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-medium text-sm">
                          {staff.name.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{staff.name}</p>
                        <p className="text-sm text-gray-600 capitalize">
                          {staff.role.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-blue-600 mt-2">
                      {rec.recommendation_reason}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Staff List */}
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: '400px' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <span className="ml-3 text-gray-600">Loading staff members...</span>
            </div>
          ) : filteredAndSortedStaff.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No staff members found matching your criteria</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredAndSortedStaff.map((staff) => {
                  const WorkloadIcon = getWorkloadIcon(staff.workloadStatus);
                  const RoleIcon = getRoleIcon(staff.role);
                  const specializationMatch = getSpecializationMatch(staff);
                  
                  return (
                    <motion.div
                      key={staff.id}
                      layout
                      onClick={() => handleStaffSelect(staff)}
                      className={`p-5 border-2 rounded-xl cursor-pointer transition-all hover:shadow-lg ${
                        selectedStaff?.id === staff.id
                          ? 'border-indigo-500 bg-indigo-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                            <span className="text-white font-semibold">
                              {staff.name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{staff.name}</h3>
                            <p className="text-sm text-gray-600 capitalize flex items-center">
                              <RoleIcon className="w-4 h-4 mr-1" />
                              {staff.role.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${staff.workloadColor}`}>
                            {staff.workloadPercentage}% load
                          </span>
                          <div className="flex items-center space-x-1">
                            <WorkloadIcon className="w-4 h-4 text-gray-500" />
                            <span className="text-xs text-gray-500 capitalize">
                              {staff.workloadStatus}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600 mb-1">Capacity</p>
                          <p className="font-medium">{staff.currentWorkload}/{staff.maxCapacity}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 mb-1">Performance</p>
                          <div className="flex items-center">
                            <Star className="w-4 h-4 text-yellow-500 mr-1" />
                            <span className="font-medium">{staff.performanceRating.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>

                      {staff.specializations.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-600 mb-1">Specializations:</p>
                          <div className="flex flex-wrap gap-1">
                            {staff.specializations.map((spec, index) => (
                              <span
                                key={index}
                                className={`px-2 py-1 rounded-full text-xs ${
                                  spec === grievanceCategory
                                    ? 'bg-green-100 text-green-800 border border-green-200'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {spec.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {specializationMatch > 0 && (
                        <div className="mt-2 flex items-center text-xs text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Perfect match for {grievanceCategory}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {selectedStaff && (
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-sm">
                      {selectedStaff.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{selectedStaff.name}</p>
                    <p className="text-sm text-gray-600 capitalize">
                      {selectedStaff.role.replace('_', ' ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSelection}
                disabled={!selectedStaff}
                className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                  selectedStaff
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>Select Staff</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default EnhancedStaffPicker; 