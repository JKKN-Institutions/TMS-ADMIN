import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MercydaCredentials {
  username: string;
  password: string;
  baseUrl?: string;
}

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

interface MercydaResponse {
  success: boolean;
  data: MercydaVehicle[];
  message?: string;
}

export class MercydaTrackingService {
  private credentials: MercydaCredentials;
  private baseUrl: string;

  constructor(credentials: MercydaCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.baseUrl || 'https://console.mercydatrack.com/api';
  }

  /**
   * Authenticate with MERCYDA tracking service
   */
  async authenticate(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.credentials.username,
          password: this.credentials.password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.token || data.access_token || null;
      } else {
        console.error('MERCYDA authentication failed:', response.statusText);
        return null;
      }
    } catch (error) {
      console.error('MERCYDA authentication error:', error);
      return null;
    }
  }

  /**
   * Fetch vehicle locations from MERCYDA service
   */
  async getVehicleLocations(token?: string): Promise<MercydaVehicle[]> {
    try {
      // If no token provided, authenticate first
      if (!token) {
        const authToken = await this.authenticate();
        if (!authToken) {
          throw new Error('Failed to authenticate with MERCYDA service');
        }
        token = authToken;
      }

      const response = await fetch(`${this.baseUrl}/vehicles/locations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: MercydaResponse = await response.json();
        return data.data || [];
      } else {
        // Try alternative endpoints
        return await this.tryAlternativeEndpoints(token);
      }
    } catch (error) {
      console.error('Error fetching MERCYDA vehicle locations:', error);
      return [];
    }
  }

  /**
   * Try alternative API endpoints for MERCYDA
   */
  private async tryAlternativeEndpoints(token: string): Promise<MercydaVehicle[]> {
    const endpoints = [
      '/vehicles',
      '/tracking/vehicles',
      '/api/vehicles',
      '/gps/vehicles',
      '/devices'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return this.parseVehicleData(data);
        }
      } catch (error) {
        continue; // Try next endpoint
      }
    }

    return [];
  }

  /**
   * Parse vehicle data from various response formats
   */
  private parseVehicleData(data: any): MercydaVehicle[] {
    if (!data) return [];

    // Handle different response structures
    const vehicles = data.vehicles || data.data || data.devices || (Array.isArray(data) ? data : []);
    
    return vehicles.map((vehicle: any) => ({
      id: vehicle.id || vehicle.device_id || vehicle.vehicle_id || Math.random().toString(),
      name: vehicle.name || vehicle.vehicle_name || vehicle.device_name || 'Unknown Vehicle',
      latitude: parseFloat(vehicle.latitude || vehicle.lat || vehicle.location?.latitude || 0),
      longitude: parseFloat(vehicle.longitude || vehicle.lng || vehicle.location?.longitude || 0),
      speed: parseFloat(vehicle.speed || vehicle.velocity || 0),
      heading: parseFloat(vehicle.heading || vehicle.direction || vehicle.course || 0),
      timestamp: vehicle.timestamp || vehicle.last_update || vehicle.updated_at || new Date().toISOString(),
      status: vehicle.status || 'unknown'
    })).filter((vehicle: MercydaVehicle) => vehicle.latitude && vehicle.longitude);
  }

  /**
   * Sync MERCYDA vehicle data with local GPS devices
   */
  async syncWithLocalDevices(): Promise<{ success: boolean; updated: number; errors: string[] }> {
    const result = { success: true, updated: 0, errors: [] as string[] };

    try {
      // Get vehicles from MERCYDA
      const mercydaVehicles = await this.getVehicleLocations();
      
      if (mercydaVehicles.length === 0) {
        result.errors.push('No vehicle data received from MERCYDA service');
        return result;
      }

      // Get local GPS devices that are configured for MERCYDA
      const { data: gpsDevices, error: devicesError } = await supabase
        .from('gps_devices')
        .select('id, device_id, device_name, notes')
        .eq('status', 'active')
        .ilike('notes', '%mercyda%');

      if (devicesError) {
        result.errors.push(`Database error: ${devicesError.message}`);
        result.success = false;
        return result;
      }

      // Update GPS data for each matching device
      for (const gpsDevice of gpsDevices || []) {
        try {
          // Find matching MERCYDA vehicle (by name or ID in notes)
          const matchingVehicle = mercydaVehicles.find(vehicle => 
            vehicle.name.toLowerCase().includes(gpsDevice.device_name.toLowerCase()) ||
            gpsDevice.notes?.includes(vehicle.id)
          );

          if (matchingVehicle) {
            await this.updateVehicleLocation(gpsDevice.id, matchingVehicle);
            result.updated++;
          }
        } catch (error) {
          result.errors.push(`Error updating device ${gpsDevice.device_name}: ${error}`);
        }
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Sync error: ${error}`);
    }

    return result;
  }

  /**
   * Update vehicle location in local database
   */
  private async updateVehicleLocation(gpsDeviceId: string, vehicleData: MercydaVehicle): Promise<void> {
    const currentTime = new Date().toISOString();

    // Find vehicle with this GPS device
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, registration_number, live_tracking_enabled')
      .eq('gps_device_id', gpsDeviceId)
      .single();

    if (vehicleError || !vehicle) {
      throw new Error(`Vehicle not found for GPS device ${gpsDeviceId}`);
    }

    if (!vehicle.live_tracking_enabled) {
      throw new Error(`Live tracking not enabled for vehicle ${vehicle.registration_number}`);
    }

    // Update vehicle GPS location
    const { error: updateError } = await supabase
      .from('vehicles')
      .update({
        current_latitude: vehicleData.latitude,
        current_longitude: vehicleData.longitude,
        gps_speed: vehicleData.speed,
        gps_heading: vehicleData.heading,
        gps_accuracy: 10, // Estimated accuracy for MERCYDA
        last_gps_update: currentTime,
        updated_at: currentTime
      })
      .eq('id', vehicle.id);

    if (updateError) {
      throw new Error(`Failed to update vehicle location: ${updateError.message}`);
    }

    // Store in GPS history
    await supabase
      .from('gps_location_history')
      .insert([{
        vehicle_id: vehicle.id,
        gps_device_id: gpsDeviceId,
        latitude: vehicleData.latitude,
        longitude: vehicleData.longitude,
        speed: vehicleData.speed,
        heading: vehicleData.heading,
        accuracy: 10,
        timestamp: vehicleData.timestamp,
        created_at: currentTime
      }]);

    // Update GPS device heartbeat
    await supabase
      .from('gps_devices')
      .update({
        last_heartbeat: currentTime,
        updated_at: currentTime
      })
      .eq('id', gpsDeviceId);
  }

  /**
   * Test connection to MERCYDA service
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const token = await this.authenticate();
      
      if (!token) {
        return {
          success: false,
          message: 'Authentication failed. Please check username and password.'
        };
      }

      const vehicles = await this.getVehicleLocations(token);
      
      return {
        success: true,
        message: `Successfully connected to MERCYDA. Found ${vehicles.length} vehicles.`,
        data: vehicles
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error}`
      };
    }
  }
}

// Export singleton instance for JKKN configuration
export const mercydaService = new MercydaTrackingService({
  username: 'ats@jkkn.org',
  password: '123456'
}); 