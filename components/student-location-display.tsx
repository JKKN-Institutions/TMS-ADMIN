'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Clock, Wifi, WifiOff, RefreshCw, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

interface StudentLocationDisplayProps {
  studentId: string;
  studentName: string;
  isVisible: boolean;
}

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  lastUpdate: string;
  sharingEnabled: boolean;
  trackingEnabled: boolean;
}

const StudentLocationDisplay: React.FC<StudentLocationDisplayProps> = ({
  studentId,
  studentName,
  isVisible
}) => {
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // Fetch location data
  const fetchLocation = async () => {
    if (!studentId) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/students/${studentId}/location`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.location) {
          setLocationData(data.location);
          setLastRefresh(new Date());
        } else {
          setLocationData(null);
        }
      } else {
        console.error('Failed to fetch location:', response.statusText);
        setLocationData(null);
      }
    } catch (error) {
      console.error('Error fetching location:', error);
      setLocationData(null);
      toast.error('Failed to fetch student location');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh location data
  useEffect(() => {
    if (isVisible && autoRefresh) {
      // Initial fetch
      fetchLocation();
      
      // Set up auto-refresh every 30 seconds
      const interval = setInterval(fetchLocation, 30000);
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
  }, [isVisible, autoRefresh, studentId]);

  // Manual refresh
  const handleRefresh = () => {
    fetchLocation();
    toast.success('Location refreshed');
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getTimeAgo = (dateString: string) => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } catch {
      return 'Unknown';
    }
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy <= 10) return 'text-green-600';
    if (accuracy <= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'text-green-600' : 'text-red-600';
  };

  const openInMaps = () => {
    if (!locationData) return;
    
    const url = `https://www.google.com/maps?q=${locationData.latitude},${locationData.longitude}`;
    window.open(url, '_blank');
  };

  const getDirections = () => {
    if (!locationData) return;
    
    const url = `https://www.google.com/maps/dir/?api=1&destination=${locationData.latitude},${locationData.longitude}`;
    window.open(url, '_blank');
  };

  // Debug: Always render for now to see if component is working
  // if (!isVisible) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <MapPin className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Live Location</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Refresh location"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-600">Auto-refresh</span>
          </label>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
            <span className="text-gray-600">Fetching location...</span>
          </div>
        </div>
      )}

      {/* No Location Data */}
      {!isLoading && !locationData && (
        <div className="text-center py-8">
          <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h4 className="text-gray-900 font-medium mb-2">No Location Data</h4>
          <p className="text-gray-600 text-sm">
            {studentName} has not shared their location or location sharing is disabled.
          </p>
        </div>
      )}

      {/* Location Data Display */}
      {!isLoading && locationData && (
        <div className="space-y-4">
          {/* Status Indicators */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                {locationData.sharingEnabled ? (
                  <Wifi className="w-4 h-4 text-green-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-600" />
                )}
                <span className={`text-sm font-medium ${getStatusColor(locationData.sharingEnabled)}`}>
                  {locationData.sharingEnabled ? 'Sharing Enabled' : 'Sharing Disabled'}
                </span>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                {locationData.trackingEnabled ? (
                  <Wifi className="w-4 h-4 text-green-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-600" />
                )}
                <span className={`text-sm font-medium ${getStatusColor(locationData.trackingEnabled)}`}>
                  {locationData.trackingEnabled ? 'Tracking Active' : 'Tracking Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Coordinates */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-3">Current Coordinates</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-700 font-medium">Latitude:</span>
                <p className="text-blue-800 font-mono">{locationData.latitude.toFixed(6)}</p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Longitude:</span>
                <p className="text-blue-800 font-mono">{locationData.longitude.toFixed(6)}</p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Accuracy:</span>
                <p className={`font-mono ${getAccuracyColor(locationData.accuracy)}`}>
                  ±{locationData.accuracy.toFixed(1)}m
                </p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Last Update:</span>
                <p className="text-blue-800 text-xs">
                  {getTimeAgo(locationData.lastUpdate)}
                </p>
              </div>
            </div>
          </div>

          {/* Timestamp Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-4 h-4 text-gray-600" />
              <h4 className="text-sm font-semibold text-gray-900">Location Timestamps</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Location Recorded:</span>
                <span className="text-gray-900">{formatTime(locationData.timestamp)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Server Update:</span>
                <span className="text-gray-900">{formatTime(locationData.lastUpdate)}</span>
              </div>
              {lastRefresh && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Refreshed:</span>
                  <span className="text-gray-900">{formatTime(lastRefresh.toISOString())}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={openInMaps}
              className="flex-1 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-medium hover:bg-blue-200 transition-colors flex items-center justify-center space-x-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in Maps</span>
            </button>
            
            <button
              onClick={getDirections}
              className="flex-1 bg-green-100 text-green-700 px-4 py-2 rounded-lg font-medium hover:bg-green-200 transition-colors flex items-center justify-center space-x-2"
            >
              <Navigation className="w-4 h-4" />
              <span>Get Directions</span>
            </button>
          </div>

          {/* Privacy Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <MapPin className="w-4 h-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">Privacy Notice</p>
                <p className="text-xs">
                  Location data is shared only with authorized personnel for transport safety. 
                  Students can disable location sharing at any time through their app settings.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentLocationDisplay; 