# Child App Deployment Guide

## 🚀 Deploy to Vercel

### Step 1: Prepare for Deployment

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

### Step 2: Deploy the Child App

1. **Navigate to child app directory**:
   ```bash
   cd "d:\JKKN\JKKN Auth Server\child-auth-test"
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

3. **Note your deployment URL** (e.g., `https://child-auth-test.vercel.app`)

### Step 3: Configure Environment Variables in Vercel

After deployment, add these environment variables in Vercel Dashboard:

1. Go to: https://vercel.com/your-username/child-auth-test/settings/environment-variables

2. Add the following variables:

   | Variable Name | Value | Notes |
   |--------------|-------|-------|
   | `NEXT_PUBLIC_AUTH_SERVER_URL` | `https://myjkkn-auth-server.vercel.app` | Your deployed auth server URL |
   | `NEXT_PUBLIC_APP_ID` | `test_child_app_001` | Your registered app ID |
   | `NEXT_PUBLIC_REDIRECT_URI` | `https://your-actual-url.vercel.app/callback` | **REPLACE with your actual Vercel URL** |
   | `API_KEY` | `my_test_app_key_12345` | Your API key |

3. **Redeploy** after adding environment variables:
   ```bash
   vercel --prod
   ```

### Step 4: Update Database with Production URL

Update the allowed redirect URIs in your auth server database to include your production URL:

1. Go to: https://supabase.com/dashboard/project/nhiniwzkarxqyvgglmiy/sql

2. Run this SQL:
   ```sql
   UPDATE applications
   SET allowed_redirect_uris = ARRAY[
     'http://localhost:3001/callback',
     'https://your-actual-url.vercel.app/callback'  -- REPLACE with your actual Vercel URL
   ]
   WHERE app_id = 'test_child_app_001';

   -- Verify
   SELECT app_id, allowed_redirect_uris FROM applications WHERE app_id = 'test_child_app_001';
   ```

### Step 5: Update Auth Server CORS (if needed)

If you get CORS errors in production, update the auth server's `middleware.ts`:

```typescript
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000',
  'https://myjkkn-auth-server.vercel.app',
  'https://your-child-app.vercel.app',  // Add your child app URL
];
```

Then redeploy the auth server.

### Step 6: Test Production Deployment

1. Open your deployed child app URL
2. Click "Login with MyJKKN"
3. Should redirect to auth server
4. Auth server redirects back with code
5. User data is displayed

---

## 🔧 Quick Deployment Commands

```bash
# One-time setup
npm i -g vercel
vercel login

# Deploy
cd "d:\JKKN\JKKN Auth Server\child-auth-test"
vercel --prod

# After deployment, get your URL and update:
# 1. Vercel environment variables
# 2. Database allowed_redirect_uris
# 3. Auth server CORS (if needed)

# Redeploy after env changes
vercel --prod
```

---

## ✅ Checklist

- [ ] Deploy child app to Vercel
- [ ] Note deployment URL
- [ ] Add environment variables in Vercel Dashboard
- [ ] Update database with production redirect URI
- [ ] Update auth server CORS (if needed)
- [ ] Test production OAuth flow
- [ ] Verify user data displays correctly

---

## 📝 Important Notes

1. **Auth Server URL**: Must be your deployed auth server (not localhost)
2. **Redirect URI**: Must exactly match what's in the database
3. **CORS**: Auth server must allow requests from your child app domain
4. **HTTPS**: Production must use HTTPS (Vercel provides this automatically)

---

## 🐛 Troubleshooting

### Error: "Invalid redirect URI"
- Check that Vercel env variable matches database exactly
- Ensure database has your production URL in `allowed_redirect_uris`

### Error: "CORS policy"
- Update auth server `middleware.ts` with your child app URL
- Redeploy auth server

### Error: "Application not found"
- Verify `NEXT_PUBLIC_APP_ID` matches database `app_id`
- Check app is `is_active: true` in database
