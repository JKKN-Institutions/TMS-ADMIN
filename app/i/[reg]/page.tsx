import { redirect } from 'next/navigation';
import { normalizeReg } from '@/lib/vehicles/sticker-code';

// Printed stickers open https://tms.jkkn.ai/i/<REG>. Hand off to the staff-app
// Bus Inspection list, which resolves the bus and offers Morning / Evening.
export default async function StickerLanding({ params }: { params: Promise<{ reg: string }> }) {
  const { reg } = await params;
  redirect(`/boarding/route-check?reg=${encodeURIComponent(normalizeReg(decodeURIComponentSafe(reg)))}`);
}

function decodeURIComponentSafe(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}
