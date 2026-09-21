import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { normalizeReg, parseStickerScan } from '@/lib/inspections/sticker-code';

async function resolveSticker(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const raw = new URL(request.url).searchParams.get('code') ?? '';
    const code = parseStickerScan(raw);
    if (!code) return NextResponse.json({ error: 'This is not a bus sticker' }, { status: 400 });

    const svc = createServiceRoleClient();
    const { data, error } = await svc.from('tms_vehicle').select('id, registration_number, status');
    if (error) {
      console.error('resolve-sticker error:', error);
      return NextResponse.json({ error: 'Failed to look up bus' }, { status: 500 });
    }
    // Registration numbers are stored with inconsistent spacing; compare normalised.
    const bus = ((data ?? []) as { id: string; registration_number: string; status: string }[])
      .find((v) => normalizeReg(v.registration_number) === code);
    if (!bus) return NextResponse.json({ error: `No bus is registered as ${code}` }, { status: 404 });
    return NextResponse.json({ success: true, data: { vehicleId: bus.id, registration: bus.registration_number, status: bus.status } });
  } catch (e) {
    console.error('resolve-sticker error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => resolveSticker(request, auth));
