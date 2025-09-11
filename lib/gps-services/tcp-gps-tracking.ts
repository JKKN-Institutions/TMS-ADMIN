import * as net from 'net';
import * as dgram from 'dgram';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GPSData {
  deviceId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: Date;
  imei?: string;
}

export class TCPGPSTrackingService {
  private tcpServer: net.Server | null = null;
  private udpServer: dgram.Socket | null = null;
  private readonly TCP_PORT = 8888; // Common GPS device port
  private readonly UDP_PORT = 8889;

  /**
   * Start TCP server to receive GPS data
   */
  startTCPServer(): void {
    if (this.tcpServer) {
      console.log('TCP server already running');
      return;
    }

    this.tcpServer = net.createServer((socket) => {
      console.log(`📡 GPS device connected: ${socket.remoteAddress}:${socket.remotePort}`);

      socket.on('data', (data) => {
        this.processTCPData(data, socket);
      });

      socket.on('end', () => {
        console.log('📴 GPS device disconnected');
      });

      socket.on('error', (error) => {
        console.error('TCP connection error:', error);
      });
    });

    this.tcpServer.listen(this.TCP_PORT, () => {
      console.log(`🚀 TCP GPS server listening on port ${this.TCP_PORT}`);
    });
  }

  /**
   * Start UDP server to receive GPS data
   */
  startUDPServer(): void {
    if (this.udpServer) {
      console.log('UDP server already running');
      return;
    }

    this.udpServer = dgram.createSocket('udp4');

    this.udpServer.on('message', (msg, rinfo) => {
      console.log(`📡 UDP data from ${rinfo.address}:${rinfo.port}`);
      this.processUDPData(msg, rinfo);
    });

    this.udpServer.bind(this.UDP_PORT, () => {
      console.log(`🚀 UDP GPS server listening on port ${this.UDP_PORT}`);
    });
  }

  /**
   * Process TCP GPS data
   */
  private async processTCPData(data: Buffer, socket: net.Socket): Promise<void> {
    try {
      const message = data.toString();
      console.log(`📨 TCP Data: ${message}`);

      const gpsData = this.parseGPSMessage(message);
      
      if (gpsData) {
        await this.saveGPSData(gpsData);
        
        // Send acknowledgment to GPS device
        socket.write('OK\n');
      } else {
        console.log('⚠️ Could not parse GPS data');
        socket.write('ERROR\n');
      }

    } catch (error) {
      console.error('TCP data processing error:', error);
      socket.write('ERROR\n');
    }
  }

  /**
   * Process UDP GPS data
   */
  private async processUDPData(data: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    try {
      const message = data.toString();
      console.log(`📨 UDP Data: ${message}`);

      const gpsData = this.parseGPSMessage(message);
      
      if (gpsData) {
        await this.saveGPSData(gpsData);
        console.log('✅ GPS data saved via UDP');
      }

    } catch (error) {
      console.error('UDP data processing error:', error);
    }
  }

  /**
   * Parse GPS message (supports multiple protocols)
   */
  private parseGPSMessage(message: string): GPSData | null {
    try {
      // GT06 Protocol (common format)
      if (message.includes('GT06')) {
        return this.parseGT06Protocol(message);
      }

      // GPRMC format
      if (message.includes('GPRMC')) {
        return this.parseGPRMC(message);
      }

      // TK103 format
      if (message.includes('BR00')) {
        return this.parseTK103(message);
      }

      // Custom JSON format
      if (message.startsWith('{') && message.endsWith('}')) {
        return this.parseJSONFormat(message);
      }

      // Generic comma-separated format
      return this.parseGenericFormat(message);

    } catch (error) {
      console.error('GPS message parsing error:', error);
      return null;
    }
  }

  /**
   * Parse GT06 protocol
   */
  private parseGT06Protocol(message: string): GPSData | null {
    // GT06 format example: *HQ,8988,V,0000.0000,N,00000.0000,E,000.00,000,000000*
    const parts = message.split(',');
    
    if (parts.length >= 10) {
      const latitude = this.parseCoordinate(parts[3], parts[4]);
      const longitude = this.parseCoordinate(parts[5], parts[6]);
      
      if (latitude && longitude) {
        return {
          deviceId: parts[1] || 'unknown',
          latitude: latitude,
          longitude: longitude,
          speed: parseFloat(parts[7]) || 0,
          heading: parseFloat(parts[8]) || 0,
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  /**
   * Parse GPRMC format
   */
  private parseGPRMC(message: string): GPSData | null {
    // $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
    const parts = message.split(',');
    
    if (parts.length >= 12 && parts[2] === 'A') { // Valid fix
      const latitude = this.parseCoordinate(parts[3], parts[4]);
      const longitude = this.parseCoordinate(parts[5], parts[6]);
      
      if (latitude && longitude) {
        return {
          deviceId: 'gprmc-device',
          latitude: latitude,
          longitude: longitude,
          speed: parseFloat(parts[7]) * 1.852 || 0, // Convert knots to km/h
          heading: parseFloat(parts[8]) || 0,
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  /**
   * Parse TK103 format
   */
  private parseTK103(message: string): GPSData | null {
    // (BR00123456BP05000123456A2934.0133N10627.2544E000.0040331160000.0000000000L000146BB)
    const regex = /\(BR00(\d+).*A(\d{4}\.\d{4})([NS])(\d{5}\.\d{4})([EW])(\d{3}\.\d{2})(\d{6})/;
    const match = message.match(regex);
    
    if (match) {
      const lat = parseFloat(match[2]) / 100;
      const lon = parseFloat(match[4]) / 100;
      
      return {
        deviceId: match[1],
        latitude: match[3] === 'S' ? -lat : lat,
        longitude: match[5] === 'W' ? -lon : lon,
        speed: parseFloat(match[6]),
        heading: 0,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  /**
   * Parse JSON format
   */
  private parseJSONFormat(message: string): GPSData | null {
    try {
      const data = JSON.parse(message);
      
      if (data.lat && data.lon) {
        return {
          deviceId: data.device_id || data.imei || 'json-device',
          latitude: parseFloat(data.lat),
          longitude: parseFloat(data.lon),
          speed: parseFloat(data.speed) || 0,
          heading: parseFloat(data.heading) || 0,
          timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
          imei: data.imei
        };
      }
    } catch (error) {
      console.error('JSON parsing error:', error);
    }
    
    return null;
  }

  /**
   * Parse generic comma-separated format
   */
  private parseGenericFormat(message: string): GPSData | null {
    const parts = message.split(',');
    
    // Try to find latitude and longitude in various positions
    for (let i = 0; i < parts.length - 1; i++) {
      const lat = parseFloat(parts[i]);
      const lon = parseFloat(parts[i + 1]);
      
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return {
          deviceId: parts[0] || 'generic-device',
          latitude: lat,
          longitude: lon,
          speed: i + 2 < parts.length ? parseFloat(parts[i + 2]) || 0 : 0,
          heading: i + 3 < parts.length ? parseFloat(parts[i + 3]) || 0 : 0,
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  /**
   * Parse coordinate from degrees/minutes format to decimal
   */
  private parseCoordinate(coord: string, direction: string): number | null {
    if (!coord || !direction) return null;
    
    const value = parseFloat(coord);
    if (isNaN(value)) return null;
    
    // Convert DDMM.MMMM to decimal degrees
    const degrees = Math.floor(value / 100);
    const minutes = value % 100;
    const decimal = degrees + minutes / 60;
    
    return (direction === 'S' || direction === 'W') ? -decimal : decimal;
  }

  /**
   * Save GPS data to database
   */
  private async saveGPSData(gpsData: GPSData): Promise<void> {
    try {
      // Find device by IMEI or device ID
      const { data: device } = await supabase
        .from('gps_devices')
        .select('id')
        .or(`device_id.eq.${gpsData.deviceId},imei.eq.${gpsData.imei || gpsData.deviceId}`)
        .single();

      if (device) {
        // Update device status
        await supabase
          .from('gps_devices')
          .update({
            last_heartbeat: gpsData.timestamp.toISOString(),
            status: 'active'
          })
          .eq('id', device.id);

        // Update vehicle location
        await supabase
          .from('vehicles')
          .update({
            current_latitude: gpsData.latitude,
            current_longitude: gpsData.longitude,
            gps_speed: gpsData.speed,
            gps_heading: gpsData.heading,
            last_gps_update: gpsData.timestamp.toISOString()
          })
          .eq('gps_device_id', device.id);

        console.log(`✅ GPS data saved for device ${gpsData.deviceId}`);
      } else {
        console.log(`⚠️ Device ${gpsData.deviceId} not found in database`);
      }

    } catch (error) {
      console.error('Database save error:', error);
    }
  }

  /**
   * Stop servers
   */
  stopServers(): void {
    if (this.tcpServer) {
      this.tcpServer.close();
      this.tcpServer = null;
      console.log('TCP server stopped');
    }

    if (this.udpServer) {
      this.udpServer.close();
      this.udpServer = null;
      console.log('UDP server stopped');
    }
  }

  /**
   * Configure GPS device via SMS to send data to your server
   */
  async configureDeviceForDirectConnection(deviceSIM: string, serverIP: string): Promise<boolean> {
    try {
      // Common configuration SMS commands
      const configCommands = [
        `APN ${process.env.GPS_APN || 'internet'}`, // Set APN
        `SERVER ${serverIP} ${this.TCP_PORT}`, // Set server address
        `TIMER 30`, // Set reporting interval to 30 seconds
        `GPRS ON`, // Enable GPRS
        `GMT +05:30` // Set timezone for India
      ];

      // Send configuration commands via SMS
      // This would use the SMS service from the previous implementation
      console.log(`📱 Configuring GPS device ${deviceSIM} for direct connection`);
      
      for (const command of configCommands) {
        console.log(`📤 Sending config: ${command}`);
        // await smsGPSService.sendSMSCommand(deviceSIM, command);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between commands
      }

      return true;

    } catch (error) {
      console.error('Device configuration error:', error);
      return false;
    }
  }
}

// Export singleton instance
export const tcpGPSService = new TCPGPSTrackingService(); 