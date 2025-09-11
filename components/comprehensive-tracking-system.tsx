'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  UserCheck, 
  MessageSquare,
  TrendingUp,
  BarChart3,
  Clock,
  Target,
  Activity,
  RefreshCw,
  Bell
} from 'lucide-react';
import EnhancedAssigneeDashboard from './enhanced-assignee-dashboard';
import EnhancedAssignerDashboard from './enhanced-assigner-dashboard';
import EnhancedStudentTracking from './enhanced-student-tracking';
import RealTimeNotifications from './real-time-notifications';

interface ComprehensiveTrackingProps {
  userId: string;
  userType: 'admin' | 'student';
  userRole?: string;
  className?: string;
}

interface SystemMetrics {
  total_grievances: number;
  unassigned_grievances: number;
  in_progress_grievances: number;
  resolved_grievances: number;
  overdue_grievances: number;
  avg_response_time: number;
  team_utilization: number;
  satisfaction_rating: number;
}

interface CrossPlatformActivity {
  id: string;
  type: 'assignment' | 'status_change' | 'communication' | 'resolution';
  grievance_id: string;
  grievance_subject: string;
  actor: {
    id: string;
    name: string;
    type: 'admin' | 'student';
    role?: string;
  };
  description: string;
  timestamp: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export default function ComprehensiveTrackingSystem({ 
  userId, 
  userType, 
  userRole,
  className 
}: ComprehensiveTrackingProps) {
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [recentActivity, setRecentActivity] = useState<CrossPlatformActivity[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSystemOverview = async () => {
    try {
      const response = await fetch(`/api/system/overview?userId=${userId}&userType=${userType}`);
      
      if (!response.ok) {
        // Fallback to mock data if API not available
        setSystemMetrics({
          total_grievances: 156,
          unassigned_grievances: 12,
          in_progress_grievances: 34,
          resolved_grievances: 98,
          overdue_grievances: 8,
          avg_response_time: 18,
          team_utilization: 75,
          satisfaction_rating: 4.2
        });
        
        setRecentActivity([
          {
            id: '1',
            type: 'assignment',
            grievance_id: 'G001',
            grievance_subject: 'Bus delay issue on Route 5',
            actor: { id: 'A001', name: 'John Admin', type: 'admin', role: 'transport_manager' },
            description: 'Assigned to Sarah Wilson',
            timestamp: new Date(Date.now() - 300000).toISOString(), // 5 min ago
            priority: 'high'
          },
          {
            id: '2',
            type: 'status_change',
            grievance_id: 'G002',
            grievance_subject: 'Driver behavior complaint',
            actor: { id: 'A002', name: 'Sarah Wilson', type: 'admin', role: 'operations_admin' },
            description: 'Status changed to In Progress',
            timestamp: new Date(Date.now() - 600000).toISOString(), // 10 min ago
            priority: 'medium'
          }
        ]);
        return;
      }
      
      const result = await response.json();
      if (result.success) {
        setSystemMetrics(result.data.metrics);
        setRecentActivity(result.data.recent_activity);
      }
    } catch (err) {
      console.error('Error fetching system overview:', err);
      setError(err instanceof Error ? err.message : 'Failed to load system overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemOverview();
    
    // Set up auto-refresh
    const interval = setInterval(fetchSystemOverview, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [userId, userType]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'assignment': return <UserCheck className="h-4 w-4 text-blue-500" />;
      case 'status_change': return <Activity className="h-4 w-4 text-green-500" />;
      case 'communication': return <MessageSquare className="h-4 w-4 text-purple-500" />;
      case 'resolution': return <Target className="h-4 w-4 text-green-600" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'border-l-red-500';
      case 'high': return 'border-l-orange-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-gray-500';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading && !systemMetrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading tracking system...</p>
        </div>
      </div>
    );
  }

  // Determine available tabs based on user type and role
  const getAvailableTabs = () => {
    if (userType === 'student') {
      return [
        { id: 'tracking', label: 'My Grievances', icon: MessageSquare }
      ];
    }

    const tabs = [
      { id: 'dashboard', label: 'Overview', icon: BarChart3 }
    ];

    // Admin users get different tabs based on their role
    if (userRole === 'super_admin' || userRole === 'transport_manager') {
      tabs.push({ id: 'assigner', label: 'Assignment Management', icon: Users });
    }

    tabs.push({ id: 'assignee', label: 'My Tasks', icon: UserCheck });

    return tabs;
  };

  const availableTabs = getAvailableTabs();

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Real-time Notifications */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {userType === 'student' ? 'Grievance Tracking' : 'Comprehensive Tracking System'}
          </h1>
          <p className="text-gray-600">
            {userType === 'student' 
              ? 'Track your grievances with real-time updates'
              : 'Monitor and manage grievances across all channels'
            }
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <RealTimeNotifications userId={userId} userType={userType} />
          <Button
            onClick={fetchSystemOverview}
            disabled={loading}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* System Metrics (Admin only) */}
      {userType === 'admin' && systemMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Grievances</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{systemMetrics.total_grievances}</div>
              <div className="text-xs text-muted-foreground">
                {systemMetrics.resolved_grievances} resolved
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Action</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {systemMetrics.unassigned_grievances + systemMetrics.overdue_grievances}
              </div>
              <div className="text-xs text-muted-foreground">
                {systemMetrics.unassigned_grievances} unassigned, {systemMetrics.overdue_grievances} overdue
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{systemMetrics.avg_response_time}h</div>
              <div className="text-xs text-muted-foreground">
                Response time
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Utilization</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{systemMetrics.team_utilization}%</div>
              <div className="text-xs text-muted-foreground">
                Capacity used
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Activity Feed (Admin only) */}
      {userType === 'admin' && recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.slice(0, 5).map((activity) => (
                <div 
                  key={activity.id} 
                  className={`flex items-start space-x-3 p-3 border-l-4 rounded-r-lg bg-gray-50 ${getPriorityColor(activity.priority)}`}
                >
                  <div className="flex-shrink-0 mt-1">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {activity.grievance_subject}
                    </p>
                    <p className="text-sm text-gray-600">
                      {activity.description}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-500">
                        by {activity.actor.name} ({activity.actor.role})
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimeAgo(activity.timestamp)}
                      </span>
                    </div>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      activity.priority === 'urgent' ? 'border-red-500 text-red-600' :
                      activity.priority === 'high' ? 'border-orange-500 text-orange-600' :
                      activity.priority === 'medium' ? 'border-yellow-500 text-yellow-600' :
                      'border-green-500 text-green-600'
                    }`}
                  >
                    {activity.priority}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tracking Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {availableTabs.map((tab) => (
            <TabsTrigger 
              key={tab.id} 
              value={tab.id}
              className="flex items-center space-x-2"
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Student Tracking */}
        {userType === 'student' && (
          <TabsContent value="tracking" className="space-y-6">
            <EnhancedStudentTracking studentId={userId} />
          </TabsContent>
        )}

        {/* Admin Dashboards */}
        {userType === 'admin' && (
          <>
            <TabsContent value="dashboard" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>System Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {systemMetrics && (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Resolution Rate</span>
                            <span className="text-sm font-bold">
                              {Math.round((systemMetrics.resolved_grievances / systemMetrics.total_grievances) * 100)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Average Response Time</span>
                            <span className="text-sm font-bold">{systemMetrics.avg_response_time}h</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Customer Satisfaction</span>
                            <span className="text-sm font-bold">{systemMetrics.satisfaction_rating}/5.0</span>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Button 
                        className="w-full justify-start" 
                        variant="outline"
                        onClick={() => setActiveTab('assigner')}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Assign Unassigned Grievances
                      </Button>
                      <Button 
                        className="w-full justify-start" 
                        variant="outline"
                        onClick={() => setActiveTab('assignee')}
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        View My Assigned Tasks
                      </Button>
                      <Button 
                        className="w-full justify-start" 
                        variant="outline"
                        onClick={() => window.location.href = '/admin/analytics'}
                      >
                        <BarChart3 className="h-4 w-4 mr-2" />
                        View Detailed Analytics
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {(userRole === 'super_admin' || userRole === 'transport_manager') && (
              <TabsContent value="assigner" className="space-y-6">
                <EnhancedAssignerDashboard adminId={userId} />
              </TabsContent>
            )}

            <TabsContent value="assignee" className="space-y-6">
              <EnhancedAssigneeDashboard adminId={userId} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
} 