# Parent App Validation Endpoint Fix

## Problem
The validation endpoint is returning PGRST116 error because it's using `.single()` on a query that returns no rows.

## Fix for `app/api/auth/child-app/validate/route.ts` in Parent App

Replace the session lookup section with this code:

```typescript
// After decoding the token and finding the child app...

// Generate token hash for comparison
const tokenHash = crypto
  .createHash('sha256')
  .update(token)
  .digest('hex');

console.log('Looking for session with:', {
  user_id: decodedToken.user_id,
  app_id: child_app_id,
  token_hash_preview: tokenHash.substring(0, 10) + '...'
});

// Query the child_app_user_sessions table
const { data: userSession, error: sessionError } = await supabase
  .from('child_app_user_sessions')
  .select('*')
  .eq('user_id', decodedToken.user_id)
  .eq('app_id', child_app_id)
  .maybeSingle(); // Use maybeSingle() instead of single() to avoid PGRST116

if (sessionError) {
  console.error('Session query error:', sessionError);
  return NextResponse.json(
    { 
      valid: false, 
      error: 'Failed to query session',
      details: sessionError.message 
    },
    { status: 500 }
  );
}

if (!userSession) {
  console.log('No session found for user:', decodedToken.user_id, 'and app:', child_app_id);
  return NextResponse.json(
    { valid: false, error: 'No active session found' },
    { status: 401 }
  );
}

console.log('Found user session:', {
  id: userSession.id,
  has_session_data: !!userSession.session_data,
  active_sessions_count: userSession.session_data?.active_sessions?.length || 0
});

// Parse the JSON session data
const sessionData = userSession.session_data || {};
const activeSessions = sessionData.active_sessions || [];

// Find the matching session by token hash
const matchingSession = activeSessions.find((session: any) => {
  return session.token_hash === tokenHash;
});

if (!matchingSession) {
  console.log('No matching session found for token hash');
  console.log('Available session hashes:', activeSessions.map((s: any) => 
    s.token_hash ? s.token_hash.substring(0, 10) + '...' : 'no hash'
  ));
  return NextResponse.json(
    { valid: false, error: 'Session token mismatch' },
    { status: 401 }
  );
}

// Check if session is expired
if (new Date(matchingSession.expires_at) < new Date()) {
  console.log('Session expired at:', matchingSession.expires_at);
  return NextResponse.json(
    { valid: false, error: 'Session expired' },
    { status: 401 }
  );
}

// Update last activity
await supabase
  .from('child_app_user_sessions')
  .update({ 
    last_activity_at: new Date().toISOString(),
    session_data: {
      ...sessionData,
      active_sessions: activeSessions.map((s: any) => 
        s.token_hash === tokenHash 
          ? { ...s, last_used_at: new Date().toISOString() }
          : s
      )
    }
  })
  .eq('id', userSession.id);

// Return success with user data
return NextResponse.json({
  valid: true,
  user: {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone_number: user.phone_number,
    role: user.role,
    institution_id: user.institution_id,
    is_super_admin: user.is_super_admin,
    permissions: userSession.permissions || {},
    profile_completed: user.profile_completed,
    avatar_url: user.avatar_url,
    last_login: user.last_login,
  },
  session: {
    id: userSession.id,
    expires_at: matchingSession.expires_at,
    created_at: matchingSession.created_at,
    last_used_at: matchingSession.last_used_at || userSession.last_activity_at,
  }
});
```

## Key Changes

1. **Use `.maybeSingle()`** instead of `.single()` to avoid PGRST116 error when no rows are found
2. **Add detailed logging** to debug the issue
3. **Properly handle null/undefined cases** for session_data
4. **Update the session's last_used_at** within the JSON structure

## Debug SQL Query

Run this in your Supabase SQL editor to check session data:

```sql
-- Check if sessions exist
SELECT 
  id,
  user_id,
  app_id,
  session_data,
  last_activity_at,
  created_at
FROM child_app_user_sessions
WHERE app_id = 'child_app_mel9u5y7'
ORDER BY created_at DESC;

-- Check session structure
SELECT 
  id,
  user_id,
  app_id,
  jsonb_pretty(session_data) as session_data_formatted
FROM child_app_user_sessions
WHERE app_id = 'child_app_mel9u5y7'
LIMIT 1;
```

## Testing Steps

1. Clear all cookies and local storage in child app
2. Start fresh authentication flow
3. Check parent app logs for detailed debug output
4. Verify the session is created after token exchange
5. Check that validation finds the session correctly