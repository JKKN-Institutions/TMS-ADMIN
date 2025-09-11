import { NextRequest, NextResponse } from 'next/server';
import { smsGPSService } from '@/lib/gps-services/sms-gps-tracking';
import { tcpGPSService } from '@/lib/gps-services/tcp-gps-tracking';

// POST - Direct GPS tracking operations
export async function POST(request: NextRequest) {
  try {
    const { action, deviceId, phoneNumber, serverIP } = await request.json();

    switch (action) {
      case 'sms_location':
        // Get location via SMS
        if (!deviceId) {
          return NextResponse.json(
            { error: 'Device ID is required for SMS location' },
            { status: 400 }
          );
        }

        const locationResult = await smsGPSService.getLocationBySMS(deviceId);
        return NextResponse.json({
          success: locationResult.success,
          message: locationResult.message,
          location: locationResult.location,
          method: 'SMS'
        });

      case 'enable_realtime':
        // Enable real-time SMS tracking
        if (!deviceId) {
          return NextResponse.json(
            { error: 'Device ID is required' },
            { status: 400 }
          );
        }

        const realtimeResult = await smsGPSService.enableRealTimeTracking(deviceId, 30);
        return NextResponse.json({
          success: realtimeResult.success,
          message: realtimeResult.message,
          method: 'SMS Real-time'
        });

      case 'start_tcp_server':
        // Start TCP server for direct connections
        tcpGPSService.startTCPServer();
        tcpGPSService.startUDPServer();
        
        return NextResponse.json({
          success: true,
          message: 'TCP/UDP servers started for direct GPS connections',
          ports: { tcp: 8888, udp: 8889 },
          method: 'Direct Connection'
        });

      case 'configure_device':
        // Configure GPS device for direct connection
        if (!phoneNumber || !serverIP) {
          return NextResponse.json(
            { error: 'Phone number and server IP are required' },
            { status: 400 }
          );
        }

        const configResult = await tcpGPSService.configureDeviceForDirectConnection(phoneNumber, serverIP);
        return NextResponse.json({
          success: configResult,
          message: configResult ? 'Device configured successfully' : 'Device configuration failed',
          method: 'SMS Configuration'
        });

      case 'list_sms_devices':
        // List devices with SIM numbers
        const devices = await smsGPSService.getGPSDevicesWithSIM();
        return NextResponse.json({
          success: true,
          devices: devices,
          count: devices.length,
          method: 'Database Query'
        });

      case 'stop_servers':
        // Stop TCP/UDP servers
        tcpGPSService.stopServers();
        return NextResponse.json({
          success: true,
          message: 'GPS servers stopped',
          method: 'Server Control'
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: sms_location, enable_realtime, start_tcp_server, configure_device, list_sms_devices, stop_servers' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Direct GPS tracking error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error },
      { status: 500 }
    );
  }
}

// GET - Get direct tracking status
export async function GET(request: NextRequest) {
  try {
    // Get devices with SIM numbers
    const devices = await smsGPSService.getGPSDevicesWithSIM();
    
    return NextResponse.json({
      success: true,
      data: {
        available_methods: [
          'SMS Commands',
          'TCP/UDP Direct Connection',
          'HTTP API Endpoints',
          'Real-time Tracking'
        ],
        devices_with_sim: devices.length,
        devices: devices.map(device => ({
          id: device.id,
          device_id: device.device_id,
          device_name: device.device_name,
          sim_number: device.sim_number ? `***${device.sim_number.slice(-4)}` : null, // Hide full number
          has_imei: !!device.imei
        })),
        server_status: {
          tcp_available: true,
          udp_available: true,
          sms_available: true
        }
      }
    });

  } catch (error) {
    console.error('Direct GPS status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 