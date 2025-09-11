import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface SchedulingSettings {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;
  bookingWindowDaysBefore: number;
  autoNotifyPassengers: boolean;
  sendReminderHours: number[];
}

// GET - Retrieve admin settings
export async function GET() {
  try {
    const { data: settings, error } = await supabaseAdmin
      .from('admin_settings')
      .select('*')
      .eq('setting_type', 'scheduling')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching admin settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      );
    }

    // Return settings if found, otherwise return default settings
    if (settings && settings.length > 0) {
      return NextResponse.json({
        settings: settings[0].settings_data,
        lastUpdated: settings[0].updated_at
      });
    } else {
      // Return default settings
      const defaultSettings: SchedulingSettings = {
        enableBookingTimeWindow: true,
        bookingWindowEndHour: 19, // 7 PM cutoff
        bookingWindowDaysBefore: 1,
        autoNotifyPassengers: true,
        sendReminderHours: [24, 2]
      };

      return NextResponse.json({
        settings: defaultSettings,
        lastUpdated: null
      });
    }
  } catch (error) {
    console.error('Error in GET /api/admin/settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save admin settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { settings } = body;

    if (!settings) {
      return NextResponse.json(
        { error: 'Settings data is required' },
        { status: 400 }
      );
    }

    // Validate critical settings
    if (settings.bookingWindowEndHour > 23 || settings.bookingWindowEndHour < 0) {
      return NextResponse.json(
        { error: 'Booking window end hour must be between 0 and 23' },
        { status: 400 }
      );
    }

    if (settings.bookingWindowDaysBefore < 1) {
      return NextResponse.json(
        { error: 'Booking window must be at least 1 day before trip' },
        { status: 400 }
      );
    }

    // Upsert settings
    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .upsert({
        setting_type: 'scheduling',
        settings_data: settings,
        updated_at: new Date().toISOString(),
        updated_by: 'admin' // This could be dynamic based on authentication
      }, {
        onConflict: 'setting_type'
      })
      .select();

    if (error) {
      console.error('Error saving admin settings:', error);
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Settings saved successfully',
      settings: data[0].settings_data,
      lastUpdated: data[0].updated_at
    });
  } catch (error) {
    console.error('Error in POST /api/admin/settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update specific setting
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Setting key and value are required' },
        { status: 400 }
      );
    }

    // Get current settings
    const { data: currentSettings, error: fetchError } = await supabaseAdmin
      .from('admin_settings')
      .select('settings_data')
      .eq('setting_type', 'scheduling')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching current settings:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch current settings' },
        { status: 500 }
      );
    }

    // Update the specific setting
    const updatedSettings = {
      ...(currentSettings?.settings_data || {}),
      [key]: value
    };

    // Save updated settings
    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .upsert({
        setting_type: 'scheduling',
        settings_data: updatedSettings,
        updated_at: new Date().toISOString(),
        updated_by: 'admin'
      }, {
        onConflict: 'setting_type'
      })
      .select();

    if (error) {
      console.error('Error updating setting:', error);
      return NextResponse.json(
        { error: 'Failed to update setting' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Setting updated successfully',
      key,
      value,
      settings: data[0].settings_data,
      lastUpdated: data[0].updated_at
    });
  } catch (error) {
    console.error('Error in PUT /api/admin/settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 