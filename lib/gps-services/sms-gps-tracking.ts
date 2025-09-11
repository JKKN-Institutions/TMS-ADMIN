import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GPSDevice {
  id: string;
  device_id: string;
  device_name: string;
  sim_number: string;
  imei?: string;
  device_model?: string;
}

interface LocationData {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: Date;
  accuracy?: number;
  altitude?: number;
}

interface SMSGPSResponse {
  success: boolean;
  location?: LocationData;
  message: string;
  rawResponse?: string;
}

export class SMSGPSTrackingService {
  
  // Common GPS SMS commands for different device types
  private readonly GPS_COMMANDS = {
    // Standard location request commands
    location: ['where', 'location', 'loc', 'position', 'G123456#', 'pos'],
    
    // Real-time tracking commands  
    realtime: ['monitor on', 'track on', 'auto on', 'T030S***', 'track'],
    
    // Stop tracking
    stopTracking: ['monitor off', 'track off', 'auto off', 'notn'],
    
    // Device status
    status: ['status', 'check', 'info', 'bat'],
    
    // Configuration
    apn: ['apn'],
    interval: ['upload']
  };

  /**
   * Send SMS command to GPS device and get location
   */
  async getLocationBySMS(deviceId: string): Promise<SMSGPSResponse> {
    try {
      // Get device details from database
      const { data: device, error } = await supabase
        .from('gps_devices')
        .select('*')
        .eq('device_id', deviceId)
        .single();

      if (error || !device) {
        return {
          success: false,
          message: 'GPS device not found in database'
        };
      }

      if (!device.sim_number) {
        return {
          success: false,
          message: 'No SIM number configured for this device'
        };
      }

      console.log(`📱 Sending SMS to GPS device: ${device.device_name} (${device.sim_number})`);

      // Try multiple location commands
      for (const command of this.GPS_COMMANDS.location) {
        const response = await this.sendSMSCommand(device.sim_number, command);
        
        if (response.success && response.location) {
          // Update device location in database
          await this.updateDeviceLocation(device.id, response.location);
          return response;
        }
      }

      return {
        success: false,
        message: 'No location response received from GPS device'
      };

    } catch (error) {
      console.error('SMS GPS tracking error:', error);
      return {
        success: false,
        message: `Error: ${error}`
      };
    }
  }

  /**
   * Send SMS command using SMS service provider
   */
  private async sendSMSCommand(phoneNumber: string, command: string): Promise<SMSGPSResponse> {
    try {
      console.log(`📤 Sending SMS command "${command}" to ${phoneNumber}`);

      // Option 1: Using Twilio SMS API
      const twilioResponse = await this.sendViaTwilio(phoneNumber, command);
      if (twilioResponse.success) return twilioResponse;

      // Option 2: Using local SMS gateway (if available)
      const localResponse = await this.sendViaLocalGateway(phoneNumber, command);
      if (localResponse.success) return localResponse;

      // Option 3: Using alternative SMS service
      const altResponse = await this.sendViaAlternativeService(phoneNumber, command);
      return altResponse;

    } catch (error) {
      return {
        success: false,
        message: `SMS send error: ${error}`
      };
    }
  }

  /**
   * Send SMS via Twilio
   */
  private async sendViaTwilio(phoneNumber: string, command: string): Promise<SMSGPSResponse> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return { success: false, message: 'Twilio credentials not configured' };
    }

    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phoneNumber,
          From: fromNumber,
          Body: command
        })
      });

      if (response.ok) {
        console.log('✅ SMS sent via Twilio');
        
        // Wait for GPS device response (typically 30-60 seconds)
        await new Promise(resolve => setTimeout(resolve, 45000));
        
        // Check for incoming SMS responses (implement webhook handler)
        return await this.checkForSMSResponse(phoneNumber);
      }

      return { success: false, message: 'Twilio SMS send failed' };

    } catch (error) {
      return { success: false, message: `Twilio error: ${error}` };
    }
  }

  /**
   * Send SMS via local SMS gateway (USB modem, etc.)
   */
  private async sendViaLocalGateway(phoneNumber: string, command: string): Promise<SMSGPSResponse> {
    // This would integrate with a local SMS modem/gateway
    // Common options: Gammu, SMS Server Tools, or custom AT commands
    
    try {
      // Example using HTTP API to local SMS gateway
      const gatewayUrl = process.env.LOCAL_SMS_GATEWAY_URL;
      
      if (!gatewayUrl) {
        return { success: false, message: 'Local SMS gateway not configured' };
      }

      const response = await fetch(`${gatewayUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneNumber,
          message: command
        })
      });

      if (response.ok) {
        console.log('✅ SMS sent via local gateway');
        
        // Wait for response
        await new Promise(resolve => setTimeout(resolve, 45000));
        
        return await this.checkForSMSResponse(phoneNumber);
      }

      return { success: false, message: 'Local gateway SMS send failed' };

    } catch (error) {
      return { success: false, message: `Local gateway error: ${error}` };
    }
  }

  /**
   * Send SMS via alternative service (TextBelt, etc.)
   */
  private async sendViaAlternativeService(phoneNumber: string, command: string): Promise<SMSGPSResponse> {
    try {
      // Using TextBelt as example (free for testing)
      const response = await fetch('https://textbelt.com/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneNumber,
          message: command,
          key: process.env.TEXTBELT_API_KEY || 'textbelt'
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ SMS sent via TextBelt');
        
        // Wait for GPS response
        await new Promise(resolve => setTimeout(resolve, 45000));
        
        return await this.checkForSMSResponse(phoneNumber);
      }

      return { success: false, message: `TextBelt error: ${result.error}` };

    } catch (error) {
      return { success: false, message: `Alternative service error: ${error}` };
    }
  }

  /**
   * Check for SMS response from GPS device
   */
  private async checkForSMSResponse(phoneNumber: string): Promise<SMSGPSResponse> {
    try {
      // This would check your SMS inbox for responses
      // Implementation depends on your SMS service provider
      
      // For now, return a mock response - implement based on your SMS provider's webhook/API
      const mockResponse = "Lat:13.0827,Lon:80.2707,Speed:0km/h,T:2025-01-22 12:00:00";
      
      return this.parseGPSResponse(mockResponse);

    } catch (error) {
      return {
        success: false,
        message: `Response check error: ${error}`
      };
    }
  }

  /**
   * Parse GPS response from SMS
   */
  private parseGPSResponse(response: string): SMSGPSResponse {
    console.log(`📨 Parsing GPS response: ${response}`);

    try {
      // Common GPS SMS response formats:
      // "Lat:13.0827,Lon:80.2707,Speed:0km/h,T:2025-01-22 12:00:00"
      // "Location: 13.0827N,80.2707E Speed:15km/h Time:12:00:00"
      // "http://maps.google.com/maps?q=13.0827,80.2707"

      let latitude: number = 0;
      let longitude: number = 0;
      let speed: number = 0;
      let timestamp: Date = new Date();

      // Parse different response formats
      if (response.includes('Lat:') && response.includes('Lon:')) {
        // Format: "Lat:13.0827,Lon:80.2707,Speed:0km/h"
        const latMatch = response.match(/Lat:([+-]?\d+\.?\d*)/);
        const lonMatch = response.match(/Lon:([+-]?\d+\.?\d*)/);
        const speedMatch = response.match(/Speed:(\d+\.?\d*)/);

        if (latMatch && lonMatch) {
          latitude = parseFloat(latMatch[1]);
          longitude = parseFloat(lonMatch[1]);
          speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
        }
      } else if (response.includes('maps.google.com')) {
        // Format: "http://maps.google.com/maps?q=13.0827,80.2707"
        const coordMatch = response.match(/q=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/);
        if (coordMatch) {
          latitude = parseFloat(coordMatch[1]);
          longitude = parseFloat(coordMatch[2]);
        }
      } else if (response.includes(',')) {
        // Simple format: "13.0827,80.2707"
        const coords = response.split(',');
        if (coords.length >= 2) {
          latitude = parseFloat(coords[0].trim());
          longitude = parseFloat(coords[1].trim());
        }
      }

      if (latitude !== 0 && longitude !== 0) {
        return {
          success: true,
          location: {
            latitude,
            longitude,
            speed,
            heading: 0,
            timestamp,
            accuracy: 10 // Estimate
          },
          message: 'Location parsed successfully',
          rawResponse: response
        };
      }

      return {
        success: false,
        message: 'Could not parse location from GPS response',
        rawResponse: response
      };

    } catch (error) {
      return {
        success: false,
        message: `Parse error: ${error}`,
        rawResponse: response
      };
    }
  }

  /**
   * Update device location in database
   */
  private async updateDeviceLocation(deviceId: string, location: LocationData): Promise<void> {
    try {
      // Update GPS device
      await supabase
        .from('gps_devices')
        .update({
          last_heartbeat: new Date().toISOString(),
          status: 'active'
        })
        .eq('id', deviceId);

      // Update associated vehicle
      await supabase
        .from('vehicles')
        .update({
          current_latitude: location.latitude,
          current_longitude: location.longitude,
          gps_speed: location.speed,
          gps_heading: location.heading,
          last_gps_update: location.timestamp.toISOString(),
          gps_accuracy: location.accuracy
        })
        .eq('gps_device_id', deviceId);

      console.log('✅ Device location updated in database');

    } catch (error) {
      console.error('Database update error:', error);
    }
  }

  /**
   * Enable real-time tracking for a device
   */
  async enableRealTimeTracking(deviceId: string, intervalSeconds: number = 30): Promise<SMSGPSResponse> {
    try {
      const { data: device } = await supabase
        .from('gps_devices')
        .select('*')
        .eq('device_id', deviceId)
        .single();

      if (!device?.sim_number) {
        return { success: false, message: 'Device or SIM number not found' };
      }

      // Send real-time tracking command
      const command = `T${intervalSeconds.toString().padStart(3, '0')}S***`; // Common format
      
      return await this.sendSMSCommand(device.sim_number, command);

    } catch (error) {
      return { success: false, message: `Real-time tracking error: ${error}` };
    }
  }

  /**
   * Get all GPS devices with SIM numbers
   */
  async getGPSDevicesWithSIM(): Promise<GPSDevice[]> {
    const { data, error } = await supabase
      .from('gps_devices')
      .select('*')
      .not('sim_number', 'is', null)
      .neq('sim_number', '');

    if (error) {
      console.error('Error fetching GPS devices:', error);
      return [];
    }

    return data || [];
  }
}

// Export singleton instance
export const smsGPSService = new SMSGPSTrackingService(); 