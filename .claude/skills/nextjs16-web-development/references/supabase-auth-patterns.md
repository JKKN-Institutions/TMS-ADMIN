# Supabase Auth Patterns Reference

Comprehensive guide to Supabase authentication patterns in Next.js 16.

## Table of Contents

1. [SSR Authentication Setup](#ssr-authentication-setup)
2. [Route Protection Patterns](#route-protection-patterns)
3. [Row Level Security (RLS)](#row-level-security-rls)
4. [Session Management](#session-management)
5. [OAuth Integration](#oauth-integration)
6. [Role-Based Access Control](#role-based-access-control)
7. [Security Best Practices](#security-best-practices)

## SSR Authentication Setup

### Client Utilities

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### Server Utilities

```ts
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options)
          } catch (error) {
            // Handle cookie setting errors
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options)
          } catch (error) {
            // Handle cookie removal errors
          }
        },
      },
    }
  )
}
```

### Middleware Pattern

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh session
  await supabase.auth.getUser()

  return response
}
```

## Route Protection Patterns

### Pattern 1: Middleware Protection

**Use when**: You want to protect entire route segments

```ts
// middleware.ts
const protectedRoutes = ['/dashboard', '/admin', '/settings']
const authRoutes = ['/auth/sign-in', '/auth/sign-up']

export async function middleware(request: NextRequest) {
  const { data: { user } } = await supabase.auth.getUser()

  const isProtectedRoute = protectedRoutes.some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/auth/sign-in', request.url)
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  const isAuthRoute = authRoutes.some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}
```

### Pattern 2: Server Component Protection

**Use when**: You want page-level protection with data fetching

```tsx
// app/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/sign-in')
  }

  // Fetch user-specific data
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', user.id)

  return <DashboardContent user={user} products={products} />
}
```

### Pattern 3: Client Component Protection

**Use when**: You need client-side route protection

```tsx
'use client'

import { useAuth } from '@/templates/auth/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function ProtectedPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/sign-in')
    }
  }, [user, loading, router])

  if (loading) return <LoadingSkeleton />
  if (!user) return null

  return <PageContent />
}
```

### Pattern 4: Server Action Protection

**Use when**: Protecting mutations and data updates

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: formData.get('full_name'),
    })
    .eq('id', user.id)

  if (error) return { error: error.message }

  updateTag('profiles')
  revalidatePath('/dashboard/profile')
  return { success: true }
}
```

## Row Level Security (RLS)

### Pattern 1: User-Owned Resources

**Use when**: Each row belongs to a specific user

```sql
-- Enable RLS
alter table products enable row level security;

-- Users can only see their own products
create policy "Users can view own products"
  on products
  for select
  using (auth.uid() = user_id);

-- Users can only insert products for themselves
create policy "Users can create own products"
  on products
  for insert
  with check (auth.uid() = user_id);

-- Users can only update their own products
create policy "Users can update own products"
  on products
  for update
  using (auth.uid() = user_id);

-- Users can only delete their own products
create policy "Users can delete own products"
  on products
  for delete
  using (auth.uid() = user_id);
```

### Pattern 2: Role-Based Access

**Use when**: Different users have different permissions

```sql
-- Create custom claims function
create or replace function auth.user_role()
returns text
language sql stable
as $$
  select coalesce(
    (
      select raw_user_meta_data->>'role'
      from auth.users
      where id = auth.uid()
    ),
    'user'
  );
$$;

-- Admin can see all products
create policy "Admins can view all products"
  on products
  for select
  using (auth.user_role() = 'admin');

-- Managers can see team products
create policy "Managers can view team products"
  on products
  for select
  using (
    auth.user_role() = 'manager'
    and team_id in (
      select team_id from team_members
      where user_id = auth.uid()
    )
  );
```

### Pattern 3: Public + Private Resources

**Use when**: Some resources are public, some are private

```sql
-- Anyone can view published products
create policy "Anyone can view published products"
  on products
  for select
  using (status = 'published');

-- Authenticated users can view all products
create policy "Authenticated users can view all products"
  on products
  for select
  using (auth.uid() is not null);

-- Owners can update their products
create policy "Owners can update products"
  on products
  for update
  using (auth.uid() = user_id);
```

### Pattern 4: Team/Organization Access

**Use when**: Users belong to teams/organizations

```sql
-- Create team membership check function
create or replace function is_team_member(team_uuid uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1
    from team_members
    where team_id = team_uuid
    and user_id = auth.uid()
  );
$$;

-- Team members can view team products
create policy "Team members can view team products"
  on products
  for select
  using (is_team_member(team_id));

-- Team admins can manage team products
create or replace function is_team_admin(team_uuid uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1
    from team_members
    where team_id = team_uuid
    and user_id = auth.uid()
    and role = 'admin'
  );
$$;

create policy "Team admins can update team products"
  on products
  for update
  using (is_team_admin(team_id));
```

## Session Management

### Pattern 1: Auth State Listener

**Use when**: You need to sync auth state across components

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    // Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  return { user, loading }
}
```

### Pattern 2: Session Refresh

**Use when**: You need to refresh expired sessions

```ts
// lib/supabase/refresh.ts
import { createClient } from '@/lib/supabase/server'

export async function refreshSession() {
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.refreshSession()

  if (error) {
    console.error('Session refresh error:', error)
    return null
  }

  return session
}
```

### Pattern 3: Remember Me

**Use when**: You want persistent sessions

```tsx
// Sign in with remember me
const { error } = await supabase.auth.signInWithPassword({
  email,
  password,
  options: {
    // Session will persist until explicitly signed out
    persistSession: true,
  },
})
```

## OAuth Integration

### Pattern 1: Google OAuth

```tsx
'use client'

export async function signInWithGoogle() {
  const supabase = createClient()

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) throw error
}
```

### Pattern 2: GitHub OAuth

```tsx
export async function signInWithGitHub() {
  const supabase = createClient()

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: 'read:user user:email',
    },
  })

  if (error) throw error
}
```

### Pattern 3: OAuth Callback Handler

```ts
// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(`${origin}/auth/error`)
    }
  }

  return NextResponse.redirect(`${origin}${redirect}`)
}
```

## Role-Based Access Control

### Pattern 1: Permission Check Function

```ts
// lib/auth/permissions.ts
export type Permission =
  | 'read:products'
  | 'write:products'
  | 'delete:products'
  | 'admin'

export async function hasPermission(
  permission: Permission
): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('permissions')
    .eq('id', user.id)
    .single()

  return profile?.permissions?.includes(permission) ?? false
}
```

### Pattern 2: Permission Hook

```tsx
'use client'

import { useAuth } from '@/templates/auth/auth-context'
import { useEffect, useState } from 'react'

export function usePermissions() {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<string[]>([])

  useEffect(() => {
    if (!user) return

    const fetchPermissions = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('permissions')
        .eq('id', user.id)
        .single()

      setPermissions(data?.permissions || [])
    }

    fetchPermissions()
  }, [user])

  const hasPermission = (permission: string) => {
    return permissions.includes(permission)
  }

  return { permissions, hasPermission }
}
```

### Pattern 3: Protected Component

```tsx
'use client'

import { usePermissions } from '@/lib/auth/permissions'

interface ProtectedProps {
  permission: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function Protected({ permission, children, fallback }: ProtectedProps) {
  const { hasPermission } = usePermissions()

  if (!hasPermission(permission)) {
    return fallback || null
  }

  return <>{children}</>
}
```

## Security Best Practices

### 1. Never Expose Service Role Key

```env
# ❌ NEVER use in client code
SUPABASE_SERVICE_ROLE_KEY=xxx

# ✅ Only use anon key in client
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### 2. Always Use RLS

```sql
-- ❌ Without RLS
create table products (...);

-- ✅ With RLS
create table products (...);
alter table products enable row level security;

create policy "Secure access"
  on products
  for all
  using (auth.uid() = user_id);
```

### 3. Validate on Server

```ts
// ❌ Client-side only validation
'use client'
export function updateProduct(data) {
  // Client can bypass this
  if (!isValid(data)) return
  await supabase.from('products').update(data)
}

// ✅ Server-side validation
'use server'
export async function updateProduct(data) {
  // This runs on server, can't be bypassed
  const validated = productSchema.parse(data)
  const supabase = await createClient()
  await supabase.from('products').update(validated)
}
```

### 4. Use auth.uid() in RLS

```sql
-- ❌ Don't trust client-provided user_id
create policy "Bad policy"
  on products
  for select
  using (user_id = current_setting('request.user_id'));

-- ✅ Always use auth.uid()
create policy "Good policy"
  on products
  for select
  using (user_id = auth.uid());
```

### 5. Limit JWT Expiry

```ts
// supabase/config.toml
[auth]
# Set appropriate session timeout
jwt_expiry = 3600  # 1 hour
```

### 6. Sanitize User Input

```ts
'use server'

import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
})

export async function createUser(formData: FormData) {
  // Validate and sanitize
  const validated = schema.parse({
    name: formData.get('name'),
    email: formData.get('email'),
  })

  // Use validated data
  const supabase = await createClient()
  await supabase.from('users').insert(validated)
}
```

## Common Patterns

### Auto-Create Profile on Signup

```sql
-- Database trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### Email Verification Required

```ts
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})

// User must verify email before signing in
```

### Password Reset Flow

```ts
// Request reset
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/update-password`,
})

// Update password page
await supabase.auth.updateUser({
  password: newPassword,
})
```

## See Also

- [Auth Integration Workflow](../workflows/auth-integration-workflow.md)
- [Auth Templates](../templates/auth/README.md)
- [RBAC Navigation](../modules/01-frontend/rbac-navigation.md)
- [Database Layer Documentation](../modules/02-backend/database-layer.md)
