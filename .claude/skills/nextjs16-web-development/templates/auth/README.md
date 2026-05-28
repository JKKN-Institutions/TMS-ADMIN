# Authentication Templates

Supabase Auth integration with SSR support for Next.js 16.

## Components Included

1. **middleware.ts** - Route protection middleware
2. **auth-context.tsx** - User state provider
3. **protected-route.tsx** - HOC for route protection
4. **user-dropdown.tsx** - Profile menu component
5. **sign-in.tsx** - Sign in page
6. **sign-up.tsx** - Sign up page

## Prerequisites

1. Supabase project with Auth enabled
2. Environment variables configured
3. Supabase client utilities created

## Installation

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
npx shadcn@latest add card avatar dropdown-menu
```

### 2. Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Create Supabase Client Utilities

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
      },
    }
  )
}
```

### 4. Set Up Middleware

Copy `middleware.ts` to root and create:

```ts
// middleware.ts (root)
import { updateSession } from '@/templates/auth/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### 5. Add Auth Provider to Layout

```tsx
// app/layout.tsx
import { AuthProvider } from '@/templates/auth/auth-context'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
```

### 6. Create Auth Callback Route

```tsx
// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/dashboard'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${redirect}`)
}
```

## Usage

### Protect Pages with Middleware

The middleware automatically protects routes defined in `protectedRoutes` array:

```ts
// middleware.ts
const protectedRoutes = ['/dashboard', '/settings', '/profile']
```

### Use Auth Context

```tsx
'use client'

import { useAuth } from '@/templates/auth/auth-context'

export function MyComponent() {
  const { user, loading, signOut } = useAuth()

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Not authenticated</div>

  return (
    <div>
      <p>Welcome, {user.email}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}
```

### Protect Client Components

```tsx
import { ProtectedRoute } from '@/templates/auth/protected-route'

export default function MyPage() {
  return (
    <ProtectedRoute>
      <MyProtectedContent />
    </ProtectedRoute>
  )
}
```

### Use HOC for Component Protection

```tsx
import { withProtectedRoute } from '@/templates/auth/protected-route'

function MyComponent() {
  return <div>Protected content</div>
}

export default withProtectedRoute(MyComponent)
```

### Add User Dropdown to Header

```tsx
// components/layout/header.tsx
import { UserDropdown } from '@/templates/auth/user-dropdown'

export function Header() {
  return (
    <header>
      {/* ... other header content ... */}
      <UserDropdown />
    </header>
  )
}
```

### Server-Side Auth Check

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

  return <div>Welcome, {user.email}</div>
}
```

## Auth Pages

### Sign In Page

```tsx
// app/auth/sign-in/page.tsx
import SignIn from '@/templates/auth/auth-pages/sign-in'

export default function SignInPage() {
  return <SignIn />
}
```

### Sign Up Page

```tsx
// app/auth/sign-up/page.tsx
import SignUp from '@/templates/auth/auth-pages/sign-up'

export default function SignUpPage() {
  return <SignUp />
}
```

## Supabase Configuration

### Enable Email Auth

1. Go to Authentication > Providers in Supabase Dashboard
2. Enable Email provider
3. Configure email templates (optional)

### Enable Google OAuth (Optional)

1. Go to Authentication > Providers
2. Enable Google provider
3. Add OAuth credentials from Google Cloud Console
4. Add authorized redirect URLs:
   - `https://your-project.supabase.co/auth/v1/callback`

### Email Templates

Customize email templates in Authentication > Email Templates:
- Confirmation email
- Magic link email
- Password reset email

## Row Level Security (RLS)

Create profiles table with RLS:

```sql
-- Create profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policy: Users can view their own profile
create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Policy: Users can update their own profile
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- Function to create profile on signup
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

-- Trigger to automatically create profile
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## Advanced Patterns

### Role-Based Access Control

```tsx
// lib/auth/permissions.ts
export type Permission = 'read:products' | 'write:products' | 'admin'

export async function hasPermission(permission: Permission): Promise<boolean> {
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

### Protected Server Actions

```ts
// app/actions/products.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createProduct(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Create product logic
  const { error } = await supabase
    .from('products')
    .insert({
      name: formData.get('name'),
      user_id: user.id,
    })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/products')
  return { success: true }
}
```

## Security Best Practices

1. **Never expose service role key** - Only use anon key in client
2. **Always use RLS** - Protect all tables with Row Level Security
3. **Validate on server** - Don't trust client-side validation
4. **Use auth.uid()** - Reference authenticated user in RLS policies
5. **Limit JWT expiry** - Configure appropriate session timeout
6. **Enable MFA** - Offer multi-factor authentication for sensitive accounts

## Troubleshooting

### Session Not Persisting

- Check cookie settings in Supabase client
- Ensure middleware is running on protected routes
- Verify environment variables are set

### Redirect Loop

- Check that auth routes are not in `protectedRoutes`
- Ensure callback route is accessible
- Verify redirect URLs in Supabase dashboard

### OAuth Not Working

- Add authorized redirect URLs to OAuth provider
- Check OAuth credentials in Supabase dashboard
- Verify callback route is correct

## See Also

- [Auth Integration Workflow](../../workflows/auth-integration-workflow.md)
- [Supabase Auth Patterns](../../references/supabase-auth-patterns.md)
- [RBAC Navigation](../../modules/01-frontend/rbac-navigation.md)
- [Backend Module - Database Layer](../../modules/02-backend/database-layer.md)
