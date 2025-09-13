# Parent App Authentication Setup

This document explains how to set up parent app authentication for the TMS Admin application using MyJKKN as the authentication provider.

## Overview

The TMS Admin application now supports two authentication methods:
1. **Local Admin Authentication** - Traditional email/password login for admin roles
2. **MyJKKN Authentication** - OAuth-based authentication through the parent MyJKKN application

## Features

- **Dual Authentication Support**: Users can choose between local admin login or MyJKKN authentication
- **Role-Based Access Control**: Only users with "Super Administrator" role in MyJKKN can access the admin app
- **Seamless Integration**: Uses the same authentication flow as other child applications
- **Session Management**: Automatic token refresh and session validation
- **Secure Logout**: Proper cleanup of both local and parent app sessions

## Environment Variables

Add the following environment variables to your `.env.local` file:

```env
# Parent App Authentication Configuration
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=tms-admin
NEXT_PUBLIC_API_KEY=your_api_key_here
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3001/auth/callback
```

### Variable Descriptions

- `NEXT_PUBLIC_PARENT_APP_URL`: The URL of the MyJKKN parent application
- `NEXT_PUBLIC_APP_ID`: Unique identifier for this admin application (must be registered in parent app)
- `NEXT_PUBLIC_API_KEY`: API key provided by the parent application for authentication
- `NEXT_PUBLIC_REDIRECT_URI`: Callback URL where users are redirected after authentication

## Setup Steps

### 1. Register the Admin App in Parent Application

Contact the MyJKKN system administrator to register this admin application with:
- App ID: `tms-admin`
- App Name: `TMS Admin Portal`
- Redirect URI: `http://localhost:3001/auth/callback` (development) or your production URL
- Required Permissions: Super Administrator access only

### 2. Obtain API Credentials

Get the following from the parent app administrator:
- API Key for authentication requests
- Confirmation that the app ID is registered
- Verification of redirect URI whitelist

### 3. Update Environment Variables

Replace `your_api_key_here` in `.env.local` with the actual API key provided.

### 4. Test Authentication Flow

1. Start the development server: `npm run dev`
2. Navigate to the login page
3. Click "Continue with MyJKKN" button
4. Complete authentication in the parent app
5. Verify redirect back to admin dashboard

## Authentication Flow

### MyJKKN Authentication Process

1. **Initiation**: User clicks "Continue with MyJKKN" button
2. **Redirect**: User is redirected to MyJKKN consent page
3. **Authorization**: User grants permission (if not already granted)
4. **Callback**: MyJKKN redirects back with authorization code
5. **Token Exchange**: Admin app exchanges code for access token
6. **Validation**: Token is validated and user role is checked
7. **Access Control**: Only Super Administrators are granted access
8. **Session Creation**: User session is established in admin app

### Role Validation

The system enforces strict role-based access control:
- Only users with `is_super_admin: true` OR `role: "Super Administrator"` can access the admin app
- Role validation occurs during both initial login and token refresh
- Invalid roles result in access denied error

## File Structure

```
lib/auth/
├── parent-auth-service.ts    # Core authentication service
└── auth-context.tsx          # React context for auth state

app/
├── api/auth/token/route.ts   # Token exchange endpoint
├── auth/callback/page.tsx    # OAuth callback handler
├── login/page.tsx            # Updated login page with MyJKKN option
└── layout.tsx                # Root layout with AuthProvider

app/(admin)/
└── layout.tsx                # Admin layout with dual auth support
```

## Security Considerations

- **CSRF Protection**: State parameter validation prevents CSRF attacks
- **Token Security**: Tokens stored in secure HTTP-only cookies
- **Role Enforcement**: Multiple layers of role validation
- **Session Isolation**: Parent and child app sessions are properly isolated
- **Secure Logout**: Complete cleanup of all authentication data

## Troubleshooting

### Common Issues

1. **"Access denied" error**: User doesn't have Super Administrator role in MyJKKN
2. **"Invalid state parameter" error**: CSRF protection triggered, try logging in again
3. **"Token exchange failed" error**: Check API key and app registration
4. **Redirect loop**: Verify redirect URI matches exactly in parent app settings

### Debug Information

Enable debug logging by checking browser console for:
- Authentication flow logs prefixed with `🔍`
- Token validation responses
- User role information
- Session state changes

### Support

For issues with parent app authentication:
1. Verify environment variables are correct
2. Check browser console for error messages
3. Confirm app registration with MyJKKN administrator
4. Test with a known Super Administrator account

## Fallback Authentication

The system maintains backward compatibility with local admin authentication:
- Existing admin credentials continue to work
- Local and parent app authentication can be used simultaneously
- No migration required for existing admin users

## Production Deployment

For production deployment:
1. Update `NEXT_PUBLIC_REDIRECT_URI` to production URL
2. Register production redirect URI with parent app
3. Use production API keys
4. Ensure HTTPS is enabled for secure cookie handling
