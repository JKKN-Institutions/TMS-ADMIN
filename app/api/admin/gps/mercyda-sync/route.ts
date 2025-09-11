import { NextRequest, NextResponse } from 'next/server';
import { mercydaService } from '@/lib/gps-services/mercyda-tracking';

// POST - Test MERCYDA connection
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'test') {
      const result = await mercydaService.testConnection();
      return NextResponse.json(result);
    }

    if (action === 'sync') {
      const result = await mercydaService.syncWithLocalDevices();
      return NextResponse.json({
        success: result.success,
        message: `Sync completed. Updated ${result.updated} devices.`,
        details: result
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "test" or "sync"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('MERCYDA sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get current sync status and MERCYDA vehicles
export async function GET(request: NextRequest) {
  try {
    const vehicles = await mercydaService.getVehicleLocations();
    
    return NextResponse.json({
      success: true,
      data: vehicles,
      count: vehicles.length,
      lastSync: new Date().toISOString()
    });

  } catch (error) {
    console.error('MERCYDA status error:', error);
    return NextResponse.json(
      { error: 'Failed to get MERCYDA status' },
      { status: 500 }
    );
  }
} 