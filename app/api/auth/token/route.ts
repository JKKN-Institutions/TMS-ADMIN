import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  console.log('\n🔄 ═══════════════════════════════════════════════════════');
  console.log('📍 TMS-ADMIN: Token Exchange Request');
  console.log('🔄 ═══════════════════════════════════════════════════════');

  try {
    const { code } = await req.json();

    console.log('📋 Received authorization code:', code?.substring(0, 8) + '...');

    if (!code) {
      console.log('❌ No authorization code provided');
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Authorization code is required' },
        { status: 400 }
      );
    }

    const authServerUrl = process.env.NEXT_PUBLIC_AUTH_SERVER_URL;
    const appId = process.env.NEXT_PUBLIC_APP_ID;
    const apiKey = process.env.API_KEY;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

    console.log('🔍 Environment configuration:');
    console.log('  - Auth Server URL:', authServerUrl);
    console.log('  - App ID:', appId);
    console.log('  - Redirect URI:', redirectUri);
    console.log('  - API Key:', apiKey ? '***' + apiKey.substring(apiKey.length - 4) : 'NOT SET');

    // Validate environment variables
    if (!authServerUrl || !appId || !apiKey || !redirectUri) {
      console.error('Missing environment variables:', {
        authServerUrl: !!authServerUrl,
        appId: !!appId,
        apiKey: !!apiKey,
        redirectUri: !!redirectUri
      });
      return NextResponse.json(
        { error: 'server_error', error_description: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Exchange code for tokens
    console.log('\n🔄 Sending token exchange request to auth server...');
    
    const requestBody = {
      grant_type: 'authorization_code',
      code,
      app_id: appId,
      api_key: apiKey,
      redirect_uri: redirectUri
    };
    
    console.log('📤 Request Details:');
    console.log('  - Endpoint:', `${authServerUrl}/api/auth/token`);
    console.log('  - Method: POST');
    console.log('  - Headers:', { 'Content-Type': 'application/json' });
    console.log('  - Body:', {
      grant_type: requestBody.grant_type,
      code: code.substring(0, 10) + '...' + code.substring(code.length - 6),
      app_id: requestBody.app_id,
      api_key: '***' + apiKey.substring(apiKey.length - 8),
      redirect_uri: requestBody.redirect_uri
    });
    console.log('  - Full Authorization Code:', code);

    const response = await fetch(`${authServerUrl}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    console.log('\n📥 Response Details:');
    console.log('  - Status:', response.status, response.statusText);
    console.log('  - Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.log('  - Raw Response Body:', errorText);
      
      let error;
      try {
        error = JSON.parse(errorText);
      } catch (e) {
        error = { error: 'parse_error', error_description: errorText };
      }
      
      console.log('\n❌ ═══════════════════════════════════════════════════════');
      console.log('💥 TOKEN EXCHANGE FAILED');
      console.log('❌ ═══════════════════════════════════════════════════════');
      console.error('Error Object:', JSON.stringify(error, null, 2));
      console.log('\n🔍 DIAGNOSIS:');
      console.log('  The auth server returned an error. This typically means:');
      console.log('  1. ❌ User not found: The email used to login is not registered in auth.jkkn.ai');
      console.log('  2. ❌ Invalid code: The authorization code expired or was already used');
      console.log('  3. ❌ Mismatched redirect_uri: The redirect URI doesn\'t match what was registered');
      console.log('  4. ❌ Invalid credentials: The app_id or api_key is incorrect');
      console.log('\n📋 Current Configuration:');
      console.log('  - Auth Server:', authServerUrl);
      console.log('  - App ID:', appId);
      console.log('  - Redirect URI:', redirectUri);
      console.log('  - Error:', error.error);
      console.log('  - Description:', error.error_description);
      console.log('═══════════════════════════════════════════════════════\n');
      
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    console.log('✅ Token exchange successful!');
    console.log('👤 User:', data.user?.email);
    console.log('🎫 Role:', data.user?.role);
    console.log('🔑 Is Super Admin:', data.user?.is_super_admin);
    console.log('📋 Full User Object:', JSON.stringify(data.user, null, 2));
    console.log('⏱️  Expires In:', data.expires_in + 's');

    // Check if we have a valid user object
    if (!data.user || !data.user.email) {
      console.log('❌ No user data returned from auth server');
      return NextResponse.json(
        { error: 'user_not_found', error_description: 'User not found. Please ensure your account exists in the system.' },
        { status: 404 }
      );
    }

    // Check if user has admin/staff privileges (VERY PERMISSIVE)
    const isValidAdmin = 
      data.user?.is_super_admin === true || 
      data.user?.is_superadmin === true ||
      data.user?.isSuperAdmin === true ||
      String(data.user?.role).toLowerCase().includes('admin') ||
      String(data.user?.role).toLowerCase().includes('staff') ||
      String(data.user?.role).toLowerCase().includes('faculty') ||
      String(data.user?.role).toLowerCase().includes('teacher') ||
      String(data.user?.role).toLowerCase().includes('transport') ||
      String(data.user?.role).toLowerCase().includes('manager') ||
      (data.user?.permissions && Object.keys(data.user.permissions).length > 0);
    
    if (!isValidAdmin) {
      console.log('❌ Access denied for user:', {
        email: data.user?.email,
        role: data.user?.role,
        is_super_admin: data.user?.is_super_admin,
        permissions: data.user?.permissions,
        fullUser: data.user
      });
      return NextResponse.json(
        { 
          error: 'access_denied', 
          error_description: `Access denied. Only administrators and staff can access this application. Your role: ${data.user?.role}` 
        },
        { status: 403 }
      );
    }

    console.log('✅ Admin access granted for:', data.user?.email);
    console.log('✅ Role accepted:', data.user?.role);
    console.log('\n✅ ═══════════════════════════════════════════════════════');
    console.log('📍 TMS-ADMIN: Authentication Complete');
    console.log('✅ ═══════════════════════════════════════════════════════\n');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: error instanceof Error ? error.message : 'Token exchange failed'
      },
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
