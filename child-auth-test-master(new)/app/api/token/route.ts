import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  console.log('\n🔄 ═══════════════════════════════════════════════════════');
  console.log('📍 CHILD APP: Token Exchange Request');
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
    console.log('📤 Request:', {
      endpoint: `${authServerUrl}/api/auth/token`,
      grant_type: 'authorization_code',
      app_id: appId,
      code: code.substring(0, 8) + '...',
      redirect_uri: redirectUri
    });

    const response = await fetch(`${authServerUrl}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        app_id: appId,
        api_key: apiKey,
        redirect_uri: redirectUri
      })
    });

    console.log('📥 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const error = await response.json();
      console.log('❌ Token exchange failed!');
      console.error('💥 Error details:', error);
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    console.log('✅ Token exchange successful!');
    console.log('👤 User:', data.user?.email);
    console.log('🎫 Token Type:', data.token_type);
    console.log('⏱️  Expires In:', data.expires_in + 's');
    console.log('📋 Scope:', data.scope);
    console.log('\n✅ ═══════════════════════════════════════════════════════');
    console.log('📍 CHILD APP: Authentication Complete');
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
