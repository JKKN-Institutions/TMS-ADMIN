'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  User,
  UserCheck,
  RefreshCw,
  Flag,
  MessageSquare,
  Settings,
  Star,
  XCircle,
  FileText,
  Paperclip,
  Bell,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Filter,
  BarChart3
} from 'lucide-react';

interface ActivityItem {
  id: string;
  type: string;
  visibility: string;
  actor: {
    type: string;
    id: string;
    name: string;
  };
  description: string;
  details: any;
  oldValues: any;
  newValues: any;
  isMilestone: boolean;
  timestamp: string;
}

interface ActivityTimelineProps {
  grievanceId: string;
  currentUser: any;
  onRefresh?: () => void;
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  grievanceId,
  currentUser,
  onRefresh
}) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'milestones' | 'admin' | 'student' | 'system'>('all');
  const [showPrivate, setShowPrivate] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchActivities();
  }, [grievanceId, filter, showPrivate]);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/grievances/${grievanceId}/activities`);
      if (!response.ok) throw new Error('Failed to fetch activities');

      const data = await response.json();
      if (data.success) {
        let filteredActivities = data.data;

        // Apply visibility filter
        if (!showPrivate) {
          filteredActivities = filteredActivities.filter((activity: ActivityItem) => 
            activity.visibility === 'public' || activity.visibility === 'system'
          );
        }

        // Apply type filter
        if (filter !== 'all') {
          filteredActivities = filteredActivities.filter((activity: ActivityItem) => {
            switch (filter) {
              case 'milestones':
                return activity.isMilestone;
              case 'admin':
                return activity.actor.type === 'admin';
              case 'student':
                return activity.actor.type === 'student';
              case 'system':
                return activity.actor.type === 'system';
              default:
                return true;
            }
          });
        }

        setActivities(filteredActivities);
        calculateStats(filteredActivities);
      } else {
        setError(data.error || 'Failed to fetch activities');
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      setError('Failed to fetch activities');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (activities: ActivityItem[]) => {
    const stats = {
      total: activities.length,
      admin: activities.filter(a => a.actor.type === 'admin').length,
      student: activities.filter(a => a.actor.type === 'student').length,
      system: activities.filter(a => a.actor.type === 'system').length,
      milestones: activities.filter(a => a.isMilestone).length,
      recent: activities.slice(-3),
      activityTypes: [...new Set(activities.map(a => a.type))],
      actors: [...new Set(activities.map(a => a.actor.name).filter(Boolean))]
    };
    setStats(stats);
  };

  const getActivityIcon = (type: string) => {
    const icons = {
      'grievance_created': FileText,
      'grievance_assigned': UserCheck,
      'grievance_reassigned': UserCheck,
      'grievance_status_changed': RefreshCw,
      'grievance_priority_changed': Flag,
      'comment_added': MessageSquare,
      'admin_action_taken': Settings,
      'grievance_resolved': Star,
      'grievance_closed': XCircle,
      'resolution_rated': Star,
      'attachment_added': Paperclip,
      'notification_sent': Bell,
      'grievance_updated': Settings,
      'sla_breach': AlertCircle,
      'escalation': ArrowRight
    };
    return icons[type] || Activity;
  };

  const getActivityColor = (type: string, actorType: string) => {
    if (actorType === 'admin') return 'blue';
    if (actorType === 'student') return 'green';
    if (actorType === 'system') return 'gray';

    const colors = {
      'grievance_created': 'green',
      'grievance_assigned': 'blue',
      'grievance_reassigned': 'blue',
      'grievance_status_changed': 'orange',
      'grievance_priority_changed': 'yellow',
      'comment_added': 'purple',
      'admin_action_taken': 'blue',
      'grievance_resolved': 'green',
      'grievance_closed': 'gray',
      'resolution_rated': 'green',
      'attachment_added': 'indigo',
      'notification_sent': 'blue',
      'grievance_updated': 'orange',
      'sla_breach': 'red',
      'escalation': 'red'
    };
    return colors[type] || 'gray';
  };

  const getActivityTitle = (type: string) => {
    const titles = {
      'grievance_created': 'Grievance Submitted',
      'grievance_assigned': 'Assigned to Admin',
      'grievance_reassigned': 'Reassigned to Admin',
      'grievance_status_changed': 'Status Updated',
      'grievance_priority_changed': 'Priority Changed',
      'comment_added': 'Comment Added',
      'admin_action_taken': 'Admin Action Taken',
      'grievance_resolved': 'Grievance Resolved',
      'grievance_closed': 'Grievance Closed',
      'resolution_rated': 'Resolution Rated',
      'attachment_added': 'Attachment Added',
      'notification_sent': 'Notification Sent',
      'grievance_updated': 'Grievance Updated',
      'sla_breach': 'SLA Breach',
      'escalation': 'Escalated'
    };
    return titles[type] || 'Activity';
  };

  const getColorClasses = (color: string) => {
    const classes = {
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      green: 'bg-green-100 text-green-800 border-green-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200',
      orange: 'bg-orange-100 text-orange-800 border-orange-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      purple: 'bg-purple-100 text-purple-800 border-purple-200',
      indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      red: 'bg-red-100 text-red-800 border-red-200'
    };
    return classes[color] || classes.gray;
  };

  const getIconColorClasses = (color: string) => {
    const classes = {
      blue: 'text-blue-600',
      green: 'text-green-600',
      gray: 'text-gray-600',
      orange: 'text-orange-600',
      yellow: 'text-yellow-600',
      purple: 'text-purple-600',
      indigo: 'text-indigo-600',
      red: 'text-red-600'
    };
    return classes[color] || classes.gray;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      relative: getTimeAgo(timestamp)
    };
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const renderActivityDetails = (activity: ActivityItem) => {
    const { details, oldValues, newValues } = activity;
    
    if (newValues && oldValues) {
      return (
        <div className="mt-2 text-sm">
          <div className="flex items-center space-x-2">
            {Object.keys(newValues).map(key => (
              <div key={key} className="flex items-center space-x-1">
                <span className="text-gray-500">{key}:</span>
                <span className="text-red-600 line-through">{oldValues[key]}</span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="text-green-600 font-medium">{newValues[key]}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (details && typeof details === 'object') {
      return (
        <div className="mt-2 text-sm text-gray-600">
          {Object.entries(details).map(([key, value]) => (
            <div key={key} className="flex items-center space-x-2">
              <span className="capitalize">{key.replace('_', ' ')}:</span>
              <span className="font-medium">{String(value)}</span>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
        <button
          onClick={fetchActivities}
          className="mt-2 text-sm text-red-600 hover:text-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-gray-900">Activity Overview</h4>
            <BarChart3 className="w-4 h-4 text-gray-500" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-xs text-gray-500">Total Activities</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.admin}</div>
              <div className="text-xs text-gray-500">Admin Actions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.milestones}</div>
              <div className="text-xs text-gray-500">Milestones</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.activityTypes.length}</div>
              <div className="text-xs text-gray-500">Activity Types</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-700">Filter:</span>
        </div>
        
        <div className="flex space-x-1">
          {[
            { value: 'all', label: 'All' },
            { value: 'milestones', label: 'Milestones' },
            { value: 'admin', label: 'Admin' },
            { value: 'student', label: 'Student' },
            { value: 'system', label: 'System' }
          ].map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value as any)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2 ml-auto">
          <button
            onClick={() => setShowPrivate(!showPrivate)}
            className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              showPrivate
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {showPrivate ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{showPrivate ? 'Hide Private' : 'Show Private'}</span>
          </button>
          
          <button
            onClick={fetchActivities}
            className="flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-8 h-8 mx-auto mb-2" />
            <p>No activities found</p>
          </div>
        ) : (
          <AnimatePresence>
            {activities.map((activity, index) => {
              const Icon = getActivityIcon(activity.type);
              const color = getActivityColor(activity.type, activity.actor.type);
              const timestamp = formatTimestamp(activity.timestamp);
              
              return (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`relative pl-8 pb-6 ${
                    index < activities.length - 1 ? 'border-l-2 border-gray-200' : ''
                  }`}
                >
                  {/* Timeline dot */}
                  <div className={`absolute left-0 top-0 w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
                    activity.isMilestone ? 'bg-yellow-400' : `bg-${color}-100`
                  }`}>
                    <Icon className={`w-3 h-3 ${getIconColorClasses(color)}`} />
                  </div>

                  {/* Activity card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-medium text-gray-900">{getActivityTitle(activity.type)}</h4>
                          {activity.isMilestone && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <Star className="w-3 h-3 mr-1" />
                              Milestone
                            </span>
                          )}
                          {activity.visibility === 'private' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              <EyeOff className="w-3 h-3 mr-1" />
                              Private
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{activity.description}</p>
                        {renderActivityDetails(activity)}
                      </div>
                      
                      <div className="text-right text-xs text-gray-500 ml-4">
                        <div className="flex items-center space-x-1 mb-1">
                          <Clock className="w-3 h-3" />
                          <span>{timestamp.relative}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{timestamp.date}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getColorClasses(color)}`}>
                          <User className="w-3 h-3 mr-1" />
                          {activity.actor.name || activity.actor.type}
                        </span>
                        <span className="text-xs text-gray-500">{activity.actor.type}</span>
                      </div>
                      <span className="text-xs text-gray-400">{timestamp.time}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default ActivityTimeline; 