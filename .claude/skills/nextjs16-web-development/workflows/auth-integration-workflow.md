# Auth Integration Workflow: Supabase Auth Setup

Complete guide for integrating Supabase Auth with SSR, middleware, and role-based access control.

## Overview

This workflow sets up Supabase Auth in your Next.js 16 dashboard with:
- Server-Side Rendering (SSR) support
- Middleware for route protection
- Auth context provider for client components
- Sign-in/sign-up pages
- User dropdown in header
- Role-based access control (RBAC)

**Time Estimate**: 1-2 hours

---

## Prerequisites

- ✅ Next.js 16 project initialized
- ✅ Supabase project created
- ✅ Dashboard layout set up (AppSidebar, Header)

---

## Step 1: Environment Configuration

### 1.1 Get Supabase Credentials

From Supabase Dashboard → Settings → API:
- Project URL
- Anon/Public Key

### 1.2 Create Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: Service role key for admin operations
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Security**: Never commit `.env.local` to git. Add to `.gitignore`:

```gitignore
.env.local
.env*.local
```

---

## Step 2: Install Dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
```

---

## Step 3: Create Supabase Clients

### 3.1 Server Client (SSR Support)

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

### 3.2 Client Component Client

Create `lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClientSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Reference**: Backend Module `database-layer.md`

---

## Step 4: Create Auth Utilities

### 4.1 User Helper Functions

Create `lib/auth.ts`:

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cache } from 'react'

// Cached user fetching (de-duplicates requests)
export const getCurrentUser = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
})

// Require authentication
export async function requireAuth() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/sign-in')
  }

  return user
}

// Require specific role
export async function requireRole(allowedRoles: string[]) {
  const user = await requireAuth()
  const supabase = await createServerSupabaseClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect('/unauthorized')
  }

  return { user, role: profile.role }
}

// Get user with profile
export async function getUserWithProfile() {
  const user = await getCurrentUser()

  if (!user) return null

  const supabase = await createServerSupabaseClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return { user, profile }
}
```

**Note**: Uses React `cache()` to de-duplicate user requests across components.

---

## Step 5: Create Profiles Table

### 5.1 Database Schema

```sql
-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger: Create profile on user signup
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_on_signup();

-- Index for performance
CREATE INDEX idx_profiles_role ON profiles(role);
```

---

## Step 6: Middleware for Route Protection

### 6.1 Create Middleware

Create `middleware.ts` in project root:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard')
  const isAuthRoute = ['/sign-in', '/sign-up'].includes(request.nextUrl.pathname)

  if (isProtectedRoute && !user) {
    // Redirect to sign-in if accessing protected route without auth
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthRoute && user) {
    // Redirect to dashboard if accessing auth pages while logged in
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Reference**: Supabase Auth Patterns documentation

---

## Step 7: Auth Context Provider

### 7.1 Create Auth Context

Create `contexts/auth-context.tsx`:

```typescript
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClientSupabaseClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

### 7.2 Add Provider to Layout

Update `app/layout.tsx`:

```tsx
import { AuthProvider } from '@/contexts/auth-context'
import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

---

## Step 8: Auth Pages

### 8.1 Sign In Page

Create `app/(auth)/sign-in/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { FormInput } from '@/components/forms/form-input'

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = createClientSupabaseClient()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(redirect)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <h2 className="text-3xl font-bold text-center">Sign In</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-6">
          <FormInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <FormInput
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center">
          Don't have an account?{' '}
          <a href="/sign-up" className="text-blue-600 hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  )
}
```

### 8.2 Sign Up Page

Create `app/(auth)/sign-up/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { FormInput } from '@/components/forms/form-input'

export default function SignUpPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = createClientSupabaseClient()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <h2 className="text-3xl font-bold text-center">Sign Up</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-6">
          <FormInput
            label="Full Name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

          <FormInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <FormInput
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="text-center">
          Already have an account?{' '}
          <a href="/sign-in" className="text-blue-600 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
```

---

## Step 9: User Dropdown in Header

### 9.1 Create User Dropdown Component

Create `components/header/user-dropdown.tsx`:

```tsx
'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function UserDropdown() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  if (!user) return null

  const handleSignOut = async () => {
    await signOut()
    router.push('/sign-in')
  }

  const initials = user.email
    ?.split('@')[0]
    .slice(0, 2)
    .toUpperCase() || 'U'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2">
          <Avatar>
            <AvatarImage src={user.user_metadata?.avatar_url} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium">{user.user_metadata?.full_name}</span>
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### 9.2 Add to Header Component

Update `components/layout/header.tsx`:

```tsx
import { UserDropdown } from '@/components/header/user-dropdown'
import { ThemeToggle } from '@/components/theme-toggle'

export function Header() {
  return (
    <header className="border-b">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Breadcrumbs */}
        <div className="flex-1">
          {/* ... breadcrumbs */}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <input type="search" placeholder="Search..." />

          {/* Theme toggle */}
          <ThemeToggle />

          {/* User dropdown */}
          <UserDropdown />
        </div>
      </div>
    </header>
  )
}
```

---

## Step 10: Role-Based Access Control (RBAC)

### 10.1 Protect Routes by Role

Create `app/(dashboard)/dashboard/admin/page.tsx`:

```tsx
import { requireRole } from '@/lib/auth'

export default async function AdminPage() {
  // Only admins can access this page
  await requireRole(['admin'])

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <p>Only administrators can see this page.</p>
    </div>
  )
}
```

### 10.2 Filter Navigation by Role

Update `config/nav-config.ts`:

```typescript
export const navConfig = {
  mainNav: [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: 'LayoutDashboard',
    },
    {
      title: 'Products',
      href: '/dashboard/products',
      icon: 'Package',
    },
    {
      title: 'Admin',
      href: '/dashboard/admin',
      icon: 'Shield',
      roles: ['admin'], // Only show to admins
    },
  ],
}
```

Create `hooks/use-filtered-nav.ts`:

```typescript
'use client'

import { useAuth } from '@/contexts/auth-context'
import { navConfig } from '@/config/nav-config'
import { useEffect, useState } from 'react'
import { createClientSupabaseClient } from '@/lib/supabase/client'

export function useFilteredNav() {
  const { user } = useAuth()
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    const supabase = createClientSupabaseClient()

    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setUserRole(data?.role || null))
  }, [user])

  const filteredNav = navConfig.mainNav.filter((item) => {
    if (!item.roles) return true
    return userRole && item.roles.includes(userRole)
  })

  return filteredNav
}
```

**Reference**: Frontend Module `rbac-navigation.md`

---

## Step 11: Testing

### 11.1 Test Authentication Flow
1. Go to `/sign-up` → Create account
2. Check email for confirmation (if email confirmation enabled)
3. Sign in at `/sign-in`
4. Verify redirect to `/dashboard`
5. Click user dropdown → Sign out
6. Verify redirect to `/sign-in`

### 11.2 Test Route Protection
1. Sign out
2. Try to access `/dashboard` directly
3. Verify redirect to `/sign-in?redirect=/dashboard`
4. Sign in → Verify redirect back to `/dashboard`

### 11.3 Test RBAC
1. Create user with `user` role
2. Verify "Admin" nav item is hidden
3. Update user to `admin` role in database
4. Verify "Admin" nav item appears
5. Access `/dashboard/admin` → Verify access granted

---

## Automation: Setup Script

Instead of manual setup, run:

```bash
bash scripts/setup_auth.sh

# This will:
# - Create Supabase clients (server.ts, client.ts)
# - Create auth utilities (auth.ts)
# - Create middleware.ts
# - Create auth context (auth-context.tsx)
# - Create auth pages (sign-in, sign-up)
# - Create user dropdown component
# - Set up profiles table schema
# - Configure environment variables template
```

---

## Common Issues

### "Session not persisting after sign-in"
**Cause**: Middleware not refreshing session
**Solution**: Verify middleware.ts is calling `supabase.auth.getUser()`

### "Infinite redirect loop"
**Cause**: Middleware redirecting auth pages when user is logged in
**Solution**: Add auth routes to exclusion list in middleware

### "User dropdown not showing user data"
**Cause**: Auth context not initialized
**Solution**: Verify AuthProvider wraps the app in layout.tsx

### "RLS policies blocking access"
**Cause**: Policies too restrictive
**Solution**: Test policies with `auth.uid()` in SQL queries

---

## Next Steps

After auth integration:
1. **Add OAuth Providers** → Google, GitHub, etc.
2. **Email Verification** → Enable in Supabase settings
3. **Password Reset** → Create forgot-password flow
4. **Multi-Factor Auth** → Enable MFA in Supabase
5. **Session Management** → Configure session duration

---

**Version**: 3.0.0
**Updated**: January 2026
