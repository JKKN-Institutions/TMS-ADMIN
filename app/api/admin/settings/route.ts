import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { parseSchedulingConfig } from '@/lib/settings/scheduling';

interface SchedulingSettingsData {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;
  bookingDaysAhead: number;
  allowSameDayBooking: boolean;
  sameDayBookingCutoffHour: number;
  autoNotifyPassengers: boolean;
  autoGenerateBills: boolean;
  inchargeEnforcementMode: 'off' | 'shadow' | 'enforce';
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * Map the parsed (config-shaped) scheduling settings back to the stored
 * blob shape the settings form binds to. parseSchedulingConfig() normalizes
 * + clamps whatever is in the DB (including old-shape or malformed blobs)
 * into a SchedulingConfig, whose field names differ from the blob's
 * (cutoffHour vs bookingWindowEndHour, daysAhead vs bookingDaysAhead).
 */
function toBlobShape(cfg: ReturnType<typeof parseSchedulingConfig>): SchedulingSettingsData {
  return {
    enableBookingTimeWindow: cfg.enableBookingTimeWindow,
    bookingWindowEndHour: cfg.cutoffHour,
    bookingDaysAhead: cfg.daysAhead,
    allowSameDayBooking: cfg.allowSameDayBooking,
    sameDayBookingCutoffHour: cfg.sameDayCutoffHour,
    autoNotifyPassengers: cfg.autoNotifyPassengers,
    autoGenerateBills: cfg.autoGenerateBills,
    inchargeEnforcementMode: cfg.inchargeEnforcementMode,
  };
}

function validate(settings: Record<string, unknown>): string | null {
  const hour = settings.bookingWindowEndHour;
  if (typeof hour !== 'number' || hour < 0 || hour > 23) {
    return 'Booking cutoff hour must be between 0 and 23';
  }
  const days = settings.bookingDaysAhead;
  if (typeof days !== 'number' || days < 1 || days > 14) {
    return 'Booking days available must be between 1 and 14';
  }
  const mode = settings.inchargeEnforcementMode;
  if (mode !== undefined && !['off', 'shadow', 'enforce'].includes(mode as string)) {
    return 'Enforcement mode must be off, shadow, or enforce';
  }
  // Optional — a client that predates same-day booking simply omits these, and
  // parseSchedulingConfig fills the safe defaults (feature off).
  const sameDayHour = settings.sameDayBookingCutoffHour;
  if (sameDayHour !== undefined && (typeof sameDayHour !== 'number' || sameDayHour < 0 || sameDayHour > 23)) {
    return 'Same-day booking cutoff hour must be between 0 and 23';
  }
  const sameDay = settings.allowSameDayBooking;
  if (sameDay !== undefined && typeof sameDay !== 'boolean') {
    return 'Allow same-day booking must be true or false';
  }
  return null;
}

async function getSettings(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('admin_settings')
      .select('settings_data, updated_at')
      .eq('setting_type', 'scheduling')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) {
      // Degrade to defaults if the table doesn't exist yet, same fail-safe as
      // loadSchedulingConfig() — any OTHER error still 500s.
      if ((error as { code?: string }).code === '42P01') {
        return NextResponse.json({ success: true, data: { settings: toBlobShape(parseSchedulingConfig(null)), lastUpdated: null } });
      }
      console.error('admin/settings GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
    if (data && data.length > 0) {
      const cfg = parseSchedulingConfig(data[0].settings_data);
      return NextResponse.json({ success: true, data: { settings: toBlobShape(cfg), lastUpdated: data[0].updated_at } });
    }
    return NextResponse.json({ success: true, data: { settings: toBlobShape(parseSchedulingConfig(null)), lastUpdated: null } });
  } catch (e) {
    console.error('admin/settings GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function saveSettings(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { settings?: Record<string, unknown> };
    const settings = body.settings;
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Settings data is required' }, { status: 400 });
    }
    const invalid = validate(settings);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('admin_settings')
      .upsert(
        {
          setting_type: 'scheduling',
          settings_data: settings,
          updated_at: new Date().toISOString(),
          updated_by: auth.userId,
        },
        { onConflict: 'setting_type' }
      )
      .select();
    if (error) {
      console.error('admin/settings POST error:', error);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'settings',
      action: 'update',
      entityType: 'admin_settings',
      description: `Updated scheduling settings — cutoff ${settings.bookingWindowEndHour}:00, days ahead ${settings.bookingDaysAhead}`,
      metadata: settings,
    });

    // Echo the NORMALIZED blob, not the raw stored one, so POST and GET always
    // return an identical shape (a client-supplied stray key can't leak back out).
    return NextResponse.json({
      success: true,
      data: {
        message: 'Settings saved successfully',
        settings: toBlobShape(parseSchedulingConfig(data[0].settings_data)),
        lastUpdated: data[0].updated_at,
      },
    });
  } catch (e) {
    console.error('admin/settings POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getSettings(auth));
export const POST = withAuth((req, auth) => saveSettings(req, auth));
export const PUT = withAuth((req, auth) => saveSettings(req, auth));
