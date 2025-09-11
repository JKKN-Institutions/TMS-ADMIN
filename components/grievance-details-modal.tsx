'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Route as RouteIcon,
  Star,
  ThumbsUp,
  MessageSquare,
  Settings,
  Calendar,
  Mail,
  Phone,
  MapPin,
  UserCheck,
  FileText,
  Tag,
  Car,
  Target,
  Zap,
  Activity,
  Info
} from 'lucide-react';
import ActivityTimeline from './grievance-activity-timeline';

interface GrievanceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  grievance: any;
  currentUser?: any;
}

const GrievanceDetailsModal: React.FC<GrievanceDetailsModalProps> = ({
  isOpen,
  onClose,
  grievance,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details');

  if (!isOpen || !grievance) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-red-600 bg-red-100 border-red-200';
      case 'in_progress': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'resolved': return 'text-green-600 bg-green-100 border-green-200';
      case 'closed': return 'text-gray-600 bg-gray-100 border-gray-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-100 border-green-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'text-red-600 bg-red-100 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-100 border-green-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'complaint': return 'text-red-600 bg-red-100 border-red-200';
      case 'suggestion': return 'text-blue-600 bg-blue-100 border-blue-200';
      case 'compliment': return 'text-green-600 bg-green-100 border-green-200';
      case 'technical_issue': return 'text-purple-600 bg-purple-100 border-purple-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'complaint': return AlertTriangle;
      case 'suggestion': return MessageSquare;
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
        className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 ${getCategoryColor(grievance.category)}`}>
              <CategoryIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Grievance Details</h2>
              <p className="text-sm text-gray-600">ID: {grievance.id?.slice(0, 8) || 'N/A'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'details'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Info className="w-4 h-4" />
                <span>Details</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'activity'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4" />
                <span>Activity Timeline</span>
              </div>
            </button>
          </nav>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-200px)]">
          {activeTab === 'details' ? (
            <div className="p-6 space-y-6">
              {/* Basic Information */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Grievance Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <p className="text-lg font-medium text-gray-900">{grievance.subject}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <p className="text-gray-800 whitespace-pre-wrap">{grievance.description}</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium border ${getCategoryColor(grievance.category)}`}>
                        <CategoryIcon className="w-3 h-3 mr-1" />
                        {grievance.category?.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>

                    {grievance.grievance_type && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                          {grievance.grievance_type?.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                      <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium border ${getPriorityColor(grievance.priority)}`}>
                        <Star className="w-3 h-3 mr-1" />
                        {grievance.priority?.toUpperCase()}
                      </span>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium border ${getStatusColor(grievance.status)}`}>
                        {grievance.status?.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Tags */}
                  {grievance.tags && grievance.tags.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                      <div className="flex flex-wrap gap-2">
                        {grievance.tags.map((tag: string, index: number) => (
                          <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            <Tag className="w-3 h-3 mr-1" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Student Information */}
              {grievance.students && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <User className="w-5 h-5 text-blue-600" />
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Name</label>
                          <p className="text-gray-800 font-medium">{grievance.students.student_name}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <FileText className="w-5 h-5 text-green-600" />
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Roll Number</label>
                          <p className="text-gray-800">{grievance.students.roll_number}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <Mail className="w-5 h-5 text-indigo-600" />
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Email</label>
                          <p className="text-gray-800">{grievance.students.email}</p>
                        </div>
                      </div>
                      
                      {grievance.students.mobile && (
                        <div className="flex items-center space-x-3">
                          <Phone className="w-5 h-5 text-orange-600" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Mobile</label>
                            <p className="text-gray-800">{grievance.students.mobile}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Incident Details */}
              {(grievance.location_details || grievance.incident_date || grievance.incident_time || grievance.witness_details) && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Incident Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      {grievance.location_details && (
                        <div className="flex items-start space-x-3">
                          <MapPin className="w-5 h-5 text-red-600 mt-0.5" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Location</label>
                            <p className="text-gray-800">{grievance.location_details}</p>
                          </div>
                        </div>
                      )}
                      
                      {grievance.incident_date && (
                        <div className="flex items-center space-x-3">
                          <Calendar className="w-5 h-5 text-blue-600" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Incident Date</label>
                            <p className="text-gray-800">{new Date(grievance.incident_date).toLocaleDateString()}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      {grievance.incident_time && (
                        <div className="flex items-center space-x-3">
                          <Clock className="w-5 h-5 text-purple-600" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Incident Time</label>
                            <p className="text-gray-800">{grievance.incident_time}</p>
                          </div>
                        </div>
                      )}
                      
                      {grievance.witness_details && (
                        <div className="flex items-start space-x-3">
                          <User className="w-5 h-5 text-green-600 mt-0.5" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Witnesses</label>
                            <p className="text-gray-800">{grievance.witness_details}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Route & Transport Information */}
              {(grievance.routes || grievance.driver_name || grievance.vehicle_registration) && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Transport Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      {grievance.routes && (
                        <div className="flex items-center space-x-3">
                          <RouteIcon className="w-5 h-5 text-blue-600" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Route</label>
                            <p className="text-gray-800 font-medium">{grievance.routes.route_name} (#{grievance.routes.route_number})</p>
                          </div>
                        </div>
                      )}
                      
                      {grievance.driver_name && (
                        <div className="flex items-center space-x-3">
                          <UserCheck className="w-5 h-5 text-orange-600" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Driver</label>
                            <p className="text-gray-800">{grievance.driver_name}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      {grievance.vehicle_registration && (
                        <div className="flex items-center space-x-3">
                          <Car className="w-5 h-5 text-green-600" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Vehicle</label>
                            <p className="text-gray-800">{grievance.vehicle_registration}</p>
                          </div>
                        </div>
                      )}
                      
                      {grievance.estimated_resolution_time && (
                        <div className="flex items-center space-x-3">
                          <Target className="w-5 h-5 text-purple-600" />
                          <div>
                            <label className="block text-sm font-medium text-gray-700">SLA Target</label>
                            <p className="text-gray-800">{grievance.estimated_resolution_time}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Assignment & Timeline */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline & Assignment</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Calendar className="w-5 h-5 text-green-600" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Created</label>
                        <p className="text-gray-800">{new Date(grievance.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Last Updated</label>
                        <p className="text-gray-800">{new Date(grievance.updated_at).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {grievance.admin_users && (
                      <div className="flex items-center space-x-3">
                        <User className="w-5 h-5 text-purple-600" />
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Assigned To</label>
                          <p className="text-gray-800 font-medium">{grievance.admin_users.name}</p>
                          <p className="text-sm text-gray-600">{grievance.admin_users.email}</p>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-3">
                      <Clock className="w-5 h-5 text-orange-600" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Days Since Created</label>
                        <p className="text-gray-800">
                          {Math.floor((new Date().getTime() - new Date(grievance.created_at).getTime()) / (1000 * 3600 * 24))} days
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resolution */}
              {grievance.resolution && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-green-900 mb-4 flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5" />
                    <span>Resolution</span>
                    {grievance.resolved_at && (
                      <span className="text-sm text-green-600 ml-2">
                        • Resolved on {new Date(grievance.resolved_at).toLocaleDateString()}
                      </span>
                    )}
                  </h3>
                  <p className="text-green-800 whitespace-pre-wrap">{grievance.resolution}</p>
                  
                  {grievance.satisfaction_rating && (
                    <div className="mt-4 flex items-center space-x-2">
                      <span className="text-sm text-green-600">Student Rating:</span>
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= grievance.satisfaction_rating
                                ? 'text-yellow-400 fill-current'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-green-600">({grievance.satisfaction_rating}/5)</span>
                    </div>
                  )}
                </div>
              )}

              {/* Internal Notes */}
              {grievance.internal_notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-yellow-900 mb-4">Internal Notes</h3>
                  <p className="text-yellow-800 whitespace-pre-wrap">{grievance.internal_notes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6">
              <ActivityTimeline 
                grievanceId={grievance.id} 
                currentUser={currentUser}
                onRefresh={() => {
                  // Optionally refresh the main grievance data as well
                  console.log('Activity timeline refreshed');
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default GrievanceDetailsModal; 