'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import {
  X,
  MapPin,
  Clock,
  Navigation,
  Wifi,
  WifiOff,
  RefreshCw,
  Activity,
  Target,
  AlertCircle,
  CheckCircle,
  Loader2,
  Calendar,
  Route as RouteIcon,
  Car,
  Users,
  Eye,
  Layers
} from 'lucide-react';
import toast from 'react-hot-toast';

// Dynamic imports for Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(mod => mod.Circle), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false });

interface DriverLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: any;
}

interface LocationData {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  timestamp: string | null;
  lastUpdate: string | null;
  sharingEnabled: boolean;
  trackingEnabled: boolean;
  trackingStatus: string;
  driverName: string;
}

interface TrackingRecord {
  id: string;
  tracking_date: string;
  tracking_timestamp: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number;
  heading?: number;
  location_source: string;
  data_quality: string;
  routes?: {
    id: string;
    route_number: string;
    route_name: string;
  };
  vehicles?: {
    id: string;
    registration_number: string;
    model: string;
  };
}

const DriverLocationModal: React.FC<DriverLocationModalProps> = ({
  isOpen,
  onClose,
  driver
}) => {
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<TrackingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [selectedTab, setSelectedTab] = useState<'current' | 'history'>('current');
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  // Fetch location data
  const fetchLocationData = async () => {
    if (!driver?.id) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/admin/drivers/location/${driver.id}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success) {
          // Extract location data from the correct structure
          const locationData: LocationData = {
            latitude: data.driver.currentLocation?.latitude || null,
            longitude: data.driver.currentLocation?.longitude || null,
            accuracy: data.driver.currentLocation?.accuracy || null,
            timestamp: data.driver.currentLocation?.timestamp || null,
            lastUpdate: data.driver.currentLocation?.lastUpdate || null,
            sharingEnabled: data.driver.sharingEnabled === true,
            trackingEnabled: data.driver.trackingEnabled === true,
            trackingStatus: data.driver.trackingStatus || 'inactive',
            driverName: data.driver.name || driver.name || 'Unknown Driver'
          };
          
          setLocationData(locationData);
          setTrackingHistory(data.trackingHistory || []);
          setLastRefresh(new Date());
        } else {
          setLocationData(null);
          toast.error(data.error || 'Failed to fetch location data');
        }
      } else {
        console.error('Failed to fetch location:', response.statusText);
        setLocationData(null);
        toast.error('Failed to fetch location data');
      }
    } catch (error) {
      console.error('Error fetching location:', error);
      setLocationData(null);
      toast.error('Failed to fetch location data');
    } finally {
      setLoading(false);
    }
  };

  // Load Leaflet
  useEffect(() => {
    const loadLeaflet = async () => {
      if (typeof window !== 'undefined') {
        const L = await import('leaflet');
        
        // Fix default icon issue
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        });

        // Store L globally for use in components
        (window as any).L = L;
        setLeafletLoaded(true);
      }
    };

    if (isOpen) {
      loadLeaflet();
    }
  }, [isOpen]);

  // Auto-refresh location data
  useEffect(() => {
    if (isOpen && autoRefresh && driver?.id) {
      // Initial fetch
      fetchLocationData();
      
      // Set up auto-refresh every 60 seconds (optimized for cost)
      const interval = setInterval(fetchLocationData, 60000);
      setRefreshInterval(interval);

      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  }, [isOpen, autoRefresh, driver?.id]);

  // Manual refresh
  const handleRefresh = () => {
    fetchLocationData();
    toast.success('Location refreshed');
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'text-green-600';
      case 'inactive': return 'text-gray-600';
      case 'paused': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'inactive': return <WifiOff className="w-4 h-4 text-gray-600" />;
      case 'paused': return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default: return <WifiOff className="w-4 h-4 text-gray-600" />;
    }
  };

  // Get default center for map
  const getDefaultCenter = () => {
    if (locationData?.latitude && locationData?.longitude) {
      return [locationData.latitude, locationData.longitude] as [number, number];
    }
    // Default to a central location (you can adjust this)
    return [11.4200, 77.8000] as [number, number];
  };

  if (!isOpen || !driver) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Navigation className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Driver Location Tracking</h2>
              <p className="text-gray-600">{driver.driver_name || driver.name}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="flex border-b bg-gray-50 flex-shrink-0">
            <button
              onClick={() => setSelectedTab('current')}
              className={`flex items-center space-x-2 px-6 py-3 text-sm font-medium transition-colors ${
                selectedTab === 'current'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Current Location</span>
            </button>
            <button
              onClick={() => setSelectedTab('history')}
              className={`flex items-center space-x-2 px-6 py-3 text-sm font-medium transition-colors ${
                selectedTab === 'history'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Tracking History</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedTab === 'current' ? (
              <div className="space-y-6">
                {/* Current Location Status */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Current Location</h3>
                    {locationData && (
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(locationData.trackingStatus)}
                        <span className={`text-sm font-medium ${getStatusColor(locationData.trackingStatus)}`}>
                          {locationData.trackingStatus || 'Unknown'}
                        </span>
                      </div>
                    )}
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      <span className="ml-2 text-gray-600">Loading location data...</span>
                    </div>
                  ) : locationData ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Location Coordinates */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Latitude</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {locationData.latitude ? locationData.latitude.toFixed(6) : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Longitude</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {locationData.longitude ? locationData.longitude.toFixed(6) : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Accuracy</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {locationData.accuracy ? `${locationData.accuracy}m` : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Timestamps */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Last Update</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {locationData.lastUpdate ? formatTimestamp(locationData.lastUpdate) : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Location Timestamp</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {locationData.timestamp ? formatTimestamp(locationData.timestamp) : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Sharing Status</span>
                          <span className={`text-sm font-semibold ${locationData.sharingEnabled ? 'text-green-600' : 'text-red-600'}`}>
                            {locationData.sharingEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Tracking Status</span>
                          <span className={`text-sm font-semibold ${locationData.trackingEnabled ? 'text-green-600' : 'text-red-600'}`}>
                            {locationData.trackingEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No location data available</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Driver may not have location sharing enabled or no recent updates
                      </p>
                    </div>
                  )}
                </div>

                {/* Interactive Map */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Location Map</h3>
                    <span className="text-sm text-gray-500">Interactive map view</span>
                  </div>
                  <div className="h-96 rounded-lg overflow-hidden border border-gray-200">
                    {leafletLoaded && locationData?.latitude && locationData?.longitude ? (
                      <MapContainer
                        center={getDefaultCenter()}
                        zoom={15}
                        className="h-full w-full"
                        style={{ height: '100%', width: '100%' }}
                        key={`map-${locationData.latitude}-${locationData.longitude}`}
                      >
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        
                        {/* Driver Location Marker */}
                        <Marker
                          position={[locationData.latitude, locationData.longitude]}
                        >
                          <Popup>
                            <div className="p-3 min-w-[250px]">
                              <div className="flex items-center space-x-2 mb-2">
                                <Navigation className="w-5 h-5 text-blue-600" />
                                <h3 className="font-bold text-lg">{locationData.driverName}</h3>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Latitude:</span>
                                  <span className="font-medium">{locationData.latitude?.toFixed(6)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Longitude:</span>
                                  <span className="font-medium">{locationData.longitude?.toFixed(6)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Accuracy:</span>
                                  <span className="font-medium">{locationData.accuracy ? `${locationData.accuracy}m` : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Status:</span>
                                  <span className={`font-medium ${locationData.sharingEnabled ? 'text-green-600' : 'text-red-600'}`}>
                                    {locationData.sharingEnabled ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t text-xs text-gray-500">
                                Last updated: {locationData.lastUpdate ? formatTimestamp(locationData.lastUpdate) : 'N/A'}
                              </div>
                            </div>
                          </Popup>
                        </Marker>

                        {/* Tracking History Markers */}
                        {trackingHistory.length > 0 && trackingHistory.slice(0, 10).map((record, index) => (
                          <Marker
                            key={`history-${record.id}`}
                            position={[record.latitude, record.longitude]}
                          >
                            <Popup>
                              <div className="p-3 min-w-[200px]">
                                <div className="flex items-center space-x-2 mb-2">
                                  <Activity className="w-4 h-4 text-blue-600" />
                                  <h4 className="font-semibold text-sm">History Point {index + 1}</h4>
                                </div>
                                <div className="space-y-1 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Time:</span>
                                    <span className="font-medium">{formatTimestamp(record.tracking_timestamp)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Accuracy:</span>
                                    <span className="font-medium">{record.accuracy ? `${record.accuracy}m` : 'N/A'}</span>
                                  </div>
                                  {record.speed && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Speed:</span>
                                      <span className="font-medium">{record.speed} km/h</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        ))}

                        {/* Tracking Path */}
                        {trackingHistory.length > 1 && (
                          <Polyline
                            positions={trackingHistory.slice(0, 10).map(record => [record.latitude, record.longitude])}
                            color="#3b82f6"
                            weight={3}
                            opacity={0.6}
                            dashArray="5, 10"
                          />
                        )}

                        {/* Accuracy Circle */}
                        {locationData.accuracy && (
                          <Circle
                            center={[locationData.latitude, locationData.longitude]}
                            radius={locationData.accuracy}
                            fillColor="#3b82f6"
                            fillOpacity={0.2}
                            color="#3b82f6"
                            weight={2}
                          />
                        )}
                      </MapContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center bg-gray-50">
                        <div className="text-center">
                          <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-600">
                            {!leafletLoaded ? 'Loading map...' : !locationData?.latitude || !locationData?.longitude ? 'No location data available' : 'Map loading...'}
                          </p>
                          <p className="text-sm text-gray-500 mt-2">
                            {locationData?.latitude && locationData?.longitude ? 
                              `Location: ${locationData.latitude.toFixed(6)}, ${locationData.longitude.toFixed(6)}` : 
                              'Waiting for location data...'
                            }
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Tracking History */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Tracking History</h3>
                    <span className="text-sm text-gray-500">
                      {trackingHistory.length} record{trackingHistory.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {trackingHistory.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-auto">
                      {trackingHistory.map((record) => (
                        <div key={record.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <MapPin className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-medium text-gray-900">
                                {record.routes?.route_name || 'Unknown Route'}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {formatTimestamp(record.tracking_timestamp)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Latitude:</span>
                              <span className="ml-1 font-medium">{record.latitude?.toFixed(6)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Longitude:</span>
                              <span className="ml-1 font-medium">{record.longitude?.toFixed(6)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Accuracy:</span>
                              <span className="ml-1 font-medium">{record.accuracy ? `${record.accuracy}m` : 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Speed:</span>
                              <span className="ml-1 font-medium">{record.speed ? `${record.speed} km/h` : 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No tracking history available</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Location tracking history will appear here
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Auto-refresh every 60s</span>
            </label>
            {lastRefresh && (
              <span className="text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default DriverLocationModal;
