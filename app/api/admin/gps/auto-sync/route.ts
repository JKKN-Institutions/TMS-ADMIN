import { NextRequest, NextResponse } from 'next/server';
import { mercydaService } from '@/lib/gps-services/mercyda-tracking';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Auto-sync endpoint for MERCYDA GPS data
// This can be called by a cron job or scheduled task
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting automated MERCYDA GPS sync...');

    // Check if sync is enabled (you can add a setting for this)
    const { data: setting, error: settingError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'mercyda_auto_sync_enabled')
      .single();

    if (settingError || setting?.value !== 'true') {
      return NextResponse.json({
        success: false,
        message: 'Auto-sync is disabled',
        skipped: true
      });
    }

    // Perform the sync
    const syncResult = await mercydaService.syncWithLocalDevices();

    // Log the sync result
    await supabase
      .from('gps_sync_logs')
      .insert([{
        service: 'mercyda',
        status: syncResult.success ? 'success' : 'error',
        devices_updated: syncResult.updated,
        error_count: syncResult.errors.length,
        errors: syncResult.errors,
        sync_time: new Date().toISOString()
      }]);

    console.log(`✅ MERCYDA sync completed: ${syncResult.updated} devices updated`);

    return NextResponse.json({
      success: syncResult.success,
      message: `Auto-sync completed. Updated ${syncResult.updated} devices.`,
      details: {
        updated: syncResult.updated,
        errors: syncResult.errors.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Auto-sync error:', error);
    
    // Log the error
    try {
      await supabase
        .from('gps_sync_logs')
        .insert([{
          service: 'mercyda',
          status: 'error',
          devices_updated: 0,
          error_count: 1,
          errors: [error instanceof Error ? error.message : String(error)],
          sync_time: new Date().toISOString()
        }]);
    } catch (logError) {
      console.error('Failed to log sync error:', logError);
    }

    return NextResponse.json(
      { 
        success: false,
        error: 'Auto-sync failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// POST - Manually trigger sync or update settings
export async function POST(request: NextRequest) {
  try {
    const { action, enabled } = await request.json();

    if (action === 'toggle_auto_sync') {
      const { error } = await supabase
        .from('settings')
        .upsert([{
          key: 'mercyda_auto_sync_enabled',
          value: enabled ? 'true' : 'false',
          updated_at: new Date().toISOString()
        }]);

      if (error) {
        throw new Error(`Failed to update setting: ${error.message}`);
      }

      return NextResponse.json({
        success: true,
        message: `Auto-sync ${enabled ? 'enabled' : 'disabled'}`,
        enabled
      });
    }

    if (action === 'manual_sync') {
      const syncResult = await mercydaService.syncWithLocalDevices();
      
      return NextResponse.json({
        success: syncResult.success,
        message: `Manual sync completed. Updated ${syncResult.updated} devices.`,
        details: syncResult
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Auto-sync POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 