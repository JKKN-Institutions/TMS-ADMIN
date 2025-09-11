'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Navigation,
  Activity,
  WifiOff,
  Wifi,
  Battery,
  BatteryLow,
  Settings,
  MapPin,
  Calendar,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import UniversalStatCard from '@/components/universal-stat-card';
import AddGPSDeviceModal from '@/components/add-gps-device-modal';
import MercydaGpsIntegration from '@/components/mercyda-gps-integration';

const GPSDeviceCard = ({ device, onEdit, onDelete, onView, userRole }: any) => {
  const canEdit = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';
  const canView = true;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'offline': return 'bg-red-100 text-red-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return <Activity className="w-4 h-4 text-green-600" />;
      case 'inactive': return <Clock className="w-4 h-4 text-gray-600" />;
      case 'offline': return <WifiOff className="w-4 h-4 text-red-600" />;
      case 'maintenance': return <Settings className="w-4 h-4 text-yellow-600" />;
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default: return <Navigation className="w-4 h-4 text-gray-600" />;
    }
  };

  const getLastHeartbeat = () => {
    if (!device.last_heartbeat) return 'Never';
    const lastHeartbeat = new Date(device.last_heartbeat);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastHeartbeat.getTime()) / 60000);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return `${Math.floor(diffMinutes / 1440)} days ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            {getStatusIcon(device.status)}
            <h3 className="text-lg font-semibold text-gray-900">
              {device.device_name}
            </h3>
            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(device.status)}`}>
              {device.status}
            </span>
          </div>
          <p className="text-sm text-gray-600 font-mono">
            Device ID: {device.device_id}
          </p>
          {device.device_model && (
            <p className="text-sm text-gray-500">
              Model: {device.device_model}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Last Heartbeat:</span>
          <span className="text-sm font-medium text-gray-900">
            {getLastHeartbeat()}
          </span>
        </div>
        
        {device.sim_number && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">SIM Number:</span>
            <span className="text-sm font-medium text-gray-900 font-mono">
              {device.sim_number}
            </span>
          </div>
        )}

        {device.imei && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">IMEI:</span>
            <span className="text-sm font-medium text-gray-900 font-mono">
              {device.imei}
            </span>
          </div>
        )}

        {device.battery_level !== null && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Battery:</span>
            <div className="flex items-center space-x-2">
              {device.battery_level < 20 ? (
                <BatteryLow className="w-4 h-4 text-red-600" />
              ) : (
                <Battery className="w-4 h-4 text-green-600" />
              )}
              <span className="text-sm font-medium text-gray-900">
                {device.battery_level}%
              </span>
            </div>
          </div>
        )}

        {device.signal_strength !== null && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Signal:</span>
            <div className="flex items-center space-x-2">
              {device.signal_strength > 70 ? (
                <Wifi className="w-4 h-4 text-green-600" />
              ) : device.signal_strength > 30 ? (
                <Wifi className="w-4 h-4 text-yellow-600" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-600" />
              )}
              <span className="text-sm font-medium text-gray-900">
                {device.signal_strength}%
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex space-x-2">
        {canView && (
          <button
            onClick={() => onView(device)}
            className="flex-1 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors flex items-center justify-center space-x-1"
          >
            <Eye className="w-4 h-4" />
            <span>View</span>
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => onEdit(device)}
            className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-1"
          >
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(device)}
            className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

const GPSDevicesPage = () => {
  const [user, setUser] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any>(null);
  const [viewingDevice, setViewingDevice] = useState<any>(null);
  const [isMercydaModalOpen, setIsMercydaModalOpen] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/gps/devices');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch GPS devices');
      }
      
      setDevices(result.data || []);
    } catch (error) {
      console.error('Error fetching GPS devices:', error);
      toast.error('Failed to load GPS devices');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (device: any) => {
    if (confirm(`Are you sure you want to delete GPS device "${device.device_name}" (${device.device_id})?`)) {
      try {
        // In a real implementation, this would call the delete API
        toast.success(`GPS device ${device.device_name} would be deleted`);
        // For now, just remove from local state
        setDevices(devices.filter(d => d.id !== device.id));
      } catch (error) {
        toast.error('Failed to delete GPS device');
      }
    }
  };

  const handleEditDevice = (device: any) => {
    setEditingDevice(device);
    setIsEditModalOpen(true);
  };

  const handleViewDevice = (device: any) => {
    setViewingDevice(device);
    setIsDetailsModalOpen(true);
  };

  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.device_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const canAddDevice = user && ['super_admin', 'transport_manager'].includes(user.role);

  // Calculate stats
  const totalDevices = devices.length;
  const activeDevices = devices.filter(d => d.status === 'active').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const lowBatteryDevices = devices.filter(d => d.battery_level !== null && d.battery_level < 20).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading GPS devices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GPS Devices Management</h1>
          <p className="text-gray-600">Manage GPS tracking devices for your vehicle fleet</p>
        </div>
        <div className="flex items-center space-x-3">
          {canAddDevice && (
            <button
              onClick={() => setIsMercydaModalOpen(true)}
              className="btn-secondary flex items-center space-x-2"
            >
              <Settings className="w-4 h-4" />
              <span>MERCYDA Integration</span>
            </button>
          )}
          {canAddDevice && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add GPS Device</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <UniversalStatCard
          title="Total Devices"
          value={totalDevices.toString()}
          subtitle="Registered GPS devices"
          icon={Navigation}
          color="blue"
          variant="default"
          loading={loading}
        />
        <UniversalStatCard
          title="Active Devices"
          value={activeDevices.toString()}
          subtitle="Currently online"
          icon={Activity}
          color="green"
          variant="default"
          loading={loading}
        />
        <UniversalStatCard
          title="Offline Devices"
          value={offlineDevices.toString()}
          subtitle="Need attention"
          icon={WifiOff}
          color="red"
          variant="default"
          loading={loading}
        />
        <UniversalStatCard
          title="Low Battery"
          value={lowBatteryDevices.toString()}
          subtitle="Below 20%"
          icon={BatteryLow}
          color="yellow"
          variant="default"
          loading={loading}
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="offline">Offline</option>
            <option value="maintenance">Maintenance</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Device Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredDevices.map((device) => (
          <GPSDeviceCard
            key={device.id}
            device={device}
            onEdit={handleEditDevice}
            onDelete={handleDeleteDevice}
            onView={handleViewDevice}
            userRole={user?.role}
          />
        ))}
      </div>

      {filteredDevices.length === 0 && !loading && (
        <div className="text-center py-12">
          <Navigation className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900 mb-2">
            {searchTerm || statusFilter !== 'all'
              ? 'No GPS devices found'
              : 'No GPS devices registered yet'
            }
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search or filters to find what you\'re looking for.'
              : 'Get started by adding GPS devices to track your vehicle fleet in real-time.'
            }
          </p>
          {canAddDevice && !searchTerm && statusFilter === 'all' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add Your First GPS Device</span>
            </button>
          )}
        </div>
      )}

      {/* Add GPS Device Modal */}
      <AddGPSDeviceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchDevices}
      />

      {/* MERCYDA GPS Integration Modal */}
      {isMercydaModalOpen && (
        <MercydaGpsIntegration
          onClose={() => setIsMercydaModalOpen(false)}
        />
      )}
    </div>
  );
};

export default GPSDevicesPage; 