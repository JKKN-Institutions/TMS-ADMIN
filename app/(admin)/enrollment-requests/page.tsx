'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  MapPin,
  Calendar,
  Mail,
  Phone,
  GraduationCap,
  Bus,
  AlertTriangle,
  Filter,
  Search,
  RefreshCw,
  FileText,
  User
} from 'lucide-react';
import toast from 'react-hot-toast';

interface EnrollmentRequest {
  id: string;
  student_id: string;
  preferred_route_id: string;
  preferred_stop_id: string;
  request_status: 'pending' | 'approved' | 'rejected';
  request_type: string;
  requested_at: string;
  approved_at?: string;
  approved_by?: string;
  rejection_reason?: string;
  admin_notes?: string;
  special_requirements?: string;
  student: {
    id: string;
    student_name: string;
    email: string;
    mobile: string;
    roll_number: string;
    father_name?: string;
    mother_name?: string;
    parent_mobile?: string;
    department: {
      department_name: string;
    };
    program: {
      program_name: string;
    };
  };
  route?: {
    route_number: string;
    route_name: string;
    start_location: string;
    end_location: string;
    fare: number;
    total_capacity: number;
    current_passengers: number;
  } | null;
  stop?: {
    stop_name: string;
    stop_time: string;
  } | null;
}

export default function EnrollmentRequestsPage() {
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<EnrollmentRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchEnrollmentRequests();
  }, []);

  const fetchEnrollmentRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/enrollment-requests');
      
      if (!response.ok) {
        throw new Error('Failed to fetch enrollment requests');
      }

      const data = await response.json();
      setRequests(data.requests || []);
    } catch (error: any) {
      console.error('Error fetching enrollment requests:', error);
      toast.error(error.message || 'Failed to load enrollment requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRequest = async () => {
    if (!selectedRequest) return;

    setProcessingRequest(selectedRequest.id);
    try {
      // Get admin user data from localStorage
      const adminUserData = localStorage.getItem('adminUser');
      const adminUser = adminUserData ? JSON.parse(adminUserData) : null;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add admin ID to headers if available
      if (adminUser?.id) {
        headers['X-Admin-ID'] = adminUser.id;
      }

      const response = await fetch('/api/admin/enrollment-requests/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          request_id: selectedRequest.id,
          route_id: selectedRequest.preferred_route_id,
          stop_id: selectedRequest.preferred_stop_id,
          admin_notes: adminNotes.trim() || null
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve request');
      }

      toast.success('Enrollment request approved successfully!');
      setShowApprovalModal(false);
      setSelectedRequest(null);
      setAdminNotes('');
      fetchEnrollmentRequests();
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast.error(error.message || 'Failed to approve request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setProcessingRequest(selectedRequest.id);
    try {
      // Get admin user data from localStorage
      const adminUserData = localStorage.getItem('adminUser');
      const adminUser = adminUserData ? JSON.parse(adminUserData) : null;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add admin ID to headers if available
      if (adminUser?.id) {
        headers['X-Admin-ID'] = adminUser.id;
      }

      const response = await fetch('/api/admin/enrollment-requests/reject', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          request_id: selectedRequest.id,
          rejection_reason: rejectionReason.trim(),
          admin_notes: adminNotes.trim() || null
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject request');
      }

      toast.success('Enrollment request rejected');
      setShowRejectionModal(false);
      setSelectedRequest(null);
      setAdminNotes('');
      setRejectionReason('');
      fetchEnrollmentRequests();
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast.error(error.message || 'Failed to reject request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const filteredRequests = requests.filter(request => {
    const matchesStatus = statusFilter === 'all' || request.request_status === statusFilter;
    const matchesSearch = request.student.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.student.roll_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (request.route?.route_number?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    return matchesStatus && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return Clock;
      case 'approved':
        return CheckCircle;
      case 'rejected':
        return XCircle;
      default:
        return AlertTriangle;
    }
  };

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.request_status === 'pending').length,
    approved: requests.filter(r => r.request_status === 'approved').length,
    rejected: requests.filter(r => r.request_status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading enrollment requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transport Enrollment Requests</h1>
          <p className="text-gray-600">Review and manage student transport enrollment applications</p>
        </div>
        <button
          onClick={fetchEnrollmentRequests}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Requests</p>
              <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-xl font-bold text-gray-900">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-xl font-bold text-gray-900">{stats.approved}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Rejected</p>
              <p className="text-xl font-bold text-gray-900">{stats.rejected}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by student name, roll number, email, or route..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {filteredRequests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Route & Stop
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Requested
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRequests.map((request) => {
                  const StatusIcon = getStatusIcon(request.request_status);
                  
                  return (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {request.student.student_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {request.student.roll_number} • {request.student.department.department_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {request.student.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                                                  <div className="text-sm text-gray-900">
                            <div className="font-medium">
                              {request.route?.route_number || 'N/A'} - {request.route?.route_name || 'N/A'}
                            </div>
                            <div className="text-gray-500 flex items-center mt-1">
                              <MapPin className="w-4 h-4 mr-1" />
                              {request.stop?.stop_name || 'N/A'} ({request.stop?.stop_time || 'N/A'})
                            </div>
                            <div className="text-gray-500">
                              Fare: ₹{request.route?.fare || 'N/A'} • Capacity: {request.route?.current_passengers || 'N/A'}/{request.route?.total_capacity || 'N/A'}
                            </div>
                          </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(request.requested_at).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(request.requested_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.request_status)}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {request.request_status.charAt(0).toUpperCase() + request.request_status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowDetailsModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </button>
                        
                        {request.request_status === 'pending' && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowApprovalModal(true);
                              }}
                              className="text-green-600 hover:text-green-900 inline-flex items-center"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowRejectionModal(true);
                              }}
                              className="text-red-600 hover:text-red-900 inline-flex items-center"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No enrollment requests found</h3>
            <p className="text-gray-500">
              {statusFilter === 'all' ? 
                'No students have submitted enrollment requests yet.' :
                `No ${statusFilter} enrollment requests found.`
              }
            </p>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && selectedRequest && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Approve Enrollment Request
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                You are about to approve the enrollment request for {selectedRequest.student.student_name} 
                to route {selectedRequest.route?.route_number || 'N/A'}.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Notes (Optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add any notes for this approval..."
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowApprovalModal(false);
                    setSelectedRequest(null);
                    setAdminNotes('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveRequest}
                  disabled={processingRequest === selectedRequest.id}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
                >
                  {processingRequest === selectedRequest.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Approving...
                    </>
                  ) : (
                    'Approve Request'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectionModal && selectedRequest && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Reject Enrollment Request
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                You are about to reject the enrollment request for {selectedRequest.student.student_name} 
                to route {selectedRequest.route?.route_number || 'N/A'}.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Please provide a clear reason for rejection..."
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add any additional notes..."
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowRejectionModal(false);
                    setSelectedRequest(null);
                    setAdminNotes('');
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectRequest}
                  disabled={processingRequest === selectedRequest.id || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center"
                >
                  {processingRequest === selectedRequest.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Rejecting...
                    </>
                  ) : (
                    'Reject Request'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 