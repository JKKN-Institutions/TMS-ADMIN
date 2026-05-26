import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'gone', error_description: 'OAuth authentication has been removed. Use demo login instead.' },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: 'method_not_allowed', error_description: 'Use POST method' },
    { status: 405 }
  );
}
