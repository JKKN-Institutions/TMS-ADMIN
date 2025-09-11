'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Phone,
  Mail,
  Star,
  MapPin,
  Clock,
  Award,
  AlertCircle,
  User,
  Shield,
  Car,
  Route as RouteIcon,
  Calendar,
  FileText,
  Heart,
  CreditCard,
  X,
  Save,
  ArrowRight,
  ArrowLeft,
  Check,
  Users,
  UserCheck,
  TrendingUp,
  Activity,
  Loader2,
  Navigation,
  Wifi,
  WifiOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';
import AddDriverModal from '@/components/add-driver-modal';
import EditDriverModal from '@/components/edit-driver-modal';
import DriverDetailsModal from '@/components/driver-details-modal';
import DriverLocationModal from '@/components/driver-location-modal';
import UniversalStatCard from '@/components/universal-stat-card';
import { createDriverStats, safeNumber } from '@/lib/stat-utils';

const DriverCard = ({ driver, onEdit, onDelete, onView, onViewLocation, userRole }: any) => {
  const canEdit = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';
  const canView = true;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'on_leave': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{driver.driver_name}</h3>
            <p className="text-sm text-gray-600">{driver.license_number}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(driver.status)}`}>
          {driver.status}
        </span>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Phone className="w-4 h-4" />
          <span>{driver.phone_number}</span>
        </div>
        {driver.email && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Mail className="w-4 h-4" />
            <span className="truncate">{driver.email}</span>
          </div>
        )}
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4" />
          <span>{driver.experience_years} years experience</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Activity className="w-4 h-4" />
          <span>{driver.total_trips || 0} total trips</span>
        </div>
        {/* Location Status */}
        {driver.location_sharing_enabled && (
          <div className="flex items-center space-x-2 text-sm text-green-600">
            <Wifi className="w-4 h-4" />
            <span>Location Sharing Active</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <div className="flex space-x-2">
          {canView && (
            <button
              onClick={() => onView(driver)}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Eye className="w-4 h-4" />
              <span>View</span>
            </button>
          )}
          {driver.location_sharing_enabled && (
            <button
              onClick={() => onViewLocation(driver)}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            >
              <Navigation className="w-4 h-4" />
              <span>Location</span>
            </button>
          )}
        </div>
        <div className="flex space-x-2">
          {canEdit && (
            <button
              onClick={() => onEdit(driver)}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>Edit</span>
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(driver)}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const DriversPage = () => {
  const [user, setUser] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [viewingDriver, setViewingDriver] = useState<any>(null);
  const [viewingLocationDriver, setViewingLocationDriver] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/drivers');
      const result = await response.json();

      if (result.success) {
        setDrivers(result.data || []);
      } else {
        console.error('Failed to fetch drivers:', result.error);
        toast.error('Failed to fetch drivers');
        setDrivers([]);
      }
    } catch (error) {
      console.error('Error fetching drivers:', error);
      toast.error('Failed to fetch drivers');
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDriver = async (driver: any) => {
    if (confirm(`Are you sure you want to delete driver ${driver.driver_name}?`)) {
      try {
        // In a real app, this would call the delete API
        // await DatabaseService.deleteDriver(driver.id);
        toast.success(`Driver ${driver.driver_name} would be deleted`);
        // For now, just remove from local state
        setDrivers(drivers.filter(d => d.id !== driver.id));
      } catch (error) {
        toast.error('Failed to delete driver');
      }
    }
  };

  const handleViewLocation = (driver: any) => {
    setViewingLocationDriver(driver);
  };

  const filteredDrivers = drivers.filter(driver => {
    const matchesSearch = driver.driver_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         driver.license_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         driver.phone_number?.includes(searchTerm) ||
                         driver.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || driver.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const canAddDriver = user && ['super_admin', 'transport_manager'].includes(user.role);

  // Stats calculations with safe defaults
  const totalDrivers = drivers.length;
  const activeDrivers = drivers.filter(d => d.status === 'active').length;
  const onLeave = drivers.filter(d => d.status === 'on_leave').length;
  
  // Safe average rating calculation
  const driversWithRatings = drivers.filter(d => d.rating && d.rating > 0);
  const averageRating = driversWithRatings.length > 0 
    ? driversWithRatings.reduce((sum, d) => sum + (d.rating || 0), 0) / driversWithRatings.length 
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading drivers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drivers Management</h1>
          <p className="text-gray-600">Manage driver records and assignments</p>
        </div>
        {canAddDriver && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Driver</span>
          </button>
        )}
      </div>

      {/* Enhanced Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        {createDriverStats({
          totalDrivers: totalDrivers,
          activeDrivers: activeDrivers,
          onLeave: onLeave,
          avgRating: averageRating,
          totalTrips: 0 // This would need to be calculated from data
        }).map((stat, index) => (
          <UniversalStatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={
              index === 0 ? UserCheck :
              index === 1 ? Activity :
              index === 2 ? Calendar :
              Star
            }
            trend={stat.trend}
            color={stat.color}
            variant="default"
            loading={loading}
            delay={index}
          />
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search drivers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-full sm:w-auto"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On Leave</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredDrivers.map((driver) => (
          <DriverCard
            key={driver.id}
            driver={driver}
            onEdit={(d: any) => {
              setEditingDriver(d);
              setIsEditModalOpen(true);
            }}
            onDelete={handleDeleteDriver}
            onView={(d: any) => {
              setViewingDriver(d);
              setIsDetailsModalOpen(true);
            }}
            onViewLocation={handleViewLocation}
            userRole={user?.role}
          />
        ))}
      </div>

      {filteredDrivers.length === 0 && !loading && (
        <div className="text-center py-12">
          <UserCheck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No drivers registered yet</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search or filters to find drivers'
              : 'Start building your driver fleet by adding your first driver to the system'
            }
          </p>
          {canAddDriver && !searchTerm && statusFilter === 'all' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Driver</span>
            </button>
          )}
        </div>
      )}

      {/* Add Driver Modal */}
      <AddDriverModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchDrivers}
      />

      {/* Edit Driver Modal */}
      <EditDriverModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingDriver(null);
        }}
        onSuccess={fetchDrivers}
        driver={editingDriver}
      />

      {/* Driver Details Modal */}
      <DriverDetailsModal
        isOpen={isDetailsModalOpen && !!viewingDriver}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setViewingDriver(null);
        }}
        driver={viewingDriver}
      />

      {/* Driver Location Modal */}
      <DriverLocationModal
        isOpen={!!viewingLocationDriver}
        onClose={() => {
          setViewingLocationDriver(null);
        }}
        driver={viewingLocationDriver}
      />
    </div>
  );
};

export default DriversPage; 