# Admin Authentication Endpoint Fix

## 🐛 Issue Identified
The admin app was getting a 404 error when trying to authenticate:
```
https://auth.jkkn.ai/authorize?... 
404 This page could not be found.
```

## ✅ Root Cause
The authorization endpoint was incorrectly set to `/authorize` instead of `/api/auth/authorize`.

## 🔧 Fix Applied

### File: `lib/auth/parent-auth-service.ts`

**Before:**
```typescript
const authUrl = new URL(
  '/authorize',  // ❌ INCORRECT
  process.env.NEXT_PUBLIC_AUTH_SERVER_URL || 'https://auth.jkkn.ai'
);
```

**After:**
```typescript
const authUrl = new URL(
  '/api/auth/authorize',  // ✅ CORRECT
  process.env.NEXT_PUBLIC_AUTH_SERVER_URL || 'https://auth.jkkn.ai'
);
```

### File: `.env.local`
Also reset redirect URI to localhost for development:
```env
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3001/auth/callback
```

## 🧪 How to Test

1. **Restart your development server** (important for env changes):
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

2. **Clear browser cache and cookies**:
   - Open DevTools (F12)
   - Go to Application tab
   - Clear all localStorage and cookies for localhost:3001

3. **Test the login flow**:
   - Go to `http://localhost:3001`
   - Click "Continue with MyJKKN"
   - You should now be redirected to: `https://auth.jkkn.ai/api/auth/authorize?...`
   - ✅ No more 404 error!

4. **Verify in console**:
   You should see logs like:
   ```
   🔍 Admin Auth Server Login URL: https://auth.jkkn.ai/api/auth/authorize?response_type=code&client_id=tms_admin_portal_mfhsyxnn&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fcallback&scope=openid+profile+email&state=...
   ```

## 📝 Correct Endpoint Structure

The auth server at `https://auth.jkkn.ai` uses these endpoints:

| Endpoint | Path | Purpose |
|----------|------|---------|
| **Authorization** | `/api/auth/authorize` | Initiate OAuth flow |
| **Token Exchange** | `/api/auth/token` | Exchange code for tokens |
| **Token Validation** | `/api/auth/validate` | Validate access tokens |
| **Token Refresh** | `/api/auth/refresh` | Refresh expired tokens |

## ✅ Status
- [x] Endpoint corrected in parent-auth-service.ts
- [x] Redirect URI reset to localhost for development
- [x] Documentation updated
- [ ] **Next:** Restart dev server and test

## 🎯 Expected Behavior After Fix

1. Click "Continue with MyJKKN" → Redirects to auth server (no 404)
2. Login at auth server → Redirects back to callback
3. Token exchange → Success
4. Redirect to dashboard → User logged in

## 🚨 Important Reminder
**Always restart the dev server after changing `.env.local` files!**

```bash
# Stop server (Ctrl+C in terminal)
# Then restart:
npm run dev
```
