'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  UserCheck,
  Target,
  BarChart3,
  RefreshCw,
  Filter,
  Settings,
  PlusCircle,
  ArrowRight,
  Zap,
  User,
  Calendar
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface AssignerDashboardProps {
  adminId: string;
  className?: string;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  current_workload: number;
  max_capacity: number;
  workload_percentage: number;
  specializations: string[];
  can_take_more: boolean;
  performance: {
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    overdue: number;
    avg_response_time: number;
  };
}

interface UnassignedGrievance {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  created_at: string;
  student_id: string;
  student?: {
    id: string;
    student_name: string;
    email: string;
    roll_number: string;
  };
  route?: {
    id: string;
    route_name: string;
    route_number: string;
  };
}

interface AssignmentRecommendation {
  grievance_id: string;
  subject: string;
  priority: string;
  category: string;
  created_at: string;
  student?: {
    id: string;
    student_name: string;
    email: string;
    roll_number: string;
  };
  route?: {
    id: string;
    route_name: string;
    route_number: string;
  };
  recommendations: Array<{
    admin_id: string;
    admin_name: string;
    match_score: number;
    recommendation_reason: string;
  }>;
}

interface DashboardData {
  admin_info: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  system_metrics: {
    total_grievances: number;
    unassigned_grievances: number;
    assigned_grievances: number;
    resolved_grievances: number;
    overdue_grievances: number;
    urgent_grievances: number;
    high_priority_grievances: number;
    resolution_rate: number;
  };
  unassigned_grievances_data: UnassignedGrievance[];
  team_overview: StaffMember[];
  workload_distribution: StaffMember[];
  assignment_recommendations: AssignmentRecommendation[];
  analytics: {
    trend_data: any[];
    priority_distribution: any;
    category_distribution: any;
  };
  time_range: string;
  last_updated: string;
}

export default function EnhancedAssignerDashboard({ adminId, className }: AssignerDashboardProps) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedGrievances, setSelectedGrievances] = useState<string[]>([]);
  const [bulkAssignDialog, setBulkAssignDialog] = useState(false);
  const [assignmentData, setAssignmentData] = useState<{[key: string]: any}>({});
  const [refreshing, setRefreshing] = useState(false);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      console.log('Fetching dashboard data for admin:', adminId);
      
      const response = await fetch(`/api/admin/grievances/assigner-dashboard?adminId=${adminId}&timeRange=${timeRange}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-cache', // Force fresh data
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch dashboard data`);
      }
      
      const result = await response.json();
      console.log('Dashboard data received:', result);
      
      if (result.success) {
        setDashboardData(result.data);
        console.log('Team overview data:', result.data.team_overview);
        console.log('Workload distribution:', result.data.workload_distribution);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch dashboard data');
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (adminId) {
      fetchDashboardData();
    }
  }, [adminId, timeRange]);

  const handleBulkAssignment = async () => {
    if (selectedGrievances.length === 0) return;

    try {
      console.log('Processing bulk assignment for grievances:', selectedGrievances);
      console.log('Assignment data:', assignmentData);

      const assignments = selectedGrievances.map(grievanceId => ({
        grievanceId,
        assignedTo: assignmentData[grievanceId]?.assignedTo,
        reason: assignmentData[grievanceId]?.reason || 'Bulk assignment',
        priority: assignmentData[grievanceId]?.priority,
        deadline: assignmentData[grievanceId]?.deadline
      })).filter(a => a.assignedTo);

      if (assignments.length === 0) {
        setError('Please select assignees for the selected grievances');
        return;
      }

      console.log('Sending assignments:', assignments);

      const response = await fetch('/api/admin/grievances/assigner-dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          assignments,
          assignmentType: 'bulk'
        }),
      });

      const result = await response.json();
      console.log('Assignment result:', result);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${result.error || 'Failed to process bulk assignment'}`);
      }
      
      if (result.success) {
        // Clear state and refresh data
        setBulkAssignDialog(false);
        setSelectedGrievances([]);
        setAssignmentData({});
        setError(null);
        
        // Refresh dashboard data
        await fetchDashboardData();
      } else {
        throw new Error(result.error || 'Failed to process bulk assignment');
      }
    } catch (err) {
      console.error('Bulk assignment error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleSmartAssignment = async (recommendation: AssignmentRecommendation) => {
    if (recommendation.recommendations.length === 0) return;

    const topRecommendation = recommendation.recommendations[0];
    console.log('Processing smart assignment:', {
      grievanceId: recommendation.grievance_id,
      assignTo: topRecommendation.admin_id,
      adminName: topRecommendation.admin_name
    });
    
    try {
      const response = await fetch('/api/admin/grievances/assigner-dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          assignments: [{
            grievanceId: recommendation.grievance_id,
            assignedTo: topRecommendation.admin_id,
            reason: `Smart assignment: ${topRecommendation.recommendation_reason}`,
            priority: recommendation.priority
          }],
          assignmentType: 'smart'
        }),
      });

      const result = await response.json();
      console.log('Smart assignment result:', result);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${result.error || 'Failed to process smart assignment'}`);
      }
      
      if (result.success) {
        await fetchDashboardData();
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to process smart assignment');
      }
    } catch (err) {
      console.error('Smart assignment error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getWorkloadColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-orange-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-green-600';
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const days = Math.floor(diffHours / 24);
    return `${days}d ago`;
  };

  // Filter unassigned grievances based on selected filters
  const getFilteredUnassignedGrievances = () => {
    if (!dashboardData?.unassigned_grievances_data) return [];
    
    return dashboardData.unassigned_grievances_data.filter(grievance => {
      if (filterPriority !== 'all' && grievance.priority !== filterPriority) return false;
      if (filterCategory !== 'all' && grievance.category !== filterCategory) return false;
      return true;
    });
  };

  const filteredUnassignedGrievances = getFilteredUnassignedGrievances();

  // Get available staff for assignment (use workload_distribution which has real data)
  const getAvailableStaff = () => {
    if (!dashboardData?.workload_distribution) return [];
    console.log('Available staff from workload_distribution:', dashboardData.workload_distribution);
    return dashboardData.workload_distribution.filter(staff => staff.can_take_more);
  };

  const availableStaff = getAvailableStaff();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <p className="text-red-700">{error}</p>
        </div>
        <Button onClick={fetchDashboardData} className="mt-2" size="sm">
          Retry
        </Button>
      </div>
    );
  }

  if (!dashboardData) {
    return <div>No data available</div>;
  }

  const { admin_info, system_metrics, team_overview, assignment_recommendations, analytics } = dashboardData;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Debug Info - Remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm">
          <strong>Debug Info:</strong>
          <br />
          Admin ID: {adminId}
          <br />
          Team Overview Count: {team_overview?.length || 0}
          <br />
          Available Staff Count: {availableStaff.length}
          <br />
          Staff Names: {availableStaff.map(s => s.name).join(', ')}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignment Management</h1>
          <p className="text-gray-600">Manage team workload and grievance assignments</p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Today</SelectItem>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={fetchDashboardData}
            disabled={refreshing}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Grievances</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{system_metrics.total_grievances}</div>
            <div className="text-xs text-muted-foreground">
              {system_metrics.resolution_rate}% resolved
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{system_metrics.unassigned_grievances}</div>
            <div className="text-xs text-muted-foreground">
              Need immediate attention
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {system_metrics.urgent_grievances + system_metrics.high_priority_grievances}
            </div>
            <div className="text-xs text-muted-foreground">
              {system_metrics.urgent_grievances} urgent, {system_metrics.high_priority_grievances} high
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{system_metrics.overdue_grievances}</div>
            <div className="text-xs text-muted-foreground">
              Past deadline
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Workload Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Team Workload Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {team_overview.map((staff) => (
              <div key={staff.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{staff.name}</h3>
                    <p className="text-sm text-gray-500">{staff.role}</p>
                  </div>
                  <Badge 
                    className={`${getWorkloadColor(staff.workload_percentage)} bg-transparent border-current`}
                  >
                    {staff.workload_percentage}%
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Active Cases:</span>
                    <span className="font-medium">
                      {staff.performance.open + staff.performance.in_progress}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Capacity:</span>
                    <span className="font-medium">
                      {staff.current_workload}/{staff.max_capacity}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Resolved:</span>
                    <span className="font-medium text-green-600">
                      {staff.performance.resolved}
                    </span>
                  </div>
                  {staff.performance.overdue > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Overdue:</span>
                      <span className="font-medium text-red-600">
                        {staff.performance.overdue}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        staff.workload_percentage >= 90 ? 'bg-red-500' :
                        staff.workload_percentage >= 70 ? 'bg-orange-500' :
                        staff.workload_percentage >= 50 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(staff.workload_percentage, 100)}%` }}
                    ></div>
                  </div>
                </div>
                {staff.specializations && staff.specializations.length > 0 && (
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1">
                      {staff.specializations.slice(0, 2).map((spec) => (
                        <Badge key={spec} variant="outline" className="text-xs">
                          {spec}
                        </Badge>
                      ))}
                      {staff.specializations.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{staff.specializations.length - 2}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Unassigned Grievances */}
      {filteredUnassignedGrievances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <AlertCircle className="h-5 w-5 mr-2" />
                Unassigned Grievances
              </span>
              <div className="flex items-center space-x-2">
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="complaint">Complaint</SelectItem>
                    <SelectItem value="suggestion">Suggestion</SelectItem>
                    <SelectItem value="technical_issue">Technical</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline">{filteredUnassignedGrievances.length} items</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredUnassignedGrievances.map((grievance) => (
                <div key={grievance.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge className={`${getPriorityColor(grievance.priority)} text-white`}>
                          {grievance.priority}
                        </Badge>
                        <Badge variant="outline">{grievance.category}</Badge>
                      </div>
                      <h3 className="font-semibold mb-1">{grievance.subject}</h3>
                      <p className="text-sm text-gray-600 mb-2">
                        {grievance.description.length > 150 
                          ? `${grievance.description.substring(0, 150)}...`
                          : grievance.description
                        }
                      </p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        {grievance.student && (
                          <span className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {grievance.student.student_name} ({grievance.student.roll_number})
                          </span>
                        )}
                        <span className="flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatTimeAgo(grievance.created_at)}
                        </span>
                        {grievance.route && (
                          <span>Route: {grievance.route.route_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setBulkAssignDialog(true);
                          setSelectedGrievances([grievance.id]);
                        }}
                      >
                        <UserCheck className="h-4 w-4 mr-1" />
                        Assign
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Smart Assignment Recommendations */}
      {assignment_recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <Zap className="h-5 w-5 mr-2" />
                Smart Assignment Recommendations
              </span>
              <Badge variant="outline">{assignment_recommendations.length} pending</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assignment_recommendations.map((recommendation) => (
                <div key={recommendation.grievance_id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge className={`${getPriorityColor(recommendation.priority)} text-white`}>
                          {recommendation.priority}
                        </Badge>
                        <Badge variant="outline">{recommendation.category}</Badge>
                      </div>
                      <h3 className="font-semibold mb-1">{recommendation.subject}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                        {recommendation.student && (
                          <span className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {recommendation.student.student_name}
                          </span>
                        )}
                        <span>Created: {formatTimeAgo(recommendation.created_at)}</span>
                      </div>
                      
                      {recommendation.recommendations.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Recommended assignees:</p>
                          {recommendation.recommendations.slice(0, 3).map((rec, index) => (
                            <div key={rec.admin_id} className="flex items-center justify-between text-sm bg-gray-50 rounded p-2">
                              <div>
                                <span className="font-medium">{rec.admin_name}</span>
                                <span className="text-gray-500 ml-2">
                                  Match: {rec.match_score}%
                                </span>
                                <span className="text-gray-400 ml-2 text-xs">
                                  ({rec.recommendation_reason})
                                </span>
                              </div>
                              {index === 0 && (
                                <Button
                                  size="sm"
                                  onClick={() => handleSmartAssignment(recommendation)}
                                >
                                  <ArrowRight className="h-3 w-3 mr-1" />
                                  Assign
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Assignment Dialog */}
      <Dialog open={bulkAssignDialog} onOpenChange={setBulkAssignDialog}>
        <DialogTrigger asChild>
          <Button className="fixed bottom-6 right-6 rounded-full h-14 w-14 shadow-lg">
            <PlusCircle className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Assignment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Select grievances and assign them to team members
            </div>

            {/* Debug info for available staff */}
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs">
                <strong>Available Staff ({availableStaff.length}):</strong> {availableStaff.map(s => s.name).join(', ')}
              </div>
            )}
            
            {filteredUnassignedGrievances.map((grievance) => (
              <div key={grievance.id} className="border rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    checked={selectedGrievances.includes(grievance.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedGrievances([...selectedGrievances, grievance.id]);
                      } else {
                        setSelectedGrievances(selectedGrievances.filter(id => id !== grievance.id));
                      }
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge className={`${getPriorityColor(grievance.priority)} text-white`}>
                        {grievance.priority}
                      </Badge>
                      <Badge variant="outline">{grievance.category}</Badge>
                    </div>
                    <h3 className="font-semibold mb-1">{grievance.subject}</h3>
                    <div className="text-sm text-gray-600 mb-2">
                      {grievance.student && (
                        <span>Student: {grievance.student.student_name} ({grievance.student.roll_number})</span>
                      )}
                    </div>
                    
                    {selectedGrievances.includes(grievance.id) && (
                      <div className="mt-3 space-y-2">
                        <Select
                          value={assignmentData[grievance.id]?.assignedTo || ''}
                          onValueChange={(value) => setAssignmentData({
                            ...assignmentData,
                            [grievance.id]: {
                              ...assignmentData[grievance.id],
                              assignedTo: value
                            }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select assignee" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableStaff.map((staff) => (
                              <SelectItem key={staff.id} value={staff.id}>
                                {staff.name} ({staff.workload_percentage}% load) - {staff.role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Textarea
                          placeholder="Assignment reason (optional)"
                          value={assignmentData[grievance.id]?.reason || ''}
                          onChange={(e) => setAssignmentData({
                            ...assignmentData,
                            [grievance.id]: {
                              ...assignmentData[grievance.id],
                              reason: e.target.value
                            }
                          })}
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setBulkAssignDialog(false);
                  setSelectedGrievances([]);
                  setAssignmentData({});
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkAssignment}
                disabled={selectedGrievances.length === 0 || selectedGrievances.some(id => !assignmentData[id]?.assignedTo)}
              >
                Assign Selected ({selectedGrievances.length})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 