'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bell, 
  BellOff, 
  Users, 
  CheckCircle, 
  XCircle, 
  Download, 
  RefreshCw,
  AlertTriangle,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Student {
  id: string;
  student_name: string;
  email: string;
}

interface SubscriptionData {
  count: number;
  activeSubscriptions: number;
  studentsWithoutSubscriptions: number;
  subscriptionRate: number;
  studentsWithPush: Student[];
  studentsWithoutPush: Student[];
}

export default function PushSubscribersPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'without' | 'with'>('without');

  useEffect(() => {
    checkAdminAuth();
    loadSubscriptionData();
  }, []);

  const checkAdminAuth = () => {
    const storedUser = localStorage.getItem('adminUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      if (['super_admin', 'admin'].includes(user.role)) {
        setAdminUser(user);
      } else {
        router.push('/admin/dashboard');
      }
    } else {
      router.push('/admin/auth/login');
    }
    setLoading(false);
  };

  const loadSubscriptionData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/notifications/estimate-users?audience=students&detailed=true');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      } else {
        toast.error('Failed to load subscription data');
      }
    } catch (error) {
      console.error('Error loading subscription data:', error);
      toast.error('Error loading subscription data');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = (students: Student[], filename: string) => {
    const headers = ['Student ID', 'Student Name', 'Email'];
    const rows = students.map(s => [s.id, s.student_name, s.email]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Export completed');
  };

  const filteredStudents = (students: Student[]) => {
    if (!searchTerm) return students;
    return students.filter(s => 
      s.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading subscription data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load data</p>
          <button
            onClick={loadSubscriptionData}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const displayedStudents = activeTab === 'without' 
    ? filteredStudents(data.studentsWithoutPush)
    : filteredStudents(data.studentsWithPush);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Push Notification Subscribers
          </h1>
          <p className="text-gray-600">
            Manage and view push notification subscription status for all students
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">Total Students</h3>
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{data.count}</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">Active Push</h3>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-green-600">{data.activeSubscriptions}</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">No Push</h3>
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-3xl font-bold text-red-600">{data.studentsWithoutSubscriptions}</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">Coverage</h3>
              <Bell className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-3xl font-bold text-purple-600">{data.subscriptionRate}%</p>
          </div>
        </div>

        {/* Warning Alert */}
        {data.subscriptionRate < 70 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-orange-900 mb-1">Low Subscription Rate</h3>
                <p className="text-sm text-orange-700">
                  Only {data.subscriptionRate}% of students have enabled push notifications. 
                  Consider encouraging students to enable notifications for better communication.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex space-x-1 p-2">
              <button
                onClick={() => setActiveTab('without')}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === 'without'
                    ? 'bg-red-50 text-red-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <BellOff className="w-4 h-4" />
                <span>Without Push ({data.studentsWithoutPush.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('with')}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === 'with'
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>With Push ({data.studentsWithPush.length})</span>
              </button>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, email, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => exportToCSV(
                    activeTab === 'without' ? data.studentsWithoutPush : data.studentsWithPush,
                    `students-${activeTab}-push-${new Date().toISOString().split('T')[0]}`
                  )}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
                <button
                  onClick={loadSubscriptionData}
                  className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>

          {/* Student List */}
          <div className="overflow-x-auto">
            {displayedStudents.length === 0 ? (
              <div className="p-12 text-center">
                <BellOff className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {searchTerm 
                    ? 'No students found matching your search'
                    : `No students ${activeTab === 'without' ? 'without' : 'with'} push notifications`
                  }
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {student.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {student.student_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {student.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {activeTab === 'without' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircle className="w-3 h-3 mr-1" />
                            Not Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Enabled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing {displayedStudents.length} of{' '}
              {activeTab === 'without' ? data.studentsWithoutPush.length : data.studentsWithPush.length} students
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


