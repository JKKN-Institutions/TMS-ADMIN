'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Route as RouteIcon,
  Plus,
  X,
  UserCheck,
  Mail,
  Calendar,
  MapPin,
  Loader2,
  Trash2,
  Clock,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Staff {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  is_active: boolean;
}

interface Route {
  id: string;
  route_number: string;
  route_name: string;
  start_location: string;
  end_location: string;
  departure_time: string;
  arrival_time: string;
  status: string;
  total_capacity: number;
  current_passengers: number;
}

interface StaffRouteAssignment {
  id: string;
  staff_email: string;
  route_id: string;
  assigned_at: string;
  assigned_by: string;
  is_active: boolean;
  notes?: string;
  routes: Route;
}

const StaffRouteAssignmentsPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<StaffRouteAssignment[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Form states
  const [staffEmail, setStaffEmail] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
      loadInitialData();
    } else {
      router.push('/login');
    }
  }, [router]);

  const loadInitialData = async () => {
    setLoading(true);
    await Promise.all([fetchAssignments(), fetchRoutes()]);
    setLoading(false);
  };

  const fetchAssignments = async () => {
    try {
      const response = await fetch('/api/admin/staff-route-assignments');
      const data = await response.json();

      if (data.success) {
        setAssignments(data.assignments || []);
      } else {
        toast.error('Failed to load assignments');
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
      toast.error('Failed to load assignments');
    }
  };

  const fetchRoutes = async () => {
    try {
      const response = await fetch('/api/admin/routes');
      const result = await response.json();

      if (result.success) {
        setRoutes(result.data || []);
      } else {
        toast.error('Failed to load routes');
      }
    } catch (error) {
      console.error('Error fetching routes:', error);
      toast.error('Failed to load routes');
    }
  };

  const handleAssignRoute = async () => {
    if (!staffEmail || !staffEmail.trim()) {
      toast.error('Please enter staff email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(staffEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!selectedRouteId) {
      toast.error('Please select a route');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch('/api/admin/staff-route-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          staffEmail: staffEmail.trim(),
          routeId: selectedRouteId,
          assignedBy: user?.id,
          notes: assignmentNotes.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Route assigned successfully!');
        setShowAssignModal(false);
        resetForm();
        fetchAssignments();
      } else {
        toast.error(data.error || 'Failed to assign route');
      }
    } catch (error) {
      console.error('Error assigning route:', error);
      toast.error('Failed to assign route');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to remove this assignment?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/staff-route-assignments?assignmentId=${assignmentId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Assignment removed successfully!');
        fetchAssignments();
      } else {
        toast.error(data.error || 'Failed to remove assignment');
      }
    } catch (error) {
      console.error('Error removing assignment:', error);
      toast.error('Failed to remove assignment');
    }
  };

  const resetForm = () => {
    setStaffEmail('');
    setSelectedRouteId('');
    setAssignmentNotes('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <UserCheck className="w-8 h-8 text-blue-600" />
              Staff Route Assignments
            </h1>
            <p className="text-gray-600 mt-2">
              Assign staff members to routes for monitoring and management
            </p>
          </div>
          <button
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Assign Route
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Assignments</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{assignments.length}</p>
            </div>
            <UserCheck className="w-12 h-12 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Assigned Routes</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {new Set(assignments.map(a => a.route_id)).size}
              </p>
            </div>
            <RouteIcon className="w-12 h-12 text-green-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Staff Emails</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {new Set(assignments.map(a => a.staff_email)).size}
              </p>
            </div>
            <Users className="w-12 h-12 text-purple-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Assignments List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Active Assignments</h2>
        </div>

        {assignments.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments yet</h3>
            <p className="text-gray-600 mb-6">
              Get started by assigning staff members to routes
            </p>
            <button
              onClick={() => setShowAssignModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Assign First Route
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Mail className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            Staff Email
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            {assignment.staff_email}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <RouteIcon className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {assignment.routes.route_name}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="font-mono">{assignment.routes.route_number}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>
                          {assignment.routes.start_location} → {assignment.routes.end_location}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>
                          {assignment.routes.departure_time} - {assignment.routes.arrival_time}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>
                          Assigned {new Date(assignment.assigned_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Users className="w-4 h-4" />
                        <span>
                          {assignment.routes.current_passengers}/{assignment.routes.total_capacity} passengers
                        </span>
                      </div>
                    </div>

                    {assignment.notes && (
                      <div className="mt-3 p-3 bg-yellow-50 rounded-lg text-sm text-gray-700">
                        <strong>Notes:</strong> {assignment.notes}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleRemoveAssignment(assignment.id)}
                    className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove assignment"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Assign Route to Staff</h2>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  resetForm();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Staff Email Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Staff Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    placeholder="Enter staff email (e.g., staff@jkkn.ac.in)"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Enter the email address of the staff member you want to assign to a route
                </p>
              </div>

              {/* Route Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Route
                </label>
                <select
                  value={selectedRouteId}
                  onChange={(e) => setSelectedRouteId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Choose a route...</option>
                  {routes
                    .filter((r) => r.status === 'active')
                    .map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.route_number} - {route.route_name} ({route.start_location} → {route.end_location})
                      </option>
                    ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  placeholder="Add any notes about this assignment..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAssignRoute}
                  disabled={assigning || !staffEmail || !selectedRouteId}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {assigning ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Assign Route
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffRouteAssignmentsPage;
