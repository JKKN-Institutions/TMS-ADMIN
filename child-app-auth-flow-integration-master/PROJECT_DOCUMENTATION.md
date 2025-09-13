# MyJKKN Child App - Project Documentation

## 1. Project Overview

This project is a Next.js 15 child application designed to integrate with a parent application (MyJKKN) for authentication. It implements a complete OAuth 2.0 authorization code flow, where the child app relies on the parent app to authenticate users and manage their sessions.

The key features include:

- **Delegated Authentication**: Users log in through the parent application.
- **Token-Based Sessions**: Uses access tokens and refresh tokens to maintain user sessions.
- **Protected Routes**: Secures pages and components based on authentication status, user roles, and permissions.
- **Automatic Token Refresh**: Seamlessly refreshes expired access tokens without user interruption.
- **Centralized Auth Logic**: A React Context (`AuthProvider`) provides authentication state and functions throughout the application.

## 2. Technologies Used

- **Framework**: Next.js 15 (with App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **HTTP Client**: Axios (for communicating with the parent app)
- **Client-side State**: React Context API
- **Cookie Management**: `js-cookie`

## 3. Project Structure

Here is a breakdown of the key files and their purpose within the project structure:

```
/
|-- app/
|   |-- api/auth/token/route.ts   # API route for exchanging auth code for tokens.
|   |-- auth/callback/page.tsx    # Page to handle the OAuth 2.0 callback from the parent app.
|   |-- dashboard/page.tsx        # A protected dashboard page, only accessible to logged-in users.
|   |-- login/page.tsx            # The login page that initiates the authentication flow.
|   |-- page.tsx                  # The root page, which redirects based on auth state.
|   `-- layout.tsx                # Root layout that wraps the application in the AuthProvider.
|-- components/
|   |-- protected-route.tsx       # Component and hooks for route protection (auth, roles, permissions).
|   `-- ui/                       # UI components (Button, Card, etc.).
|-- lib/
|   |-- auth/
|   |   |-- auth-context.tsx      # React Context for managing and providing auth state.
|   |   `-- parent-auth-service.ts# Service to handle all communication with the parent auth API.
|   `-- utils.ts                  # Utility functions (e.g., `cn` for classnames).
|-- docs/
|   |-- CHILD_APP_IMPLEMENTATION_GUIDE.md # Original implementation guide for the app.
|   `-- parent-app-validation-fix.md    # Documentation for a fix on the parent app's side.
`-- package.json                  # Project dependencies and scripts.
```

## 4. Authentication Flow Deep Dive

The authentication process is a standard OAuth 2.0 Authorization Code flow.

### 1. Login Initiation (`app/login/page.tsx`)

- A user visits the `/login` page.
- The page uses the `useAuth()` hook to get the `login` function.
- When the "Sign in with MyJKKN" button is clicked, it calls `login()`.

### 2. Parent App Authorization (`lib/auth/parent-auth-service.ts`)

- The `login()` function in `ParentAuthService` is invoked.
- It generates and saves a unique `state` parameter to `sessionStorage` for CSRF protection.
- It constructs the authorization URL for the parent app (`/api/auth/child-app/authorize`) with required parameters (`response_type`, `client_id`, `redirect_uri`, `scope`, `state`).
- The user's browser is redirected to this URL. The user then authenticates on the parent application.

### 3. Callback Handling (`app/auth/callback/page.tsx`)

- After successful login on the parent app, the user is redirected back to the child app's `redirect_uri` (`/auth/callback`).
- The redirect URL includes an `authorization_code` and the original `state`.
- The `CallbackContent` component on this page handles the callback.
- It first validates that the `state` from the URL matches the one stored in `sessionStorage`. This is a crucial security step to prevent CSRF attacks.

### 4. Token Exchange (`app/api/auth/token/route.ts`)

- The callback page makes a `POST` request to its own backend API route (`/api/auth/token`).
- This backend route securely communicates with the parent app's token endpoint (`/api/auth/child-app/token`).
- It sends the `authorization_code`, `app_id`, `redirect_uri`, and the `x-api-key` (in the header) to the parent app.
- The parent app validates this information and, if successful, returns an `access_token`, `refresh_token`, and user data.

### 5. Session Initialization and Validation (`lib/auth/auth-context.tsx`)

- The callback page receives the tokens and user data from the token exchange.
- It calls `handleAuthCallback` from the `AuthContext`.
- `handleAuthCallback` uses `parentAuthService.handleCallback` to validate the newly acquired `access_token` with the parent app's `/api/auth/child-app/validate` endpoint.
- Upon successful validation, the service stores:
  - `access_token` and `refresh_token` in secure cookies.
  - User data and session information in `localStorage`.
- The `AuthProvider` updates its state, setting `isAuthenticated` to `true` and populating the `user` object.
- The user is then redirected to the `/dashboard` or a previously intended page.

### 6. Token Refresh (`lib/auth/parent-auth-service.ts`)

- The `AuthProvider` is configured to automatically refresh the token every 10 minutes.
- The `refreshToken` method in `ParentAuthService` is called, which sends the `refresh_token` to the parent app's `/api/auth/child-app/token` endpoint (`grant_type: 'refresh_token'`).
- The parent app returns a new `access_token` (and optionally a new `refresh_token`), which are then updated in the cookies and `localStorage`.
- An Axios interceptor is also configured to automatically attempt a token refresh upon receiving a `401 Unauthorized` response from the API, making data fetching resilient to token expiry.

### 7. Logout (`app/dashboard/page.tsx`)

- The user clicks the "Logout" button, which calls the `logout()` function from `useAuth`.
- `ParentAuthService.logout()` clears all local session data (cookies and `localStorage`).
- It then redirects the user to the parent app's logout endpoint (`/api/auth/child-app/logout`), ensuring the session is terminated on both the child and parent applications.

## 5. Core Components & Services Analysis

### `lib/auth/parent-auth-service.ts`

This is the heart of the authentication logic. It's a singleton class that encapsulates all interactions with the parent application's API.

**Key Responsibilities:**

- **API Client**: Creates an `axios` instance with the base URL of the parent app and automatically includes the API key and bearer token in requests.
- **Login Flow**: Constructs the authorization URL and initiates the redirect to the parent app.
- **Token Management**: Handles validation, refresh, and secure storage of tokens in cookies.
- **Session Management**: Stores and retrieves user and session data from `localStorage`.
- **Authorization**: Provides helper methods like `hasPermission` and `hasRole` to check user access rights based on the stored user data.

**Code Snippet: Token Validation**

```typescript
// lib/auth/parent-auth-service.ts

  async validateToken(token: string): Promise<ValidationResponse> {
    try {
      const requestData = {
        token,
        child_app_id: process.env.NEXT_PUBLIC_APP_ID,
      };

      const response = await this.api.post('/api/auth/child-app/validate', requestData);
      return response.data;
    } catch (error: any) {
      console.error('Token validation error:', error.response?.data || error.message);
      return {
        valid: false,
        error: error.response?.data?.error || 'Validation failed'
      };
    }
  }
```

### `lib/auth/auth-context.tsx`

This file provides the `AuthProvider` component and the `useAuth` hook, which makes authentication state available to the entire application.

**Key Responsibilities:**

- **State Management**: Uses `useState` to manage `user`, `session`, `isLoading`, and `error`.
- **Initialization**: On mount, it checks for existing tokens/session in storage and validates them with the parent app.
- **Auto-Refresh**: Sets up an interval to periodically refresh the access token.
- **Provides Auth Functions**: Exposes `login`, `logout`, `refreshSession`, and other auth-related functions to components via the `useAuth` hook.

**Code Snippet: AuthProvider Initialization**

```typescript
// lib/auth/auth-context.tsx

export function AuthProvider({
  children,
  autoValidate = true,
  // ...other props
}: AuthProviderProps) {
  const [user, setUser] = useState<ParentAppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // ...

  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        const storedUser = parentAuthService.getUser();
        if (storedUser && autoValidate) {
          const isValid = await parentAuthService.validateSession();
          if (isValid) {
            setUser(parentAuthService.getUser());
            setSession(parentAuthService.getSession());
          } else {
            // Clear session if invalid
            setUser(null);
            setSession(null);
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [autoValidate]);

  // ... rest of the provider
}
```

### `components/protected-route.tsx`

This component is a crucial utility for controlling access to different parts of the application. It provides several ways to protect content.

**Key Features:**

- **`ProtectedRoute`**: The core component that checks for authentication, roles, and permissions. It can either redirect or render fallback UI if conditions are not met.
- **`RequireAuth`**: A convenience wrapper around `ProtectedRoute` that simply checks if a user is authenticated and redirects to `/login` if not.
- **`RequirePermission` / `RequireRole`**: Wrappers for checking specific permissions or roles.
- **`GuestOnly`**: A component that ensures its children are only rendered for unauthenticated users (e.g., the login page).

**Code Snippet: `RequireAuth` Usage (from `app/dashboard/page.tsx`)**

```typescript
// app/dashboard/page.tsx

import { RequireAuth } from '@/components/protected-route';
import { useAuth } from '@/lib/auth/auth-context';

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();
  // ... dashboard UI
}
```

## 6. Pages and API Routes

### `app/page.tsx`

The main entry point of the application. It uses the `useAuth` hook to check the authentication state and redirects the user to either `/dashboard` (if authenticated) or `/login` (if not). It displays a loading spinner while the check is in progress.

### `app/login/page.tsx`

This page is wrapped in `<GuestOnly>` from `protected-route.tsx` in a real-world scenario (though not explicitly in the current code, the `useEffect` serves a similar purpose). It presents the "Sign in with MyJKKN" button that starts the OAuth flow.

### `app/auth/callback/page.tsx`

Handles the redirect from the parent application. It extracts the `code` and `state` from the URL, validates the state, and triggers the token exchange process. It shows appropriate loading or error states to the user during this process.

### `app/dashboard/page.tsx`

A sample protected page. It's wrapped in `<RequireAuth>`, ensuring that only authenticated users can access it. It displays user information fetched from the auth context, such as name, email, role, and permissions.

### `app/api/auth/token/route.ts`

This is a Next.js API Route that acts as a secure backend proxy. Its only job is to receive the `authorization_code` from the frontend, securely add the `app_id` and `api_key`, and forward the request to the parent app to exchange the code for tokens. This prevents the `api_key` from ever being exposed to the client's browser.

## 7. Configuration

The application relies on environment variables defined in `.env.local` for its configuration.

```
# MyJKKN Parent App Configuration
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=your_app_id_here
NEXT_PUBLIC_API_KEY=your_api_key_here

# Development redirect URI
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback
```

- `NEXT_PUBLIC_PARENT_APP_URL`: The base URL of the parent authentication server.
- `NEXT_PUBLIC_APP_ID`: The unique identifier for this child application, registered with the parent app.
- `NEXT_PUBLIC_API_KEY`: The secret key for this child application, used for server-to-server communication.
- `NEXT_PUBLIC_REDIRECT_URI`: The callback URL that the parent app will redirect to after authentication. This must be one of the `allowed_redirect_uris` configured in the parent app for this `app_id`.

## 8. Conclusion

This child application provides a robust and secure implementation of an OAuth 2.0 flow with a parent authentication service. The architecture is modular, with clear separation of concerns between the API service, state management (context), and UI components. The use of protected route components and hooks makes it easy to secure various parts of the application with minimal boilerplate.
