'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Users, Activity, Clock, RefreshCw, Filter, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

// Dynamically import the map component to avoid SSR issues
const LiveTrackingMap = dynamic(() => import('@/components/live-tracking-map'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading map...</p>
      </div>
    </div>
  )
});

interface DriverLocation {
  id: string;
  name: string;
  current_latitude: number;
  current_longitude: number;
  location_accuracy: number | null;
  location_timestamp: string;
  last_location_update: string;
  location_sharing_enabled: boolean;
  location_tracking_status: string;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  vehicle_id: string | null;
  registration_number: string | null;
  gps_status?: string;
  time_since_update?: number | null;
  location_status?: string;
  status_message?: string;
}

export default function TrackAllPage() {
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchDriverLocations = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/admin/track-all/drivers');
      
      if (!response.ok) {
        throw new Error('Failed to fetch driver locations');
      }

      const data = await response.json();
      
      if (data.success) {
        setDriverLocations(data.drivers);
        setLastUpdate(new Date());
      } else {
        throw new Error(data.error || 'Failed to fetch driver locations');
      }
    } catch (error) {
      console.error('Error fetching driver locations:', error);
      toast.error('Failed to fetch driver locations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDriverLocations();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDriverLocations, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    fetchDriverLocations();
    toast.success('Driver locations refreshed');
  };

  const filteredDrivers = filterEnabled 
    ? driverLocations.filter(driver => driver.location_sharing_enabled)
    : driverLocations;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-50 border-green-200';
      case 'inactive': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Activity className="w-4 h-4" />;
      case 'inactive': return <Clock className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getGPSStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-600 bg-green-50 border-green-200';
      case 'recent': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'offline': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getGPSStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <Activity className="w-4 h-4" />;
      case 'recent': return <Clock className="w-4 h-4" />;
      case 'offline': return <WifiOff className="w-4 h-4" />;
      default: return <Wifi className="w-4 h-4" />;
    }
  };

  const getLocationIssueMessage = (locationStatus?: string) => {
    switch (locationStatus) {
      case 'sharing_disabled':
        return 'Location sharing disabled';
      case 'no_route':
        return 'No route assigned';
      case 'no_vehicle':
        return 'No vehicle assigned';
      case 'no_location':
        return 'No location data';
      default:
        return 'Location unavailable';
    }
  };

  const formatTimeSince = (dateString: string) => {
    if (!dateString) return 'Never';
    
    const now = new Date();
    const updateTime = new Date(dateString);
    const diffMs = now.getTime() - updateTime.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes === 0) return 'Just now';
    if (diffMinutes === 1) return '1 minute ago';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    return updateTime.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Track All Drivers</h1>
          <p className="text-gray-600">Real-time location tracking for all drivers</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setFilterEnabled(!filterEnabled)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-colors ${
              filterEnabled 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>{filterEnabled ? 'Show All' : 'Show Active Only'}</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Drivers</p>
              <p className="text-2xl font-bold text-gray-900">{driverLocations.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Tracking</p>
              <p className="text-2xl font-bold text-gray-900">
                {driverLocations.filter(d => d.location_sharing_enabled).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <MapPin className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">On Route</p>
              <p className="text-2xl font-bold text-gray-900">
                {driverLocations.filter(d => d.route_id).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Last Update</p>
              <p className="text-sm font-bold text-gray-900">
                {lastUpdate ? formatTimeSince(lastUpdate.toISOString()) : 'Never'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Live Driver Locations</h2>
          <p className="text-sm text-gray-600">
            Showing {filteredDrivers.length} driver{filteredDrivers.length !== 1 ? 's' : ''} 
            {filterEnabled && ' with active location sharing'}
          </p>
        </div>
        <div className="h-[600px] relative">
          {loading ? (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading driver locations...</p>
              </div>
            </div>
          ) : (
            <LiveTrackingMap driverLocations={filteredDrivers} />
          )}
        </div>
      </div>

      {/* Driver List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Driver Details</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Route
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vehicle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Update
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDrivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-600">
                            {driver.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{driver.name}</div>
                        <div className="text-sm text-gray-500">ID: {driver.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {driver.route_name ? (
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          Route {driver.route_number}
                        </div>
                        <div className="text-sm text-gray-500">{driver.route_name}</div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Not assigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {driver.registration_number ? (
                      <span className="text-sm text-gray-900">{driver.registration_number}</span>
                    ) : (
                      <span className="text-sm text-gray-500">Not assigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-2">
                      {/* Tracking Status */}
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(driver.location_tracking_status)}`}>
                        {getStatusIcon(driver.location_tracking_status)}
                        <span className="ml-1 capitalize">{driver.location_tracking_status}</span>
                      </div>
                      {/* GPS Status */}
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getGPSStatusColor(driver.gps_status || 'offline')}`}>
                        {getGPSStatusIcon(driver.gps_status || 'offline')}
                        <span className="ml-1 capitalize">{driver.gps_status || 'offline'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {driver.last_location_update ? (
                      <div>
                        <div>{formatTimeSince(driver.last_location_update)}</div>
                        {driver.time_since_update !== null && (
                          <div className="text-xs text-gray-400">
                            {driver.time_since_update} min ago
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {driver.current_latitude && driver.current_longitude ? (
                      <div>
                        <div>{driver.current_latitude.toFixed(6)}</div>
                        <div>{driver.current_longitude.toFixed(6)}</div>
                        {driver.location_accuracy && (
                          <div className="text-xs text-gray-400">
                            ±{Math.round(driver.location_accuracy)}m
                          </div>
                        )}
                        {driver.status_message && (
                          <div className="text-xs text-blue-600 mt-1">
                            {driver.status_message}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-400">
                        <div className="flex items-center space-x-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>{getLocationIssueMessage(driver.location_status)}</span>
                        </div>
                        {driver.status_message && (
                          <div className="text-xs text-gray-500 mt-1">
                            {driver.status_message}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
