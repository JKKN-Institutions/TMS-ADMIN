'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Navigation, Clock, MapPin, Activity, AlertTriangle, Wifi, WifiOff, Battery, BatteryLow } from 'lucide-react';
import toast from 'react-hot-toast';

interface LiveGPSTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: any;
  title: string;
}

export default function LiveGPSTrackingModal({ isOpen, onClose, route, title }: LiveGPSTrackingModalProps) {
  const [gpsData, setGpsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen && route?.id) {
      fetchGPSData();
      fetchGPSAlerts();
      
      // Set up real-time polling every 10 seconds
      intervalRef.current = setInterval(() => {
        fetchGPSData();
      }, 10000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isOpen, route?.id]);

  const fetchGPSData = async () => {
    try {
      if (!route?.id) return;

      const response = await fetch(`/api/admin/gps/location?route_id=${route.id}`);
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        setGpsData(result.data[0]);
        setLastUpdate(new Date());
      } else {
        console.log('No GPS data found for route:', route.id);
      }
    } catch (error) {
      console.error('Error fetching GPS data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGPSAlerts = async () => {
    try {
      if (!route?.id) return;

      const response = await fetch(`/api/admin/gps/alerts?route_id=${route.id}&unresolved=true`);
      const result = await response.json();

      if (result.success) {
        setAlerts(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching GPS alerts:', error);
    }
  };

  const getLocationStatus = () => {
    if (!gpsData?.last_gps_update) return 'offline';
    
    const lastUpdateTime = new Date(gpsData.last_gps_update);
    const now = new Date();
    const timeDiff = now.getTime() - lastUpdateTime.getTime();
    const minutesDiff = Math.floor(timeDiff / 60000);

    if (minutesDiff <= 2) return 'online';
    if (minutesDiff <= 5) return 'recent';
    return 'offline';
  };

  const formatTimeSince = (date: string | Date) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const updateTime = new Date(date);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-600 bg-green-50 border-green-200';
      case 'recent': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'offline': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <Activity className="w-4 h-4" />;
      case 'recent': return <Clock className="w-4 h-4" />;
      case 'offline': return <WifiOff className="w-4 h-4" />;
      default: return <Wifi className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  const locationStatus = getLocationStatus();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            <p className="text-blue-100 text-sm">
              Route {route?.route_number} - {route?.route_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading GPS data...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* GPS Status Card */}
              <div className={`border rounded-lg p-4 ${getStatusColor(locationStatus)}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(locationStatus)}
                    <div>
                      <h3 className="font-semibold">
                        {locationStatus === 'online' ? 'GPS Active' : 
                         locationStatus === 'recent' ? 'GPS Recent' : 'GPS Offline'}
                      </h3>
                      <p className="text-sm opacity-75">
                        Last update: {formatTimeSince(gpsData?.last_gps_update || '')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {gpsData?.gps_devices?.device_name || 'No Device'}
                    </p>
                    <p className="text-xs opacity-75">
                      {gpsData?.gps_devices?.device_id || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Current Location */}
              {gpsData?.current_latitude && gpsData?.current_longitude ? (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                    Current Location
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm text-gray-600">Latitude</p>
                      <p className="font-mono text-lg">{Number(gpsData.current_latitude).toFixed(6)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm text-gray-600">Longitude</p>
                      <p className="font-mono text-lg">{Number(gpsData.current_longitude).toFixed(6)}</p>
                    </div>
                  </div>

                  {/* GPS Metadata */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {gpsData.gps_speed && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{gpsData.gps_speed}</p>
                        <p className="text-sm text-gray-600">km/h</p>
                      </div>
                    )}
                    {gpsData.gps_heading && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{Math.round(gpsData.gps_heading)}°</p>
                        <p className="text-sm text-gray-600">Heading</p>
                      </div>
                    )}
                    {gpsData.gps_accuracy && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-purple-600">±{gpsData.gps_accuracy}m</p>
                        <p className="text-sm text-gray-600">Accuracy</p>
                      </div>
                    )}
                    <div className="text-center">
                      <div className="flex items-center justify-center">
                        {locationStatus === 'online' ? (
                          <Activity className="w-6 h-6 text-green-600" />
                        ) : (
                          <WifiOff className="w-6 h-6 text-red-600" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 capitalize">{locationStatus}</p>
                    </div>
                  </div>

                  {/* Map Integration Placeholder */}
                  <div className="mt-4 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <MapPin className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-600 mb-2">Interactive Map View</p>
                    <p className="text-sm text-gray-500">
                      Map integration can be added with Google Maps, Leaflet, or other mapping services
                    </p>
                    <div className="mt-4 space-x-2">
                      <button 
                        onClick={() => {
                          const url = `https://www.google.com/maps?q=${gpsData.current_latitude},${gpsData.current_longitude}`;
                          window.open(url, '_blank');
                        }}
                        className="btn-secondary text-sm"
                      >
                        View on Google Maps
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mr-3" />
                    <div>
                      <h3 className="font-medium text-yellow-800">No GPS Location Data</h3>
                      <p className="text-yellow-700 text-sm">
                        {!route?.live_tracking_enabled 
                          ? 'Live tracking is not enabled for this route.' 
                          : 'Waiting for GPS device to send location data...'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* GPS Alerts */}
              {alerts.length > 0 && (
                <div className="bg-white border border-red-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-red-800 mb-4 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Active GPS Alerts ({alerts.length})
                  </h3>
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="border border-red-200 rounded p-3 bg-red-50">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-red-800">{alert.title}</p>
                            <p className="text-sm text-red-600">{alert.description}</p>
                            <p className="text-xs text-red-500 mt-1">
                              {formatTimeSince(alert.created_at)}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            alert.severity === 'high' ? 'bg-red-200 text-red-800' :
                            alert.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                            'bg-blue-200 text-blue-800'
                          }`}>
                            {alert.severity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Device Information */}
              {gpsData?.gps_devices && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">GPS Device Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Device Name</p>
                      <p className="font-medium">{gpsData.gps_devices.device_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Device ID</p>
                      <p className="font-mono">{gpsData.gps_devices.device_id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        gpsData.gps_devices.status === 'active' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {gpsData.gps_devices.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Last Heartbeat</p>
                      <p className="text-sm">{formatTimeSince(gpsData.gps_devices.last_heartbeat || '')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {lastUpdate && (
              <span>Last refreshed: {lastUpdate.toLocaleTimeString()}</span>
            )}
          </div>
          <div className="space-x-3">
            <button
              onClick={fetchGPSData}
              className="btn-secondary"
              disabled={loading}
            >
              Refresh Data
            </button>
            <button onClick={onClose} className="btn-primary">
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 