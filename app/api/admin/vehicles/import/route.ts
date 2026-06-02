import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Bulk-upload endpoint for the Vehicles module. Mirrors the Drivers import
// (app/api/admin/drivers/import) but a vehicle is a STANDALONE entity whose
// natural key is registration_number (UNIQUE in tms_vehicle), so import can both
// CREATE new fleet records and UPDATE existing ones — an upsert keyed on the
// registration number. The accepted columns match the Add Vehicle form fields so
// an export → edit → re-import round-trip works without column translation.

const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'cng'];
const STATUSES = ['active', 'maintenance', 'retired'];

interface RowResult {
  row: number;
  registration_number?: string;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

// First non-empty value among the given keys (accepts snake_case from the
// template/export and camelCase as a fallback for hand-built sheets).
function pick(r: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'yes', '1', 'enabled', 'y'].includes(v.trim().toLowerCase());
  return false;
}

// Accept text 'YYYY-MM-DD' / ISO strings AND Excel serial date numbers → 'YYYY-MM-DD' | null.
function toDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // Excel serial date (epoch 1899-12-30) → JS date.
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  return s ? s.split('T')[0] : null;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function importVehicles(request: NextRequest, auth: AuthContext) {
  try {
    // Service-role client bypasses RLS, so the create permission is enforced here.
    if (!(await requirePerm(auth, 'tms.vehicles.create'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const rows: Record<string, unknown>[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ error: 'rows is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const results: RowResult[] = [];
    const valid: { idx: number; reg: string; payload: Record<string, unknown> }[] = [];

    // Validate + normalise every row first; bad rows are reported, good rows queued.
    rows.forEach((r, i) => {
      const reg = str(pick(r, 'registration_number', 'registrationNumber'));
      if (!reg) {
        results.push({ row: i + 1, status: 'error', message: 'registration_number is required' });
        return;
      }
      const model = str(pick(r, 'model'));
      if (!model) {
        results.push({ row: i + 1, registration_number: reg, status: 'error', message: 'model is required' });
        return;
      }
      const capacity = parseInt(String(pick(r, 'capacity') ?? '')) || 0;
      if (capacity <= 0) {
        results.push({ row: i + 1, registration_number: reg, status: 'error', message: 'capacity must be greater than 0' });
        return;
      }

      const fuel = str(pick(r, 'fuel_type', 'fuelType')).toLowerCase();
      const status = str(pick(r, 'status')).toLowerCase();
      const mileage = pick(r, 'mileage');

      valid.push({
        idx: i,
        reg,
        payload: {
          registration_number: reg,
          model,
          capacity,
          fuel_type: FUEL_TYPES.includes(fuel) ? fuel : 'diesel',
          status: STATUSES.includes(status) ? status : 'active',
          mileage: mileage != null && mileage !== '' ? parseFloat(String(mileage)) || 0 : 0,
          last_maintenance: toDate(pick(r, 'last_maintenance', 'lastMaintenance')),
          next_maintenance: toDate(pick(r, 'next_maintenance', 'nextMaintenance')),
          insurance_expiry: toDate(pick(r, 'insurance_expiry', 'insuranceExpiry')),
          fitness_expiry: toDate(pick(r, 'fitness_expiry', 'fitnessExpiry')),
          purchase_date: toDate(pick(r, 'purchase_date', 'purchaseDate')),
          chassis_number: str(pick(r, 'chassis_number', 'chassisNumber')) || null,
          engine_number: str(pick(r, 'engine_number', 'engineNumber')) || null,
          gps_device_id: str(pick(r, 'gps_device_id', 'gpsDeviceId')) || null,
          live_tracking_enabled: toBool(pick(r, 'live_tracking_enabled', 'liveTrackingEnabled')),
          updated_by: auth.userId,
        },
      });
    });

    // Pre-fetch which reg numbers already exist so the report can say created vs updated.
    const existing = new Set<string>();
    if (valid.length) {
      const { data, error } = await supabase
        .from('tms_vehicle')
        .select('registration_number')
        .in('registration_number', valid.map((v) => v.reg));
      if (error && error.code !== '42P01') {
        console.error('Vehicle import lookup error:', error);
        return NextResponse.json({ error: 'Failed to read existing vehicles' }, { status: 500 });
      }
      for (const row of (data ?? []) as { registration_number: string }[]) existing.add(row.registration_number);
    }

    let created = 0;
    let updated = 0;
    // Row-by-row upsert keeps per-row error messages precise and avoids the
    // "ON CONFLICT cannot affect row a second time" error from duplicate regs in one batch.
    for (const v of valid) {
      const wasExisting = existing.has(v.reg);
      // Only stamp created_by on genuinely new rows so updates don't clobber it.
      const payload = wasExisting ? v.payload : { ...v.payload, created_by: auth.userId };
      const { error } = await supabase.from('tms_vehicle').upsert(payload, { onConflict: 'registration_number' });
      if (error) {
        results.push({ row: v.idx + 1, registration_number: v.reg, status: 'error', message: error.message });
      } else if (wasExisting) {
        updated++;
        results.push({ row: v.idx + 1, registration_number: v.reg, status: 'updated' });
      } else {
        created++;
        existing.add(v.reg); // duplicate reg rows later in the same file count as updates
        results.push({ row: v.idx + 1, registration_number: v.reg, status: 'created' });
      }
    }

    results.sort((a, b) => a.row - b.row);
    const failed = results.filter((r) => r.status === 'error').length;
    return NextResponse.json({ success: true, created, updated, failed, results });
  } catch (e) {
    console.error('Vehicle import error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => importVehicles(request, auth));
