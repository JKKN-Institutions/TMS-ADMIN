'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  MapPin,
  Clock,
  Users,
  Car,
  UserCheck,
  Edit,
  Trash2,
  Eye,
  Route as RouteIcon,
  Star,
  AlertCircle,
  Navigation,
  Activity,
  X,
  Save,
  Loader2,
  Wifi,
  WifiOff,
  Target
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';
import AddRouteModal from '@/components/add-route-modal';
import EditRouteModal from '@/components/edit-route-modal';
import RouteDetailsModal from '@/components/route-details-modal';
import LiveTrackingMap from '@/components/live-tracking-map';
import LiveGPSTrackingModal from '@/components/live-gps-tracking-modal';
import UniversalStatCard from '@/components/universal-stat-card';
import { createRouteStats, safeNumber, safePercentage } from '@/lib/stat-utils';

const RouteCard = ({ route, onEdit, onDelete, onView, onLiveTrack, userRole }: any) => {
  const canEdit = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';
  const canManage = ['super_admin', 'transport_manager'].includes(userRole);
  const canTrack = ['super_admin', 'transport_manager', 'driver_supervisor'].includes(userRole);
  
  const occupancyPercentage = route.current_passengers ? (route.current_passengers / route.total_capacity) * 100 : 0;
  const hasGPSCoordinates = route.start_latitude && route.start_longitude;
  const isLiveTrackingEnabled = hasGPSCoordinates && route.status === 'active';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            route.status === 'active' ? 'bg-green-100' : 
            route.status === 'maintenance' ? 'bg-yellow-100' : 'bg-red-100'
          }`}>
            <RouteIcon className={`w-6 h-6 ${
              route.status === 'active' ? 'text-green-600' : 
              route.status === 'maintenance' ? 'text-yellow-600' : 'text-red-600'
            }`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{route.route_number}</h3>
            <p className="text-sm text-gray-600">{route.route_name}</p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
            route.status === 'active' 
              ? 'bg-green-100 text-green-800' 
              : route.status === 'maintenance'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {route.status}
          </span>
          {hasGPSCoordinates && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex items-center gap-1">
              <Navigation className="w-3 h-3" />
              GPS Enabled
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4" />
          <span>{route.route_stops?.length || 0} stops</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          <span>{route.duration}</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Navigation className="w-4 h-4" />
          <span>{route.distance} km</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Activity className="w-4 h-4" />
          <span>₹{route.fare}</span>
        </div>
      </div>

      {canManage && (
        <div className="border-t border-gray-100 pt-4 mb-4">
          <div className="text-sm text-gray-600 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span>Driver: {route.drivers?.name || 'Not Assigned'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Vehicle: {route.vehicles?.registration_number || 'Not Assigned'}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
          <span>Occupancy</span>
          <span>{route.current_passengers || 0}/{route.total_capacity}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full ${
              occupancyPercentage > 90 ? 'bg-red-500' :
              occupancyPercentage > 70 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${occupancyPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* GPS Status and Live Tracking Info */}
      {hasGPSCoordinates && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Live Tracking Ready</span>
            </div>
            <span className="text-xs text-green-600">GPS Coordinates Available</span>
          </div>
          <div className="mt-2 text-xs text-green-700">
            Start: {route.start_latitude?.toFixed(4)}, {route.start_longitude?.toFixed(4)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex space-x-2">
          <button
            onClick={() => onView(route)}
            className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1"
          >
            <Eye className="w-4 h-4" />
            <span>View Details</span>
          </button>
          {canEdit && (
            <button
              onClick={() => onEdit(route)}
              className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Edit className="w-4 h-4 text-gray-600" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(route)}
              className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-gray-600" />
            </button>
          )}
        </div>
        
        {/* Live Tracking Button */}
        {canTrack && isLiveTrackingEnabled && (
          <button
            onClick={() => onLiveTrack(route)}
            className="w-full bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors flex items-center justify-center space-x-2"
          >
            <Navigation className="w-4 h-4" />
            <span>Live Track Vehicle</span>
          </button>
        )}
        
        {/* GPS Setup Required */}
        {!hasGPSCoordinates && canEdit && (
          <div className="w-full bg-orange-50 text-orange-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center space-x-2">
            <WifiOff className="w-4 h-4" />
            <span>GPS Setup Required</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const RoutesPage = () => {
  const [user, setUser] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any>(null);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isLiveTrackingOpen, setIsLiveTrackingOpen] = useState(false);
  const [trackingRoute, setTrackingRoute] = useState<any>(null);
  const [trackingTitle, setTrackingTitle] = useState('');

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      console.log('Fetching routes...');
      
      // Fetch routes using API route
      const routesResponse = await fetch('/api/admin/routes');
      const routesResult = await routesResponse.json();
      
      if (!routesResult.success) {
        throw new Error(routesResult.error || 'Failed to fetch routes');
      }
      
      const routesData = routesResult.data || [];
      console.log('Routes data received:', routesData);
      
      // Cache drivers and vehicles data to avoid repeated API calls
      let allDrivers: any = null;
      let allVehicles: any = null;

      // Enhance route data with complete information
      const enhancedRoutes = await Promise.all(
        (routesData || []).map(async (route) => {
          try {
            // Fetch route stops for each route to ensure accurate count
            const stopsResponse = await fetch('/api/admin/routes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'getRouteStops', routeId: route.id })
            });
            const stopsResult = await stopsResponse.json();
            const routeStops = stopsResult.success ? stopsResult.data : [];
            
            // Fetch driver and vehicle info if needed
            let driverInfo = route.drivers;
            let vehicleInfo = route.vehicles;

            // If we have driver_id but no driver object, fetch driver details
            if (route.driver_id && !route.drivers) {
              try {
                // Fetch drivers data only once and cache it
                if (!allDrivers) {
                  const driversResponse = await fetch('/api/admin/drivers');
                  const driversResult = await driversResponse.json();
                  allDrivers = driversResult.success ? driversResult.data : [];
                }
                const foundDriver = allDrivers.find((d: any) => d.id === route.driver_id);
                if (foundDriver) {
                  driverInfo = {
                    id: foundDriver.id,
                    name: foundDriver.driver_name || foundDriver.name,
                    phone: foundDriver.phone_number || foundDriver.phone,
                    license_number: foundDriver.license_number,
                    status: foundDriver.status
                  };
                }
              } catch (error) {
                console.warn('Could not fetch driver for route:', route.id, error);
              }
            }

            // If we have vehicle_id but no vehicle object, fetch vehicle details
            if (route.vehicle_id && !route.vehicles) {
              try {
                // Fetch vehicles data only once and cache it
                if (!allVehicles) {
                  const vehiclesResponse = await fetch('/api/admin/vehicles');
                  const vehiclesResult = await vehiclesResponse.json();
                  allVehicles = vehiclesResult.success ? vehiclesResult.data : [];
                }
                const foundVehicle = allVehicles.find((v: any) => v.id === route.vehicle_id);
                if (foundVehicle) {
                  vehicleInfo = {
                    id: foundVehicle.id,
                    registration_number: foundVehicle.registration_number || foundVehicle.vehicle_number,
                    model: foundVehicle.model,
                    capacity: foundVehicle.capacity,
                    status: foundVehicle.status
                  };
                }
              } catch (error) {
                console.warn('Could not fetch vehicle for route:', route.id, error);
              }
            }

            return {
              ...route,
              route_stops: routeStops || [],
              drivers: driverInfo || null,
              vehicles: vehicleInfo || null,
              // Ensure total_capacity is available
              total_capacity: route.total_capacity || route.capacity || 0
            };
          } catch (error) {
            console.warn('Error enhancing route data for route:', route.id, error);
            return route; // Return original route if enhancement fails
          }
        })
      );

      console.log('Enhanced routes data:', enhancedRoutes);
      setRoutes(enhancedRoutes);
      
      if (!enhancedRoutes || enhancedRoutes.length === 0) {
        console.log('No routes found in database - this is normal for a fresh installation');
      } else {
        console.log(`Successfully loaded ${enhancedRoutes.length} routes with full details`);
      }
      
    } catch (error) {
      console.error('Error fetching routes:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error: error
      });
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to load routes: ${errorMessage}`);
      
      // Set empty array to prevent further errors
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoute = async (route: any) => {
    if (confirm(`Are you sure you want to delete route ${route.route_number}?\n\nThis action cannot be undone and will also delete all associated stops.`)) {
      try {
        const result = await DatabaseService.deleteRoute(route.id);
        toast.success(result.message);
        
        // Refresh the routes list to reflect the deletion
        await fetchRoutes();
      } catch (error) {
        console.error('Delete route error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete route';
        toast.error(errorMessage);
      }
    }
  };

  const handleViewRoute = (route: any) => {
    setSelectedRoute(route);
    setIsDetailsModalOpen(true);
  };

  const handleEditRoute = (route: any) => {
    setEditingRoute(route);
    setIsEditModalOpen(true);
  };

  const handleLiveTrack = (route: any) => {
    setTrackingRoute(route);
    setTrackingTitle(`Live Tracking - Route ${route.route_number} (${route.route_name})`);
    setIsLiveTrackingOpen(true);
  };

  const filteredRoutes = routes.filter(route => {
    const matchesSearch = route.route_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         route.route_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         route.start_location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         route.end_location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || route.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const canAddRoute = user && ['super_admin', 'transport_manager'].includes(user.role);

  const activeRoutes = routes.filter(r => r.status === 'active').length;
  const totalOccupancy = routes.reduce((sum, r) => sum + (r.current_passengers || 0), 0);
  const totalCapacity = routes.reduce((sum, r) => sum + (r.total_capacity || 0), 0);
  const gpsEnabledRoutes = routes.filter(r => r.start_latitude && r.start_longitude).length;
  const liveTrackingReady = routes.filter(r => r.start_latitude && r.start_longitude && r.status === 'active').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading routes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Routes Management</h1>
          <p className="text-gray-600">Manage transportation routes with live GPS tracking</p>
        </div>
        {canAddRoute && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Route</span>
          </button>
        )}
      </div>

      {/* Live Tracking Status Summary */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border border-green-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Navigation className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Live Tracking Management</h3>
              <p className="text-sm text-gray-600">Monitor and track all transportation routes in real-time</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">{liveTrackingReady}</p>
              <p className="text-sm text-gray-600">Ready to Track</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{gpsEnabledRoutes}</p>
              <p className="text-sm text-gray-600">GPS Enabled</p>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        {createRouteStats({
          totalRoutes: routes.length,
          activeRoutes: activeRoutes,
          totalOccupancy: totalOccupancy,
          totalCapacity: totalCapacity,
          avgUtilization: safePercentage(totalOccupancy, totalCapacity)
        }).map((stat, index) => (
          <UniversalStatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={index === 0 ? RouteIcon : index === 1 ? Activity : index === 2 ? Users : Target}
            trend={stat.trend}
            color={stat.color}
            variant="default"
            loading={loading}
            delay={index}
          />
        ))}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Avg Utilization</p>
              <p className="text-xl font-bold text-gray-900">
                {totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search routes..."
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
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredRoutes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            onEdit={handleEditRoute}
            onDelete={handleDeleteRoute}
            onView={handleViewRoute}
            onLiveTrack={handleLiveTrack}
            userRole={user?.role}
          />
        ))}
      </div>

      {filteredRoutes.length === 0 && !loading && (
        <div className="text-center py-12">
          <RouteIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900 mb-2">
            {searchTerm || statusFilter !== 'all' ? 'No routes found' : 'No routes configured yet'}
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            {searchTerm || statusFilter !== 'all' 
              ? 'Try adjusting your search or filters to find what you\'re looking for.' 
              : 'Get started by adding your first transportation route with GPS coordinates for live tracking.'
            }
          </p>
          {canAddRoute && !searchTerm && statusFilter === 'all' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add Your First Route</span>
            </button>
          )}
        </div>
      )}

      {/* Add Route Modal */}
      <AddRouteModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchRoutes}
      />

      {/* Edit Route Modal */}
      <EditRouteModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingRoute(null);
        }}
        onSuccess={fetchRoutes}
        route={editingRoute}
      />

      {/* Route Details Modal */}
      <RouteDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedRoute(null);
        }}
        route={selectedRoute}
      />

      {/* Live Tracking Map */}
      <LiveTrackingMap
        isOpen={isLiveTrackingOpen}
        onClose={() => {
          setIsLiveTrackingOpen(false);
          setTrackingRoute(null);
          setTrackingTitle('');
        }}
        vehicleFilter={trackingRoute?.route_number || 'all'}
        title={trackingTitle}
      />
    </div>
  );
};

export default RoutesPage; 