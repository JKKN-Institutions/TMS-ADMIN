'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
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
  time_since_update?: number;
}

interface LiveTrackingMapProps {
  driverLocations: DriverLocation[];
}

const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({ driverLocations }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Initialize map
    const map = L.map(mapRef.current).setView([11.44445670, 77.73025800], 10); // Default to Tamil Nadu area
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Filter drivers with valid coordinates (guard against undefined)
    const driversWithLocation = (driverLocations || []).filter(
      driver => driver.current_latitude && driver.current_longitude
    );

    if (driversWithLocation.length === 0) {
      // Show message when no drivers have location
      const noDataDiv = L.divIcon({
        className: 'no-data-marker',
        html: `
          <div style="
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            min-width: 200px;
          ">
            <div style="color: #6B7280; font-size: 14px;">
              No drivers with location data available
            </div>
          </div>
        `,
        iconSize: [200, 50],
        iconAnchor: [100, 25]
      });
      
      const noDataMarker = L.marker([11.44445670, 77.73025800], { icon: noDataDiv }).addTo(map);
      markersRef.current.push(noDataMarker);
      return;
    }

    // Create custom icons for different statuses
    const createCustomIcon = (status: string, isActive: boolean, routeNumber: string | null) => {
      const colors = {
        online: '#10B981', // green
        recent: '#F59E0B', // yellow
        offline: '#EF4444', // red
        inactive: '#6B7280' // gray
      };

      const color = isActive ? colors[status as keyof typeof colors] || colors.inactive : colors.inactive;
      
      // Use route number if available, otherwise use a default symbol
      const displayText = routeNumber || '?';
      
      return L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            background: ${color};
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 11px;
            font-family: Arial, sans-serif;
          ">
            ${displayText}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
    };

    // Add markers for each driver
    driversWithLocation.forEach(driver => {
      const status = driver.gps_status || 'offline';
      const isActive = driver.location_sharing_enabled;
      const icon = createCustomIcon(status, isActive, driver.route_number);

      const marker = L.marker(
        [driver.current_latitude, driver.current_longitude],
        { icon }
      ).addTo(map);

      // Create popup content
      const popupContent = `
        <div style="min-width: 250px; font-family: system-ui, -apple-system, sans-serif;">
          <div style="margin-bottom: 12px;">
            <h3 style="margin: 0 0 8px 0; color: #111827; font-size: 16px; font-weight: 600;">
              ${driver.name}
            </h3>
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
              <div style="
                width: 8px; 
                height: 8px; 
                border-radius: 50%; 
                background: ${status === 'online' ? '#10B981' : status === 'recent' ? '#F59E0B' : '#EF4444'};
              "></div>
              <span style="font-size: 12px; color: #6B7280; text-transform: capitalize;">
                ${status} ${isActive ? '(Active)' : '(Inactive)'}
              </span>
            </div>
          </div>
          
          <div style="font-size: 13px; color: #374151;">
            ${driver.route_name ? `
              <div style="margin-bottom: 6px;">
                <strong>Route:</strong> ${driver.route_number} - ${driver.route_name}
              </div>
            ` : ''}
            
            ${driver.registration_number ? `
              <div style="margin-bottom: 6px;">
                <strong>Vehicle:</strong> ${driver.registration_number}
              </div>
            ` : ''}
            
            <div style="margin-bottom: 6px;">
              <strong>Last Update:</strong> ${driver.time_since_update !== null ? 
                `${driver.time_since_update} min ago` : 'Never'}
            </div>
            
            ${driver.location_accuracy ? `
              <div style="margin-bottom: 6px;">
                <strong>Accuracy:</strong> ±${Math.round(driver.location_accuracy)}m
              </div>
            ` : ''}
            
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #E5E7EB;">
              <div style="font-size: 11px; color: #9CA3AF;">
                ${driver.current_latitude.toFixed(6)}, ${driver.current_longitude.toFixed(6)}
              </div>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      markersRef.current.push(marker);
    });

    // Fit map to show all markers
    if (markersRef.current.length > 0) {
      const group = new L.featureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.1));
    }

  }, [driverLocations]);

  return (
    <div 
      ref={mapRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        minHeight: '600px'
      }} 
    />
  );
};

export default LiveTrackingMap; 