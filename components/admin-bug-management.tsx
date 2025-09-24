'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug,
  Filter,
  Search,
  Eye,
  Edit,
  MessageSquare,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Download,
  Tag,
  Calendar,
  Image as ImageIcon,
  FileText,
  Settings,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Monitor,
  Smartphone,
  Zap,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import toast from 'react-hot-toast';

interface BugReport {
  id: string;
  title: string;
  description: string;
  steps_to_reproduce?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  category: string;
  severity: string;
  priority: string;
  status: string;
  reporter_type: string;
  reporter_id: string;
  reporter_name: string;
  reporter_email: string;
  browser_info?: any;
  screen_resolution?: string;
  user_agent?: string;
  page_url?: string;
  assigned_to?: string;
  assigned_at?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
  tags?: string[];
  internal_notes?: string;
  resolution_notes?: string;
  screenshot_url?: string;
  bug_attachments?: any[];
  bug_comments?: any[];
  assigned_admin?: any;
  bug_report_labels?: any[];
}

interface BugStats {
  total_bugs: number;
  open_bugs: number;
  in_progress_bugs: number;
  resolved_bugs: number;
  closed_bugs: number;
  critical_bugs: number;
  high_severity_bugs: number;
  urgent_bugs: number;
  avg_resolution_time_hours: number;
}

interface AdminBugManagementProps {
  adminId: string;
  className?: string;
}

const AdminBugManagement: React.FC<AdminBugManagementProps> = ({
  adminId,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [stats, setStats] = useState<BugStats>({
    total_bugs: 0,
    open_bugs: 0,
    in_progress_bugs: 0,
    resolved_bugs: 0,
    closed_bugs: 0,
    critical_bugs: 0,
    high_severity_bugs: 0,
    urgent_bugs: 0,
    avg_resolution_time_hours: 0
  });
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null);
  const [showBugDetails, setShowBugDetails] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    status: '',
    severity: '',
    category: '',
    assignedTo: '',
    search: ''
  });

  // Pagination
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    hasMore: false
  });

  useEffect(() => {
    loadBugReports();
  }, [adminId, filters, pagination.offset]);

  const loadBugReports = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        adminId,
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });

      const response = await fetch(`/api/admin/bug-reports?${params}`);
      const data = await response.json();

      if (data.success) {
        setBugReports(data.bugReports);
        setStats(data.stats);
        setPagination(prev => ({ ...prev, hasMore: data.pagination.hasMore }));
      } else {
        toast.error(data.error || 'Failed to load bug reports');
      }
    } catch (error) {
      console.error('Error loading bug reports:', error);
      toast.error('Failed to load bug reports');
    } finally {
      setLoading(false);
    }
  };

  const updateBugStatus = async (bugId: string, status: string, resolution_notes?: string) => {
    try {
      const response = await fetch('/api/admin/bug-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          action: 'update_status',
          bugReportId: bugId,
          status,
          resolution_notes
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bug status updated successfully');
        loadBugReports();
        if (selectedBug?.id === bugId) {
          setSelectedBug(result.bugReport);
        }
      } else {
        toast.error(result.error || 'Failed to update bug status');
      }
    } catch (error) {
      console.error('Error updating bug status:', error);
      toast.error('Failed to update bug status');
    }
  };

  const assignBug = async (bugId: string, assignedTo: string) => {
    try {
      const response = await fetch('/api/admin/bug-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          action: 'assign_bug',
          bugReportId: bugId,
          assigned_to: assignedTo
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bug assigned successfully');
        loadBugReports();
        if (selectedBug?.id === bugId) {
          setSelectedBug(result.bugReport);
        }
      } else {
        toast.error(result.error || 'Failed to assign bug');
      }
    } catch (error) {
      console.error('Error assigning bug:', error);
      toast.error('Failed to assign bug');
    }
  };

  const addComment = async (bugId: string, comment: string, is_internal: boolean = false) => {
    try {
      const response = await fetch('/api/admin/bug-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          action: 'add_comment',
          bugReportId: bugId,
          comment,
          is_internal
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Comment added successfully');
        loadBugReports();
      } else {
        toast.error(result.error || 'Failed to add comment');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'resolved': return 'bg-green-100 text-green-800 border-green-200';
      case 'closed': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'duplicate': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'wont_fix': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'ui_bug': return <Monitor className="w-4 h-4" />;
      case 'functional_bug': return <Bug className="w-4 h-4" />;
      case 'performance_issue': return <Zap className="w-4 h-4" />;
      case 'crash': return <XCircle className="w-4 h-4" />;
      case 'security_issue': return <AlertTriangle className="w-4 h-4" />;
      case 'feature_request': return <FileText className="w-4 h-4" />;
      default: return <Bug className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const exportBugReports = () => {
    const csvContent = [
      ['ID', 'Title', 'Reporter', 'Category', 'Severity', 'Status', 'Created At', 'Resolved At'],
      ...bugReports.map(bug => [
        bug.id,
        bug.title,
        bug.reporter_name,
        bug.category,
        bug.severity,
        bug.status,
        formatDate(bug.created_at),
        bug.resolved_at ? formatDate(bug.resolved_at) : ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bug-reports-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bug Management</h1>
          <p className="text-gray-600 mt-2">
            Track and manage bug reports from users
          </p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={exportBugReports}
            className="flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </Button>
          <Button
            onClick={loadBugReports}
            className="flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center space-x-2">
            <Bug className="w-4 h-4" />
            <span>Bug Reports</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4" />
            <span>Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center space-x-2">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Bug className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Bugs</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.total_bugs}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Open Bugs</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.open_bugs}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Resolved</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.resolved_bugs}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Clock className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Avg Resolution</p>
                    <p className="text-2xl font-bold text-gray-900">{Math.round(stats.avg_resolution_time_hours)}h</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Priority Issues */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <span>Critical & High Priority</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bugReports
                    .filter(bug => bug.severity === 'critical' || bug.severity === 'high')
                    .slice(0, 5)
                    .map(bug => (
                      <div key={bug.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{bug.title}</h4>
                          <p className="text-xs text-gray-500">{bug.reporter_name}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getSeverityColor(bug.severity)}>
                            {bug.severity}
                          </Badge>
                          <button
                            onClick={() => {
                              setSelectedBug(bug);
                              setShowBugDetails(true);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-purple-500" />
                  <span>Recent Activity</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bugReports
                    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                    .slice(0, 5)
                    .map(bug => (
                      <div key={bug.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{bug.title}</h4>
                          <p className="text-xs text-gray-500">{formatDate(bug.updated_at)}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getStatusColor(bug.status)}>
                            {bug.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Bug Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Filter className="w-5 h-5" />
                <span>Filters</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label htmlFor="search">Search</Label>
                  <Input
                    id="search"
                    placeholder="Search bugs..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                    <option value="duplicate">Duplicate</option>
                    <option value="wont_fix">Won't Fix</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="severity">Severity</Label>
                  <select
                    id="severity"
                    value={filters.severity}
                    onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Severities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    value={filters.category}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Categories</option>
                    <option value="ui_bug">UI Bug</option>
                    <option value="functional_bug">Functional Bug</option>
                    <option value="performance_issue">Performance Issue</option>
                    <option value="crash">Crash</option>
                    <option value="security_issue">Security Issue</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={() => setFilters({ status: '', severity: '', category: '', assignedTo: '', search: '' })}
                    variant="outline"
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bug Reports List */}
          <Card>
            <CardHeader>
              <CardTitle>Bug Reports ({bugReports.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {bugReports.map(bug => (
                    <div key={bug.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            {getCategoryIcon(bug.category)}
                            <h3 className="font-medium text-gray-900">{bug.title}</h3>
                            <Badge className={getSeverityColor(bug.severity)}>
                              {bug.severity}
                            </Badge>
                            <Badge className={getStatusColor(bug.status)}>
                              {bug.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                            {bug.description}
                          </p>
                          
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>By: {bug.reporter_name}</span>
                            <span>Created: {formatDate(bug.created_at)}</span>
                            {bug.assigned_admin && (
                              <span>Assigned to: {bug.assigned_admin.name}</span>
                            )}
                            {bug.screenshot_url && (
                              <span className="flex items-center space-x-1">
                                <ImageIcon className="w-3 h-3" />
                                <span>Screenshot</span>
                              </span>
                            )}
                            {bug.bug_attachments && bug.bug_attachments.length > 0 && (
                              <span className="flex items-center space-x-1">
                                <FileText className="w-3 h-3" />
                                <span>{bug.bug_attachments.length} files</span>
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setSelectedBug(bug);
                              setShowBugDetails(true);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {bugReports.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Bug className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p>No bug reports found</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Bug Distribution by Severity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Critical</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-red-500 h-2 rounded-full" 
                          style={{ width: `${stats.total_bugs > 0 ? (stats.critical_bugs / stats.total_bugs) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">{stats.critical_bugs}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">High</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-orange-500 h-2 rounded-full" 
                          style={{ width: `${stats.total_bugs > 0 ? (stats.high_severity_bugs / stats.total_bugs) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">{stats.high_severity_bugs}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resolution Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Average Resolution Time</span>
                    <span className="text-lg font-medium">{Math.round(stats.avg_resolution_time_hours)} hours</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Resolution Rate</span>
                    <span className="text-lg font-medium">
                      {stats.total_bugs > 0 ? Math.round((stats.resolved_bugs / stats.total_bugs) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Bug Management Settings</CardTitle>
              <CardDescription>
                Configure bug reporting and management options
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <Settings className="h-4 w-4" />
                  <AlertDescription>
                    Settings functionality will be implemented in future updates.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bug Details Modal */}
      <AnimatePresence>
        {showBugDetails && selectedBug && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              {/* Modal Header */}
              <div className="bg-gray-50 px-6 py-4 border-b flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getCategoryIcon(selectedBug.category)}
                  <h2 className="text-xl font-semibold text-gray-900">{selectedBug.title}</h2>
                  <Badge className={getSeverityColor(selectedBug.severity)}>
                    {selectedBug.severity}
                  </Badge>
                  <Badge className={getStatusColor(selectedBug.status)}>
                    {selectedBug.status.replace('_', ' ')}
                  </Badge>
                </div>
                <button
                  onClick={() => setShowBugDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Main Content */}
                  <div className="lg:col-span-2 space-y-6">
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Description</h3>
                      <p className="text-gray-600">{selectedBug.description}</p>
                    </div>

                    {selectedBug.steps_to_reproduce && (
                      <div>
                        <h3 className="font-medium text-gray-900 mb-2">Steps to Reproduce</h3>
                        <pre className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded">
                          {selectedBug.steps_to_reproduce}
                        </pre>
                      </div>
                    )}

                    {selectedBug.expected_behavior && (
                      <div>
                        <h3 className="font-medium text-gray-900 mb-2">Expected Behavior</h3>
                        <p className="text-gray-600">{selectedBug.expected_behavior}</p>
                      </div>
                    )}

                    {selectedBug.actual_behavior && (
                      <div>
                        <h3 className="font-medium text-gray-900 mb-2">Actual Behavior</h3>
                        <p className="text-gray-600">{selectedBug.actual_behavior}</p>
                      </div>
                    )}

                    {/* Screenshot */}
                    {selectedBug.screenshot_url && (
                      <div>
                        <h3 className="font-medium text-gray-900 mb-2">Screenshot</h3>
                        <div className="border rounded-lg overflow-hidden">
                          <img 
                            src={selectedBug.screenshot_url} 
                            alt="Bug Screenshot"
                            className="w-full h-auto max-h-96 object-contain bg-gray-100"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = `
                                  <div class="flex items-center justify-center h-32 bg-gray-100 text-gray-500">
                                    <div class="text-center">
                                      <ImageIcon class="w-8 h-8 mx-auto mb-2" />
                                      <p class="text-sm">Screenshot unavailable</p>
                                      <p class="text-xs">URL: ${selectedBug.screenshot_url}</p>
                                    </div>
                                  </div>
                                `;
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Other Attachments */}
                    {selectedBug.bug_attachments && selectedBug.bug_attachments.length > 0 && (
                      <div>
                        <h3 className="font-medium text-gray-900 mb-2">Other Attachments</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {selectedBug.bug_attachments.map((attachment: any) => (
                            <div key={attachment.id} className="border rounded p-2 text-sm">
                              <div className="flex items-center space-x-2">
                                <FileText className="w-4 h-4 text-blue-500" />
                                <span className="truncate">{attachment.file_name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Comments */}
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Comments</h3>
                      <div className="space-y-3 mb-4">
                        {selectedBug.bug_comments?.map((comment: any) => (
                          <div key={comment.id} className="bg-gray-50 p-3 rounded">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{comment.commenter_name}</span>
                              <span className="text-xs text-gray-500">{formatDate(comment.created_at)}</span>
                            </div>
                            <p className="text-sm text-gray-600">{comment.comment_text}</p>
                          </div>
                        ))}
                      </div>

                      {/* Add Comment Form */}
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Add a comment..."
                          rows={3}
                          id={`comment-${selectedBug.id}`}
                        />
                        <Button
                          onClick={() => {
                            const textarea = document.getElementById(`comment-${selectedBug.id}`) as HTMLTextAreaElement;
                            if (textarea.value.trim()) {
                              addComment(selectedBug.id, textarea.value.trim());
                              textarea.value = '';
                            }
                          }}
                          size="sm"
                        >
                          Add Comment
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Sidebar */}
                  <div className="space-y-6">
                    {/* Bug Info */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Bug Information</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-2">
                        <div>
                          <span className="font-medium">Reporter:</span>
                          <p className="text-gray-600">{selectedBug.reporter_name}</p>
                          <p className="text-gray-600">{selectedBug.reporter_email}</p>
                        </div>
                        <div>
                          <span className="font-medium">Created:</span>
                          <p className="text-gray-600">{formatDate(selectedBug.created_at)}</p>
                        </div>
                        <div>
                          <span className="font-medium">Updated:</span>
                          <p className="text-gray-600">{formatDate(selectedBug.updated_at)}</p>
                        </div>
                        {selectedBug.resolved_at && (
                          <div>
                            <span className="font-medium">Resolved:</span>
                            <p className="text-gray-600">{formatDate(selectedBug.resolved_at)}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Actions */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Actions</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label className="text-xs">Status</Label>
                          <select
                            value={selectedBug.status}
                            onChange={(e) => updateBugStatus(selectedBug.id, e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                            <option value="duplicate">Duplicate</option>
                            <option value="wont_fix">Won't Fix</option>
                          </select>
                        </div>

                        <div>
                          <Label className="text-xs">Assign to Admin</Label>
                          <select
                            value={selectedBug.assigned_to || ''}
                            onChange={(e) => assignBug(selectedBug.id, e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          >
                            <option value="">Unassigned</option>
                            <option value={adminId}>Me</option>
                          </select>
                        </div>
                      </CardContent>
                    </Card>

                    {/* System Info */}
                    {selectedBug.browser_info && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">System Information</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs space-y-1 text-gray-600">
                          <div>Screen: {selectedBug.screen_resolution}</div>
                          <div>Platform: {selectedBug.browser_info.deviceInfo?.platform}</div>
                          <div>Language: {selectedBug.browser_info.deviceInfo?.language}</div>
                          {selectedBug.page_url && (
                            <div className="break-all">URL: {selectedBug.page_url}</div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminBugManagement;

