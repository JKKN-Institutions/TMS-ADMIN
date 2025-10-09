# Admin App External Authentication Setup Guide

## 🎯 Quick Start

This guide walks you through setting up and testing the new external authentication for the TMS Admin app.

---

## 📋 Prerequisites

1. **Auth Server** running at `https://auth.jkkn.ai`
2. **Admin App** registered with App ID: `tms_admin_portal_mfhsyxnn`
3. **Admin/Staff User** credentials in the auth server database

---

## 🔧 Setup Steps

### 1. **Environment Variables**

Ensure your `.env.local` file has the correct configuration:

```env
# New Centralized Auth Server Configuration
NEXT_PUBLIC_AUTH_SERVER_URL=https://auth.jkkn.ai
NEXT_PUBLIC_APP_ID=tms_admin_portal_mfhsyxnn
API_KEY=app_149a294c473d403d_b33d88b6a6ebb84d

# Redirect URI (update for production)
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3001/auth/callback
# For production: https://tms-admin.jkkn.ac.in/auth/callback

# Optional: Enable debug logging
NEXT_PUBLIC_AUTH_DEBUG=true
```

### 2. **Install Dependencies**

```bash
npm install
```

### 3. **Start Development Server**

```bash
npm run dev
```

The app will be available at: `http://localhost:3001`

---

## 🧪 Testing the Authentication Flow

### Step 1: Access Login Page
1. Open browser: `http://localhost:3001`
2. You should see the admin login page with role selection

### Step 2: Click "Continue with MyJKKN"
1. Click the blue "Continue with MyJKKN" button
2. You should be redirected to: `https://auth.jkkn.ai/authorize?...`

### Step 3: Login at Auth Server
1. Enter your admin/staff credentials
2. Click "Login" or "Allow Access"
3. You should be redirected back to: `http://localhost:3001/auth/callback?code=...&state=...`

### Step 4: Verify Token Exchange
1. Open browser DevTools (F12)
2. Go to Console tab
3. You should see detailed logs:
   ```
   🔄 ═══════════════════════════════════════════════════════
   📍 Admin OAuth Callback Handler Started
   ...
   ✅ Token exchange successful
   👤 User: your-email@example.com
   🎫 Role: super_admin
   ...
   ✅ OAuth Flow Complete! Redirecting... /dashboard
   ```

### Step 5: Verify Dashboard Access
1. You should be redirected to: `http://localhost:3001/dashboard`
2. Verify your user info is displayed in the header
3. Test navigation to different admin pages

### Step 6: Verify Token Storage
1. Open DevTools → Application tab → Local Storage
2. Check for these keys:
   - `tms_admin_access_token`
   - `tms_admin_refresh_token`
   - `tms_admin_user`
   - `tms_admin_session`
   - `tms_admin_token_expires`

3. Go to Application tab → Cookies
4. Check for these cookies:
   - `tms_admin_access_token`
   - `tms_admin_refresh_token`

---

## 🔍 Debugging Tips

### Check Console Logs
Open DevTools Console to see detailed OAuth flow logs:
- Authorization code received
- State validation
- Token exchange request/response
- User details
- Token storage
- Redirect confirmation

### Check Network Tab
Open DevTools Network tab to monitor API calls:
- `POST /api/auth/token` - Should return 200 with access_token
- `POST https://auth.jkkn.ai/api/auth/token` - Token exchange with auth server

### Common Issues

#### Issue 1: "Authorization code not found"
**Symptoms:** Error message on callback page  
**Solution:**
- Verify auth server is correctly configured
- Check redirect URI matches exactly
- Clear browser session storage and try again

#### Issue 2: "Invalid state parameter"
**Symptoms:** CSRF error on callback page  
**Solution:**
- Clear browser session storage
- Ensure you're not opening callback URL directly
- Try the full flow from login page

#### Issue 3: "Access denied"
**Symptoms:** 403 error after token exchange  
**Solution:**
- Verify your user has admin/staff role in auth server
- Check user permissions include admin access
- Contact system administrator to grant proper role

#### Issue 4: "Token exchange failed"
**Symptoms:** Error during callback processing  
**Solution:**
- Check `.env.local` has correct `API_KEY`
- Verify `NEXT_PUBLIC_APP_ID` matches registration
- Check auth server is accessible
- Review API logs for detailed error

#### Issue 5: Redirect loop
**Symptoms:** Keeps redirecting between `/dashboard` and `/login`  
**Solution:**
- Clear all browser data (localStorage + cookies)
- Verify tokens are being stored with `tms_admin_` prefix
- Check callback page is using `window.location.href` for redirect
- Try incognito/private browsing mode

---

## 🎭 Testing Different User Types

### Super Administrator
```
✅ Should have full access to all admin features
✅ Should see all navigation menu items
✅ Should be able to create/edit/delete resources
```

### Staff Member
```
✅ Should have access to admin dashboard
✅ May have limited permissions based on role
✅ Should see relevant menu items for their role
```

### Transport Staff
```
✅ Should have access to transport management features
✅ Should see route, driver, and vehicle management
✅ May not see financial or enrollment features
```

### Faculty
```
✅ Should have basic admin access
✅ May see student and schedule information
✅ Limited write permissions
```

### Regular Student (Non-Admin)
```
❌ Should receive "Access denied" error
❌ Should not be able to access admin dashboard
❌ Should be redirected to login with error message
```

---

## 📊 Monitoring & Logs

### Server Logs (Terminal)
Monitor your terminal running `npm run dev` for:
- Token exchange requests
- Validation requests
- User authentication attempts
- Role validation results
- Error details

### Browser Console Logs
Monitor browser console for:
- OAuth flow progress
- State validation
- Token storage
- User details
- Redirect confirmations
- Any JavaScript errors

### Example Successful Flow Logs
```
🔄 ═══════════════════════════════════════════════════════
📍 Admin OAuth Callback Handler Started
🔄 ═══════════════════════════════════════════════════════
📋 Received OAuth params: { code: '7ca98caa...', state: 'eyJub25j...' }
✅ Enhanced state validation passed: { isChildAppAuth: true, appId: 'tms_admin_portal_mfhsyxnn' }
✅ State validated and cleared
🔄 Exchanging authorization code for tokens...
📥 Token exchange response: 200 OK
✅ Token exchange successful
👤 User: admin@jkkn.ac.in
🎫 Role: super_admin
💾 Storing authentication tokens...
✅ Tokens stored in localStorage and cookies
🔄 Handling authentication callback in context...
✅ Authentication callback handled successfully
🔄 Redirecting to: /dashboard
✅ ═══════════════════════════════════════════════════════
📍 OAuth Flow Complete! Redirecting... /dashboard
✅ ═══════════════════════════════════════════════════════
```

---

## 🚀 Production Deployment

### 1. Update Environment Variables
```env
NEXT_PUBLIC_AUTH_SERVER_URL=https://auth.jkkn.ai
NEXT_PUBLIC_APP_ID=tms_admin_portal_mfhsyxnn
API_KEY=app_149a294c473d403d_b33d88b6a6ebb84d
NEXT_PUBLIC_REDIRECT_URI=https://tms-admin.jkkn.ac.in/auth/callback
NEXT_PUBLIC_AUTH_DEBUG=false  # Disable debug logs in production
```

### 2. Register Production Redirect URI
Ensure `https://tms-admin.jkkn.ac.in/auth/callback` is registered in the auth server's allowed redirect URIs for the admin app.

### 3. Build & Deploy
```bash
npm run build
npm start
```

### 4. Test Production Flow
Follow the same testing steps as development, but use production URLs.

---

## 🔒 Security Considerations

1. **State Parameter:** Always validate state to prevent CSRF attacks
2. **HTTPS Only:** Use HTTPS in production for secure token transmission
3. **Secure Cookies:** Cookies are set with `SameSite=Lax` and `Secure` flag in production
4. **Token Storage:** Tokens stored in both localStorage (for client) and cookies (for SSR)
5. **Token Expiry:** Access tokens expire, refresh tokens used for renewal
6. **Role Validation:** Server-side validation of admin/staff roles

---

## 📞 Support

If you encounter issues:

1. **Check Console Logs** - Detailed OAuth flow logs available
2. **Review Network Tab** - Monitor API calls and responses
3. **Verify Environment** - Ensure all env variables are correct
4. **Clear Browser Data** - Try incognito mode or clear cache
5. **Contact Admin** - Verify your account has proper role/permissions

---

## ✅ Checklist

Before considering authentication setup complete:

- [ ] Environment variables configured correctly
- [ ] Development server starts without errors
- [ ] Login page loads properly
- [ ] "Continue with MyJKKN" button redirects to auth server
- [ ] Can login with admin/staff credentials
- [ ] Redirected back to callback page
- [ ] Console shows successful OAuth flow logs
- [ ] Tokens stored in localStorage (with `tms_admin_` prefix)
- [ ] Tokens stored in cookies
- [ ] Redirected to dashboard
- [ ] User info displayed correctly
- [ ] Can navigate to different admin pages
- [ ] API calls work with authentication
- [ ] Refresh token works (test by waiting or forcing refresh)
- [ ] Logout works properly
- [ ] Non-admin users are denied access

---

## 🎉 Success!

Once all checklist items are complete, your admin authentication is fully functional with the new external auth server!

For more details, see: `ADMIN_EXTERNAL_AUTH_MIGRATION_SUMMARY.md`
