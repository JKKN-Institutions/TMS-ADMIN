'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wifi, RefreshCw, CheckCircle, AlertCircle, Settings, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

interface MercydaVehicle {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
  status: string;
}

interface MercydaIntegrationProps {
  onClose: () => void;
}

export default function MercydaGpsIntegration({ onClose }: MercydaIntegrationProps) {
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [vehicles, setVehicles] = useState<MercydaVehicle[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);

  useEffect(() => {
    testConnection();
  }, []);

  const checkAndActivateMercydaDevice = async () => {
    try {
      // Check if MERCYDA device exists and its status
      const response = await fetch('/api/admin/gps/devices');
      const result = await response.json();
      
      if (result.success) {
        const mercydaDevice = result.data.find((device: any) => device.device_id === 'MERCYDA001');
        
        if (mercydaDevice && mercydaDevice.status !== 'active') {
          // Activate the device
          const activateResponse = await fetch(`/api/admin/gps/devices/${mercydaDevice.id}/activate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          const activateResult = await activateResponse.json();
          
          if (activateResult.success) {
            toast.success('MERCYDA device activated - now available for vehicle assignment');
          }
        }
      }
    } catch (error) {
      console.error('Error checking MERCYDA device status:', error);
      // Don't show error toast as this is a background operation
    }
  };

  const testConnection = async () => {
    setConnectionStatus('testing');
    try {
      const response = await fetch('/api/admin/gps/mercyda-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'test' }),
      });

      const result = await response.json();

      if (result.success) {
        setConnectionStatus('connected');
        setVehicles(result.data || []);
        toast.success(result.message);
        
        // Auto-activate MERCYDA device if it exists but is inactive
        await checkAndActivateMercydaDevice();
      } else {
        setConnectionStatus('error');
        toast.error(result.message || 'Connection failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Failed to test MERCYDA connection');
    }
  };

  const syncData = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/admin/gps/mercyda-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'sync' }),
      });

      const result = await response.json();
      setSyncResult(result.details);
      setLastSync(new Date().toISOString());

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message || 'Sync failed');
      }
    } catch (error) {
      toast.error('Failed to sync MERCYDA data');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'testing':
        return <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />;
      case 'connected':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-600" />;
      default:
        return <Wifi className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'testing':
        return 'border-blue-500 bg-blue-50';
      case 'connected':
        return 'border-green-500 bg-green-50';
      case 'error':
        return 'border-red-500 bg-red-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Settings className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">MERCYDA GPS Integration</h2>
                <p className="text-sm text-gray-600">Manage third-party GPS tracking service</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Connection Status */}
          <div className={`p-4 rounded-lg border-2 ${getStatusColor()}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getStatusIcon()}
                <div>
                  <h3 className="font-semibold text-gray-900">Connection Status</h3>
                  <p className="text-sm text-gray-600">
                    Username: ats@jkkn.org | Service: MERCYDA TRACKING
                  </p>
                </div>
              </div>
              <button
                onClick={testConnection}
                disabled={connectionStatus === 'testing'}
                className="btn-primary flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${connectionStatus === 'testing' ? 'animate-spin' : ''}`} />
                <span>Test Connection</span>
              </button>
            </div>
          </div>

          {/* MERCYDA Vehicles */}
          {vehicles.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                MERCYDA Vehicles ({vehicles.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vehicles.map((vehicle) => (
                  <div key={vehicle.id} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <MapPin className="w-5 h-5 text-blue-600 mt-1" />
                        <div>
                          <h4 className="font-medium text-gray-900">{vehicle.name}</h4>
                          <p className="text-sm text-gray-600">ID: {vehicle.id}</p>
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-gray-500">
                              📍 {vehicle.latitude.toFixed(6)}, {vehicle.longitude.toFixed(6)}
                            </p>
                            <p className="text-xs text-gray-500">
                              🚗 Speed: {vehicle.speed} km/h | Heading: {vehicle.heading}°
                            </p>
                            <p className="text-xs text-gray-500">
                              🕐 {new Date(vehicle.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        vehicle.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {vehicle.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sync Controls */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">Data Synchronization</h3>
                <p className="text-sm text-gray-600">
                  Sync MERCYDA vehicle data with your local GPS devices
                </p>
              </div>
              <button
                onClick={syncData}
                disabled={syncing || connectionStatus !== 'connected'}
                className="btn-primary flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            </div>

            {lastSync && (
              <p className="text-sm text-gray-600">
                Last sync: {new Date(lastSync).toLocaleString()}
              </p>
            )}

            {syncResult && (
              <div className="mt-4 p-3 bg-white border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Sync Results</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-green-600">✅ Updated: {syncResult.updated} devices</p>
                  {syncResult.errors.length > 0 && (
                    <div>
                      <p className="text-red-600 font-medium">Errors:</p>
                      {syncResult.errors.map((error: string, index: number) => (
                        <p key={index} className="text-red-600 ml-4">• {error}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Setup Instructions</h3>
            <div className="text-sm text-blue-800 space-y-2">
              <p><strong>Step 1:</strong> Ensure your MERCYDA GPS device is active and transmitting</p>
              <p><strong>Step 2:</strong> Add the MERCYDA device to your local GPS devices with "mercyda" in notes</p>
              <p><strong>Step 3:</strong> Assign the GPS device to a vehicle</p>
              <p><strong>Step 4:</strong> Enable live tracking for the vehicle</p>
              <p><strong>Step 5:</strong> Run sync to start receiving location data</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 