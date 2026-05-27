import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side logout. The client AuthProvider also calls supabase.auth.signOut()
 * for instant UI feedback; this endpoint guarantees the session cookies are
 * cleared server-side.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
