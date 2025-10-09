import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    const authHeader = req.headers.get('authorization');
    
    const accessToken = token || authHeader?.replace('Bearer ', '');

    if (!accessToken) {
      return NextResponse.json(
        { valid: false, error: 'No token provided' },
        { status: 401 }
      );
    }

    const authServerUrl = process.env.NEXT_PUBLIC_AUTH_SERVER_URL;

    // Validate token with auth server
    const response = await fetch(`${authServerUrl}/api/auth/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ access_token: accessToken })
    });

    if (!response.ok) {
      return NextResponse.json(
        { valid: false, error: 'Token validation failed' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check if user has admin/staff privileges
    const isValidAdmin = 
      data.user?.is_super_admin === true || 
      data.user?.role === 'super_admin' ||
      data.user?.role === 'Super Administrator' ||
      data.user?.role === 'admin' ||
      data.user?.role === 'staff' ||
      data.user?.role === 'transport_staff' ||
      data.user?.role === 'faculty' ||
      (data.user?.permissions && (
        data.user.permissions['admin_access'] || 
        data.user.permissions['transport_access'] ||
        data.user.permissions['staff_access']
      ));
    
    if (!isValidAdmin) {
      return NextResponse.json(
        { valid: false, error: 'Access denied. Only administrators and staff can access this application.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: data.valid,
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Validation failed' },
      { status: 500 }
    );
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'method_not_allowed', error_description: 'Use POST method' },
    { status: 405 }
  );
}

