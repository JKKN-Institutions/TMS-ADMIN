# Admin Authentication Scope Fix

## 🐛 Issue Identified
The auth server returned an error:
```
error=invalid_scope
error_description=Invalid scopes: openid, email
```

From: https://tmsadmin.jkkn.ai/auth/callback?error=invalid_scope&error_description=Invalid+scopes%3A+openid%2C+email

## ✅ Root Cause
The admin app was requesting OAuth scopes that the auth server doesn't support:
- ❌ `openid profile email` (Standard OpenID Connect scopes)
- ✅ `read write profile` (Auth server's custom scopes)

## 🔧 Fix Applied

### File: `lib/auth/parent-auth-service.ts`

**Before:**
```typescript
authUrl.searchParams.append('scope', 'openid profile email');  // ❌ INCORRECT
```

**After:**
```typescript
authUrl.searchParams.append('scope', 'read write profile');  // ✅ CORRECT
```

## 📋 Supported Scopes

The auth server at `https://auth.jkkn.ai` supports these scopes:

| Scope | Description |
|-------|-------------|
| `read` | Read access to user data |
| `write` | Write access to user data |
| `profile` | Access to user profile information |

**Combined:** `read write profile`

## 🧪 How to Test

1. **The fix is already applied** - just refresh your browser

2. **Clear any error state**:
   - Open DevTools (F12)
   - Clear localStorage and cookies
   - Close and reopen the tab

3. **Test the login flow**:
   - Go to `http://tmsadmin.jkkn.ai`
   - Click "Continue with MyJKKN"
   - You should now successfully reach the auth server login page
   - No more "invalid_scope" error!

4. **Expected URL**:
   ```
   https://auth.jkkn.ai/api/auth/authorize?
     response_type=code&
     client_id=tms_admin_portal_mfhsyxnn&
     redirect_uri=http://tmsadmin.jkkn.ai/auth/callback&
     scope=read+write+profile&  ← CORRECT SCOPES
     state=...
   ```

## ✅ Status
- [x] Scope corrected in parent-auth-service.ts
- [x] Documentation updated
- [ ] **Next:** Test login flow again

## 🎯 Expected Behavior After Fix

1. Click "Continue with MyJKKN" → Redirects to auth server
2. **No scope error** → Shows login form
3. Login with credentials → Auth server processes login
4. Redirect back with code → Token exchange
5. Redirect to dashboard → User logged in

## 📝 Complete OAuth Flow (After Both Fixes)

### Correct Authorization URL:
```
https://auth.jkkn.ai/api/auth/authorize
  ?response_type=code
  &client_id=tms_admin_portal_mfhsyxnn
  &redirect_uri=http://tmsadmin.jkkn.ai/auth/callback
  &scope=read+write+profile
  &state=<encoded_state>
```

### Key Differences from Standard OAuth:
- ✅ Endpoint: `/api/auth/authorize` (not `/authorize`)
- ✅ Scopes: `read write profile` (not `openid profile email`)
- ✅ Uses custom auth server at `auth.jkkn.ai`

## 🔍 Comparison

| Configuration | Standard OpenID Connect | JKKN Auth Server |
|--------------|------------------------|------------------|
| **Scopes** | `openid profile email` | `read write profile` |
| **Protocol** | OAuth 2.0 + OpenID | OAuth 2.0 (custom) |
| **ID Token** | Yes | No (uses access token) |
| **User Info Endpoint** | `/userinfo` | `/api/auth/validate` |

## 📚 Reference
This matches the child auth test app implementation:
- File: `child-auth-test-master(new)/app/page.tsx`
- Line 33: `const scope = 'read write profile';`

## 🚀 Ready to Test!

The scope issue is now fixed. Try logging in again:
1. Go to `http://tmsadmin.jkkn.ai`
2. Click "Continue with MyJKKN"
3. Should now show login form (no scope error)
4. Complete login and verify authentication works

Good luck! 🎉
