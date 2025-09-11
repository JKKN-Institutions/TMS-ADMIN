'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  DollarSign,
  Calendar,
  MapPin,
  Route as RouteIcon,
  Save,
  X,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Search,
  RefreshCw,
  Settings,
  TrendingUp,
  Users
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SemesterFee {
  id: string;
  route_id: string;
  stop_name: string;
  semester_fee: number;
  academic_year: string;
  semester: string;
  effective_from: string;
  effective_until: string;
  is_active: boolean;
  created_at: string;
  routes?: {
    id: string;
    route_number: string;
    route_name: string;
    start_location: string;
    end_location: string;
  };
}

interface Route {
  id: string;
  route_number: string;
  route_name: string;
  start_location: string;
  end_location: string;
  status: string;
}

const SemesterFeeManagement = () => {
  const [fees, setFees] = useState<SemesterFee[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedFee, setSelectedFee] = useState<SemesterFee | null>(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    route: 'all',
    semester: 'all',
    academicYear: 'all',
    status: 'active'
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Get current semester info for form initialization
  const getCurrentSemesterInfo = () => {
    const now = new Date();
    const month = now.getMonth() + 1; // 0-indexed
    const year = now.getFullYear();
    
    // 3-TERM SYSTEM UPDATE
    if (month >= 6 && month <= 9) {
      // Term 1 (June-September)
      return {
        academicYear: `${year}-${String(year + 1).slice(-2)}`,
        semester: '1',
        startDate: `${year}-06-01`,
        endDate: `${year}-09-30`
      };
    } else if (month >= 10 || month <= 1) {
      // Term 2 (October-January)
      const academicStartYear = month >= 10 ? year : year - 1;
      return {
        academicYear: `${academicStartYear}-${String(academicStartYear + 1).slice(-2)}`,
        semester: '2',
        startDate: `${academicStartYear}-10-01`,
        endDate: `${academicStartYear + 1}-01-31`
      };
    } else {
      // Term 3 (February-May)
      return {
        academicYear: `${year - 1}-${String(year).slice(-2)}`,
        semester: '3',
        startDate: `${year}-02-01`,
        endDate: `${year}-05-31`
      };
    }
  };

  // Form states for creating/editing fees
  const [formData, setFormData] = useState(() => {
    const currentSemester = getCurrentSemesterInfo();
    return {
      routeId: '',
      academicYear: currentSemester.academicYear,
      semester: currentSemester.semester,
      effectiveFrom: currentSemester.startDate,
      effectiveUntil: currentSemester.endDate,
      stops: [{ stopName: '', fee: '' }]
    };
  });

  // Route stops loading state
  const [loadingRouteStops, setLoadingRouteStops] = useState(false);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchFees(), fetchRoutes()]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchFees = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.route !== 'all') params.append('routeId', filters.route);
      if (filters.semester !== 'all') params.append('semester', filters.semester);
      if (filters.academicYear !== 'all') params.append('academicYear', filters.academicYear);

      const response = await fetch(`/api/admin/semester-fees?${params}`);
      if (!response.ok) throw new Error('Failed to fetch fees');
      
      const result = await response.json();
      
      // Handle different response formats 
      const feesData = result.success ? result.data : result;
      const fees = Array.isArray(feesData) ? feesData : [];
      
      setFees(fees);
    } catch (error) {
      console.error('Error fetching fees:', error);
      throw error;
    }
  };

  const fetchRoutes = async () => {
    try {
      const response = await fetch('/api/admin/routes');
      if (!response.ok) throw new Error('Failed to fetch routes');
      
      const result = await response.json();
      
      // Handle different response formats
      const routesData = result.success ? result.data : result;
      const routes = Array.isArray(routesData) ? routesData : [];
      
      setRoutes(routes.filter((route: Route) => route.status === 'active'));
    } catch (error) {
      console.error('Error fetching routes:', error);
      throw error;
    }
  };

  const fetchRouteStops = async (routeId: string) => {
    setLoadingRouteStops(true);
    try {
      const response = await fetch(`/api/admin/routes/${routeId}/stops`);
      if (!response.ok) throw new Error('Failed to fetch route stops');
      
      const result = await response.json();
      
      if (result.success && result.stops) {
        const stopsWithFees = result.stops.map((stop: any) => ({
          stopName: stop.stop_name,
          fee: ''
        }));
        
        setFormData(prev => ({
          ...prev,
          stops: stopsWithFees.length > 0 ? stopsWithFees : [{ stopName: '', fee: '' }]
        }));
        
        if (stopsWithFees.length > 0) {
          toast.success(`Loaded ${stopsWithFees.length} stops for this route`);
        } else {
          toast('No stops found for this route. You can add them manually.');
        }
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error fetching route stops:', error);
      toast.error('Failed to load route stops. You can add them manually.');
      // Keep current stops or reset to single empty stop
      if (formData.stops.length === 0) {
        setFormData(prev => ({
          ...prev,
          stops: [{ stopName: '', fee: '' }]
        }));
      }
    } finally {
      setLoadingRouteStops(false);
    }
  };

  const handleRouteChange = (routeId: string) => {
    setFormData(prev => ({ ...prev, routeId }));
    
    if (routeId) {
      fetchRouteStops(routeId);
    } else {
      // Reset stops to single empty stop when no route selected
      setFormData(prev => ({
        ...prev,
        stops: [{ stopName: '', fee: '' }]
      }));
    }
  };

  const getCurrentSemester = () => {
    const now = new Date();
    const month = now.getMonth() + 1; // 0-indexed
    const year = now.getFullYear();
    
    if (month >= 6 && month <= 11) {
      // First semester (June-November)
      return {
        academicYear: `${year}-${String(year + 1).slice(-2)}`,
        semester: '1',
        startDate: `${year}-06-01`,
        endDate: `${year}-11-30`
      };
    } else {
      // Second semester (December-May)
      const academicStartYear = month >= 12 ? year : year - 1;
      return {
        academicYear: `${academicStartYear}-${String(academicStartYear + 1).slice(-2)}`,
        semester: '2',
        startDate: `${academicStartYear}-12-01`,
        endDate: `${academicStartYear + 1}-05-31`
      };
    }
  };

  const handleCreateFees = async () => {
    try {
      if (!formData.routeId || !formData.academicYear || !formData.effectiveFrom || !formData.effectiveUntil) {
        toast.error('Please fill all required fields');
        return;
      }

      if (formData.stops.some(stop => !stop.stopName || !stop.fee || isNaN(parseFloat(stop.fee)) || parseFloat(stop.fee) <= 0)) {
        toast.error('Please provide valid stop names and fees');
        return;
      }

      const payload = {
        routeId: formData.routeId,
        stops: formData.stops.map(stop => ({
          stopName: stop.stopName,
          fee: parseFloat(stop.fee) || 0
        })),
        academicYear: formData.academicYear,
        semester: formData.semester,
        effectiveFrom: formData.effectiveFrom,
        effectiveUntil: formData.effectiveUntil
      };

      const response = await fetch('/api/admin/semester-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create fees');
      }

      const newFees = await response.json();
      setFees(prev => [...prev, ...newFees]);
      setShowCreateModal(false);
      resetForm();
      toast.success('Semester fees created successfully');
    } catch (error) {
      console.error('Error creating fees:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create fees');
    }
  };

  const handleUpdateFee = async () => {
    if (!selectedFee) return;

    try {
      const response = await fetch('/api/admin/semester-fees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedFee.id,
          semesterFee: selectedFee.semester_fee || 0,
          effectiveFrom: selectedFee.effective_from,
          effectiveUntil: selectedFee.effective_until,
          isActive: selectedFee.is_active
        })
      });

      if (!response.ok) throw new Error('Failed to update fee');

      const updatedFee = await response.json();
      setFees(prev => prev.map(fee => fee.id === updatedFee.id ? updatedFee : fee));
      setShowEditModal(false);
      setSelectedFee(null);
      toast.success('Fee updated successfully');
    } catch (error) {
      console.error('Error updating fee:', error);
      toast.error('Failed to update fee');
    }
  };

  const handleDeleteFee = async (feeId: string) => {
    if (!confirm('Are you sure you want to delete this fee? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/semester-fees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: feeId })
      });

      if (!response.ok) throw new Error('Failed to delete fee');

      setFees(prev => prev.filter(fee => fee.id !== feeId));
      toast.success('Fee deleted successfully');
    } catch (error) {
      console.error('Error deleting fee:', error);
      toast.error('Failed to delete fee');
    }
  };

  const resetForm = () => {
    const currentSemester = getCurrentSemester();
    setFormData({
      routeId: '',
      academicYear: currentSemester.academicYear,
      semester: currentSemester.semester,
      effectiveFrom: currentSemester.startDate,
      effectiveUntil: currentSemester.endDate,
      stops: [{ stopName: '', fee: '' }]
    });
  };

  const addStop = () => {
    setFormData(prev => ({
      ...prev,
      stops: [...prev.stops, { stopName: '', fee: '' }]
    }));
  };

  const removeStop = (index: number) => {
    setFormData(prev => ({
      ...prev,
      stops: prev.stops.filter((_, i) => i !== index)
    }));
  };

  const updateStop = (index: number, field: 'stopName' | 'fee', value: string) => {
    setFormData(prev => ({
      ...prev,
      stops: prev.stops.map((stop, i) => 
        i === index ? { ...stop, [field]: value } : stop
      )
    }));
  };

  const filteredFees = fees.filter(fee => {
    const matchesSearch = searchTerm === '' || 
      fee.stop_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fee.routes?.route_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fee.routes?.route_number.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filters.status === 'all' || 
      (filters.status === 'active' && fee.is_active) ||
      (filters.status === 'inactive' && !fee.is_active);

    return matchesSearch && matchesStatus;
  });

  const getUniqueAcademicYears = () => {
    const years = [...new Set(fees.map(fee => fee.academic_year))];
    return years.sort().reverse();
  };

  const stats = {
    totalFees: fees.length,
    activeFees: fees.filter(fee => fee.is_active).length,
    totalRoutes: [...new Set(fees.map(fee => fee.route_id))].length,
    averageFee: fees.length > 0 ? Math.round(fees.reduce((sum, fee) => sum + (fee.semester_fee || 0), 0) / fees.length) : 0
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">3-Term Fee Management</h1>
          <p className="text-gray-600">Set and manage term-wise fees for all routes and stops (3-Term Academic System)</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={() => setShowBulkModal(true)}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
          >
            <Upload className="w-4 h-4" />
            <span>Bulk Import</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Fees</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <DollarSign className="w-8 h-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Fees</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalFees}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Active Fees</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activeFees}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <RouteIcon className="w-8 h-8 text-purple-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Routes</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalRoutes}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <TrendingUp className="w-8 h-8 text-orange-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Avg Fee</p>
              <p className="text-2xl font-bold text-gray-900">₹{stats.averageFee}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search routes, stops..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Route</label>
            <select
              value={filters.route}
              onChange={(e) => setFilters(prev => ({ ...prev, route: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Routes</option>
              {routes.map(route => (
                <option key={route.id} value={route.id}>
                  {route.route_number} - {route.route_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year</label>
            <select
              value={filters.academicYear}
              onChange={(e) => setFilters(prev => ({ ...prev, academicYear: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Years</option>
              {getUniqueAcademicYears().map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Term/Payment Type</label>
            <select
              value={filters.semester}
              onChange={(e) => setFilters(prev => ({ ...prev, semester: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Terms</option>
              <option value="1">Term 1 (Jun-Sep)</option>
              <option value="2">Term 2 (Oct-Jan)</option>
              <option value="3">Term 3 (Feb-May)</option>
              <option value="full_year">Full Year Payment</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fees Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Term Fees ({filteredFees.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stop</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Academic Year</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Term</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Validity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFees.map((fee) => (
                <tr key={fee.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {fee.routes?.route_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {fee.routes?.route_name}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">{fee.stop_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-lg font-semibold text-green-600">₹{fee.semester_fee || 0}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {fee.academic_year}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      fee.semester === '1' ? 'bg-white text-gray-800 border border-gray-300' :
                      fee.semester === '2' ? 'bg-blue-100 text-blue-800' :
                      fee.semester === '3' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {fee.semester === '1' ? 'Term 1 (Jun-Sep)' :
                       fee.semester === '2' ? 'Term 2 (Oct-Jan)' :
                       fee.semester === '3' ? 'Term 3 (Feb-May)' :
                       'Full Year'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      <div>{new Date(fee.effective_from).toLocaleDateString()}</div>
                      <div>to {new Date(fee.effective_until).toLocaleDateString()}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      fee.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {fee.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setSelectedFee({
                            ...fee,
                            semester_fee: fee.semester_fee || 0
                          });
                          setShowEditModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFee(fee.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Create Semester Fees</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                <div className="space-y-6">
                  {/* Route and Semester Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Route *</label>
                      <select
                        value={formData.routeId}
                        onChange={(e) => handleRouteChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        disabled={loadingRouteStops}
                      >
                        <option value="">Select Route</option>
                        {routes.map(route => (
                          <option key={route.id} value={route.id}>
                            {route.route_number} - {route.route_name}
                          </option>
                        ))}
                      </select>
                      {loadingRouteStops && (
                        <div className="mt-2 flex items-center text-sm text-blue-600">
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Loading route stops...
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year *</label>
                      <input
                        type="text"
                        placeholder="e.g., 2024-25"
                        value={formData.academicYear}
                        onChange={(e) => setFormData(prev => ({ ...prev, academicYear: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Term *</label>
                      <select
                        value={formData.semester}
                        onChange={(e) => setFormData(prev => ({ ...prev, semester: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                                                  <option value="1">Term 1 (Jun-Sep)</option>
                          <option value="2">Term 2 (Oct-Jan)</option>
                          <option value="3">Term 3 (Feb-May)</option>
                      </select>
                    </div>
                  </div>

                  {/* Validity Period */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Effective From *</label>
                      <input
                        type="date"
                        value={formData.effectiveFrom}
                        onChange={(e) => setFormData(prev => ({ ...prev, effectiveFrom: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Effective Until *</label>
                      <input
                        type="date"
                        value={formData.effectiveUntil}
                        onChange={(e) => setFormData(prev => ({ ...prev, effectiveUntil: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Stops and Fees */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Stops and Fees *</label>
                        {formData.routeId && !loadingRouteStops && (
                          <p className="text-xs text-gray-500 mt-1">
                            Stops are automatically loaded from the selected route. You can add additional stops if needed.
                          </p>
                        )}
                      </div>
                      <button
                        onClick={addStop}
                        className="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-1 text-sm"
                        disabled={loadingRouteStops}
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Stop</span>
                      </button>
                    </div>
                    {loadingRouteStops ? (
                      <div className="flex items-center justify-center py-8 text-gray-500">
                        <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                        <span>Loading route stops...</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {formData.stops.map((stop, index) => (
                          <div key={index} className="flex space-x-3 items-center">
                            <div className="flex-1">
                              <input
                                type="text"
                                placeholder="Stop name"
                                value={stop.stopName}
                                onChange={(e) => updateStop(index, 'stopName', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="w-32">
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                                <input
                                  type="number"
                                  placeholder="Fee"
                                  value={stop.fee || ''}
                                  onChange={(e) => updateStop(index, 'fee', e.target.value)}
                                  className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                            {formData.stops.length > 1 && (
                              <button
                                onClick={() => removeStop(index)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFees}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Create Fees</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && selectedFee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Edit Semester Fee</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Route</label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      {selectedFee.routes?.route_number} - {selectedFee.routes?.route_name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Stop</label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      {selectedFee.stop_name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Term Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                      <input
                        type="number"
                        value={selectedFee.semester_fee || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const numValue = parseFloat(value);
                          setSelectedFee(prev => prev ? { 
                            ...prev, 
                            semester_fee: isNaN(numValue) ? 0 : numValue 
                          } : null);
                        }}
                        className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Effective From</label>
                      <input
                        type="date"
                        value={selectedFee.effective_from}
                        onChange={(e) => setSelectedFee(prev => prev ? { ...prev, effective_from: e.target.value } : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Effective Until</label>
                      <input
                        type="date"
                        value={selectedFee.effective_until}
                        onChange={(e) => setSelectedFee(prev => prev ? { ...prev, effective_until: e.target.value } : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedFee.is_active}
                        onChange={(e) => setSelectedFee(prev => prev ? { ...prev, is_active: e.target.checked } : null)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateFee}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Fee</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SemesterFeeManagement; 