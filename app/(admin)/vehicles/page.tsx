'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Car,
  Fuel,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Wrench,
  Activity,
  Loader2,
  Navigation,
  MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';
import AddVehicleModal from '@/components/add-vehicle-modal';
import VehicleDetailsModal from '@/components/vehicle-details-modal';
import EditVehicleModal from '@/components/edit-vehicle-modal';
import UniversalStatCard from '@/components/universal-stat-card';
import { createVehicleStats, safeNumber } from '@/lib/stat-utils';
import LiveGPSTrackingModal from '@/components/live-gps-tracking-modal';

const VehicleCard = ({ vehicle, onEdit, onDelete, onView, onTrack, userRole }: any) => {
  const canEdit = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';
  const canView = true;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'retired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getFuelTypeColor = (fuelType: string) => {
    switch (fuelType?.toLowerCase()) {
      case 'diesel': return 'text-blue-600';
      case 'petrol': return 'text-green-600';
      case 'electric': return 'text-purple-600';
      case 'cng': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const isMaintenanceDue = () => {
    if (!vehicle.next_maintenance) return false;
    return new Date(vehicle.next_maintenance) <= new Date();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            vehicle.status === 'active' ? 'bg-green-100' : 
            vehicle.status === 'maintenance' ? 'bg-yellow-100' : 'bg-gray-100'
          }`}>
            <Car className={`w-6 h-6 ${
              vehicle.status === 'active' ? 'text-green-600' : 
              vehicle.status === 'maintenance' ? 'text-yellow-600' : 'text-gray-600'
            }`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{vehicle.registration_number}</h3>
            <p className="text-sm text-gray-600">{vehicle.model}</p>
          </div>
        </div>
          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(vehicle.status)}`}>
            {vehicle.status}
          </span>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Activity className="w-4 h-4" />
          <span>Capacity: {vehicle.capacity} passengers</span>
        </div>
        <div className="flex items-center space-x-2 text-sm">
          <Fuel className={`w-4 h-4 ${getFuelTypeColor(vehicle.fuel_type)}`} />
          <span className={getFuelTypeColor(vehicle.fuel_type)}>
            {vehicle.fuel_type?.toUpperCase()}
            {vehicle.mileage && ` - ${vehicle.mileage} km/l`}
          </span>
        </div>
        {vehicle.last_maintenance && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Wrench className="w-4 h-4" />
            <span>Last maintenance: {new Date(vehicle.last_maintenance).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Maintenance Status */}
      {vehicle.next_maintenance && (
      <div className="border-t border-gray-100 pt-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">NEXT MAINTENANCE</span>
            <div className="flex items-center space-x-1">
              {isMaintenanceDue() ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-red-600">Due</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-medium text-green-600">
                    {new Date(vehicle.next_maintenance).toLocaleDateString()}
            </span>
                </>
              )}
          </div>
          </div>
        </div>
      )}

      {/* Insurance & Fitness */}
      <div className="border-t border-gray-100 pt-4 mb-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          {vehicle.insurance_expiry && (
            <div>
              <span className="text-gray-500">Insurance expires:</span>
              <p className="font-medium text-gray-900">
                {new Date(vehicle.insurance_expiry).toLocaleDateString()}
              </p>
            </div>
          )}
          {vehicle.fitness_expiry && (
            <div>
              <span className="text-gray-500">Fitness expires:</span>
              <p className="font-medium text-gray-900">
                {new Date(vehicle.fitness_expiry).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex space-x-2">
        {/* GPS Tracking Button */}
        {vehicle.gps_device_id && vehicle.live_tracking_enabled && (
          <button
            onClick={() => onTrack(vehicle)}
            className="flex-1 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors flex items-center justify-center space-x-1"
          >
            <Navigation className="w-4 h-4" />
            <span>Track Live</span>
          </button>
        )}
        {canView && (
        <button
          onClick={() => onView(vehicle)}
          className={`${vehicle.gps_device_id && vehicle.live_tracking_enabled ? 'flex-1' : 'flex-1'} bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1`}
        >
          <Eye className="w-4 h-4" />
          <span>View Details</span>
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => onEdit(vehicle)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit className="w-4 h-4 text-gray-600" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(vehicle)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-gray-600" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

const VehiclesPage = () => {
  const [user, setUser] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fuelFilter, setFuelFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [viewingVehicle, setViewingVehicle] = useState<any>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [trackingVehicle, setTrackingVehicle] = useState<any>(null);
  
  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      
      // Fetch vehicles using API route
      const response = await fetch('/api/admin/vehicles');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch vehicles');
      }
      
      const vehiclesData = result.data || [];
      setVehicles(vehiclesData);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      toast.error('Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVehicle = async (vehicle: any) => {
    if (confirm(`Are you sure you want to delete vehicle ${vehicle.registration_number}?`)) {
      try {
        // In a real app, this would call the delete API
        // await DatabaseService.deleteVehicle(vehicle.id);
        toast.success(`Vehicle ${vehicle.registration_number} would be deleted`);
        // For now, just remove from local state
        setVehicles(vehicles.filter(v => v.id !== vehicle.id));
      } catch (error) {
        toast.error('Failed to delete vehicle');
      }
    }
  };

  const handleEditVehicle = (vehicle: any) => {
    setEditingVehicle(vehicle);
    setIsEditModalOpen(true);
  };

  const handleViewVehicle = (vehicle: any) => {
    setViewingVehicle(vehicle);
    setIsDetailsModalOpen(true);
  };

  const handleTrackVehicle = async (vehicle: any) => {
    try {
      // Find the route assigned to this vehicle
      const response = await fetch('/api/admin/routes');
      const result = await response.json();
      
      if (result.success) {
        const routes = result.data || [];
        const assignedRoute = routes.find((route: any) => route.vehicle_id === vehicle.id);
        
        if (assignedRoute) {
          setTrackingVehicle({ ...vehicle, routes: assignedRoute });
          setIsTrackingModalOpen(true);
        } else {
          toast.error('Vehicle must be assigned to a route for live tracking');
        }
      } else {
        toast.error('Failed to fetch route information');
      }
    } catch (error) {
      toast.error('Failed to start tracking');
    }
  };

  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = vehicle.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         vehicle.model?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
    const matchesFuel = fuelFilter === 'all' || vehicle.fuel_type === fuelFilter;
    return matchesSearch && matchesStatus && matchesFuel;
  });

  const canAddVehicle = user && ['super_admin', 'transport_manager'].includes(user.role);

  // Stats calculations
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter(v => v.status === 'active').length;
  const maintenanceVehicles = vehicles.filter(v => v.status === 'maintenance').length;
  const maintenanceDue = vehicles.filter(v => 
    v.next_maintenance && new Date(v.next_maintenance) <= new Date()
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading vehicles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vehicles Management</h1>
          <p className="text-gray-600">Manage vehicle fleet and maintenance</p>
        </div>
          {canAddVehicle && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Vehicle</span>
            </button>
          )}
      </div>

      {/* Enhanced Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        {createVehicleStats({
          totalVehicles: totalVehicles,
          activeVehicles: activeVehicles,
          maintenanceVehicles: maintenanceVehicles,
          outOfService: maintenanceDue
        }).map((stat, index) => (
          <UniversalStatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={
              index === 0 ? Car :
              index === 1 ? CheckCircle :
              index === 2 ? Wrench :
              AlertTriangle
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search vehicles..."
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
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
          <select
            value={fuelFilter}
            onChange={(e) => setFuelFilter(e.target.value)}
            className="input"
          >
            <option value="all">All Fuel Types</option>
            <option value="diesel">Diesel</option>
            <option value="petrol">Petrol</option>
            <option value="electric">Electric</option>
            <option value="cng">CNG</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredVehicles.map((vehicle) => (
          <VehicleCard
            key={vehicle.id}
            vehicle={vehicle}
            onEdit={handleEditVehicle}
            onDelete={handleDeleteVehicle}
            onView={handleViewVehicle}
            onTrack={handleTrackVehicle}
            userRole={user?.role}
          />
        ))}
      </div>

      {filteredVehicles.length === 0 && !loading && (
        <div className="text-center py-12">
          <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900 mb-2">
            {searchTerm || statusFilter !== 'all' || fuelFilter !== 'all'
              ? 'No vehicles found'
              : 'No vehicles registered yet'
            }
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            {searchTerm || statusFilter !== 'all' || fuelFilter !== 'all'
              ? 'Try adjusting your search or filters to find what you\'re looking for.'
              : 'Get started by adding vehicles to your transportation fleet. Vehicles are the backbone of your route operations and student transportation.'
            }
          </p>
          {canAddVehicle && !searchTerm && statusFilter === 'all' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add Your First Vehicle</span>
            </button>
          )}
        </div>
      )}

      {/* Add Vehicle Modal */}
      <AddVehicleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchVehicles}
      />

      {/* Edit Vehicle Modal */}
      <EditVehicleModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingVehicle(null);
        }}
        onSuccess={fetchVehicles}
        vehicle={editingVehicle}
      />

      {/* Vehicle Details Modal */}
      <VehicleDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setViewingVehicle(null);
        }}
        vehicle={viewingVehicle}
      />

      {/* Live GPS Tracking Modal */}
      {isTrackingModalOpen && trackingVehicle?.routes && (
        <LiveGPSTrackingModal
          isOpen={isTrackingModalOpen}
          onClose={() => {
            setIsTrackingModalOpen(false);
            setTrackingVehicle(null);
          }}
          route={trackingVehicle.routes}
          title={`Live Tracking - ${trackingVehicle.registration_number}`}
        />
      )}
    </div>
  );
};

export default VehiclesPage;
