# RBAC Navigation

Role-Based Access Control (RBAC) navigation with permission filtering.

## Overview

This module implements navigation filtering based on user roles and permissions:
- **Dynamic navigation**: Menu items filtered by user role
- **Permission-based**: Granular access control per route
- **Nested menus**: Support for grouped navigation items
- **Client-side filtering**: Real-time navigation updates
- **Type-safe**: TypeScript permissions

---

## Navigation Configuration

### Navigation Structure

```typescript
// config/nav-config.ts
import { type LucideIcon } from 'lucide-react'

export interface NavItem {
  title: string
  href: string
  icon?: string // Lucide icon name
  description?: string
  roles?: string[] // Required roles
  permissions?: string[] // Required permissions
  items?: NavItem[] // Nested items
  badge?: string | number
  external?: boolean
}

export const navConfig = {
  mainNav: [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: 'LayoutDashboard',
      description: 'Overview and analytics',
    },
    {
      title: 'Products',
      href: '/dashboard/products',
      icon: 'Package',
      description: 'Manage your products',
      items: [
        {
          title: 'All Products',
          href: '/dashboard/products',
          icon: 'List',
        },
        {
          title: 'Create Product',
          href: '/dashboard/products/new',
          icon: 'Plus',
          permissions: ['products:create'],
        },
        {
          title: 'Categories',
          href: '/dashboard/products/categories',
          icon: 'FolderTree',
        },
      ],
    },
    {
      title: 'Orders',
      href: '/dashboard/orders',
      icon: 'ShoppingCart',
      badge: 12, // Notification badge
      roles: ['admin', 'manager'],
    },
    {
      title: 'Users',
      href: '/dashboard/users',
      icon: 'Users',
      roles: ['admin'],
      items: [
        {
          title: 'All Users',
          href: '/dashboard/users',
          icon: 'List',
        },
        {
          title: 'Roles & Permissions',
          href: '/dashboard/users/roles',
          icon: 'Shield',
          permissions: ['users:manage_roles'],
        },
      ],
    },
    {
      title: 'Settings',
      href: '/dashboard/settings',
      icon: 'Settings',
    },
    {
      title: 'Documentation',
      href: 'https://docs.example.com',
      icon: 'BookOpen',
      external: true,
    },
  ],
  sideNav: [
    // Additional sidebar items
  ],
} as const

export type NavConfig = typeof navConfig
```

---

## Permission System

### Define Permissions

```typescript
// types/permissions.ts
export const PERMISSIONS = {
  // Products
  'products:view': 'View products',
  'products:create': 'Create products',
  'products:update': 'Update products',
  'products:delete': 'Delete products',

  // Orders
  'orders:view': 'View orders',
  'orders:manage': 'Manage orders',
  'orders:refund': 'Process refunds',

  // Users
  'users:view': 'View users',
  'users:create': 'Create users',
  'users:update': 'Update users',
  'users:delete': 'Delete users',
  'users:manage_roles': 'Manage user roles',

  // Settings
  'settings:view': 'View settings',
  'settings:update': 'Update settings',
} as const

export type Permission = keyof typeof PERMISSIONS

// Role definitions
export const ROLES = {
  admin: {
    name: 'Administrator',
    permissions: Object.keys(PERMISSIONS) as Permission[],
  },
  manager: {
    name: 'Manager',
    permissions: [
      'products:view',
      'products:create',
      'products:update',
      'orders:view',
      'orders:manage',
      'users:view',
    ] as Permission[],
  },
  staff: {
    name: 'Staff',
    permissions: [
      'products:view',
      'orders:view',
    ] as Permission[],
  },
  user: {
    name: 'User',
    permissions: [] as Permission[],
  },
} as const

export type Role = keyof typeof ROLES
```

---

## User Context with Permissions

### Auth Context with Role/Permissions

```typescript
// contexts/auth-context.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { ROLES, type Role, type Permission } from '@/types/permissions'
import type { User } from '@supabase/supabase-js'

interface UserProfile {
  id: string
  role: Role
  permissions?: Permission[]
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  hasRole: (roles: Role | Role[]) => boolean
  hasPermission: (permissions: Permission | Permission[]) => boolean
  hasAnyPermission: (permissions: Permission[]) => boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClientSupabaseClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, role, permissions')
      .eq('id', userId)
      .single()

    if (data) {
      // Get role permissions
      const rolePermissions = ROLES[data.role as Role]?.permissions || []
      // Combine with custom permissions
      const allPermissions = [
        ...rolePermissions,
        ...(data.permissions || []),
      ]

      setProfile({
        id: data.id,
        role: data.role as Role,
        permissions: allPermissions as Permission[],
      })
    }

    setLoading(false)
  }

  const hasRole = (roles: Role | Role[]) => {
    if (!profile) return false
    const roleArray = Array.isArray(roles) ? roles : [roles]
    return roleArray.includes(profile.role)
  }

  const hasPermission = (permissions: Permission | Permission[]) => {
    if (!profile?.permissions) return false
    const permArray = Array.isArray(permissions) ? permissions : [permissions]
    return permArray.every((perm) => profile.permissions?.includes(perm))
  }

  const hasAnyPermission = (permissions: Permission[]) => {
    if (!profile?.permissions) return false
    return permissions.some((perm) => profile.permissions?.includes(perm))
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        hasRole,
        hasPermission,
        hasAnyPermission,
        signOut,
      }}
    >
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

---

## Navigation Filtering Hook

### useFilteredNav Hook

```typescript
// hooks/use-filtered-nav.ts
'use client'

import { useMemo } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { navConfig, type NavItem } from '@/config/nav-config'

export function useFilteredNav() {
  const { profile, hasRole, hasPermission } = useAuth()

  const filterNavItems = useMemo(() => {
    const filter = (items: NavItem[]): NavItem[] => {
      return items
        .filter((item) => {
          // Check role requirements
          if (item.roles && !hasRole(item.roles)) {
            return false
          }

          // Check permission requirements
          if (item.permissions && !hasPermission(item.permissions)) {
            return false
          }

          return true
        })
        .map((item) => ({
          ...item,
          // Recursively filter nested items
          items: item.items ? filter(item.items) : undefined,
        }))
        .filter((item) => {
          // Remove parent items with no visible children
          if (item.items && item.items.length === 0) {
            return false
          }
          return true
        })
    }

    return {
      mainNav: filter(navConfig.mainNav),
      sideNav: filter(navConfig.sideNav || []),
    }
  }, [profile, hasRole, hasPermission])

  return filterNavItems
}
```

---

## Navigation Components

### Sidebar with RBAC

```tsx
// components/layout/app-sidebar.tsx
'use client'

import { useFilteredNav } from '@/hooks/use-filtered-nav'
import { NavItem } from './nav-item'

export function AppSidebar() {
  const { mainNav } = useFilteredNav()

  return (
    <aside className="w-64 border-r bg-background">
      <nav className="space-y-1 p-2">
        {mainNav.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
      </nav>
    </aside>
  )
}
```

### NavItem Component

```tsx
// components/layout/nav-item.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import type { NavItem as NavItemType } from '@/config/nav-config'

interface NavItemProps {
  item: NavItemType
  level?: number
}

export function NavItem({ item, level = 0 }: NavItemProps) {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)

  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const hasChildren = item.items && item.items.length > 0

  const NavLink = (
    <Link
      href={item.href}
      target={item.external ? '_blank' : undefined}
      rel={item.external ? 'noopener noreferrer' : undefined}
      className={cn(
        buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
        'w-full justify-start gap-2',
        level > 0 && 'ml-4'
      )}
      onClick={() => hasChildren && setIsExpanded(!isExpanded)}
    >
      {item.icon && <span className="h-5 w-5">{/* Icon */}</span>}
      <span className="flex-1 text-left">{item.title}</span>
      {item.badge && (
        <Badge variant="secondary" className="ml-auto">
          {item.badge}
        </Badge>
      )}
      {item.external && <ExternalLink className="h-4 w-4 ml-auto" />}
      {hasChildren && (
        <ChevronRight
          className={cn(
            'h-4 w-4 transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      )}
    </Link>
  )

  return (
    <div>
      {NavLink}
      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1">
          {item.items!.map((subItem) => (
            <NavItem key={subItem.href} item={subItem} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Route Protection

### Server-Side Route Protection

```typescript
// lib/auth/require-permission.ts
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ROLES, type Permission, type Role } from '@/types/permissions'

export async function requirePermission(
  requiredPermissions: Permission | Permission[]
) {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/sign-in')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/unauthorized')
  }

  // Get role permissions
  const rolePermissions = ROLES[profile.role as Role]?.permissions || []
  const allPermissions = [...rolePermissions, ...(profile.permissions || [])]

  // Check permissions
  const perms = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions]

  const hasPermission = perms.every((perm) => allPermissions.includes(perm))

  if (!hasPermission) {
    redirect('/unauthorized')
  }

  return { user, profile }
}

export async function requireRole(requiredRoles: Role | Role[]) {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/sign-in')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/unauthorized')
  }

  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]

  if (!roles.includes(profile.role as Role)) {
    redirect('/unauthorized')
  }

  return { user, profile }
}
```

### Protected Page Example

```tsx
// app/(dashboard)/dashboard/admin/page.tsx
import { requireRole } from '@/lib/auth/require-permission'

export default async function AdminPage() {
  // Only admins can access
  await requireRole('admin')

  return (
    <div>
      <h1>Admin Dashboard</h1>
      {/* Admin-only content */}
    </div>
  )
}
```

### Protected Action Example

```tsx
// app/(dashboard)/dashboard/products/new/page.tsx
import { requirePermission } from '@/lib/auth/require-permission'

export default async function NewProductPage() {
  // Require create permission
  await requirePermission('products:create')

  return (
    <div>
      <h1>Create Product</h1>
      <ProductForm />
    </div>
  )
}
```

---

## Client-Side Protection

### Protected Component Wrapper

```tsx
// components/auth/protected.tsx
'use client'

import { useAuth } from '@/contexts/auth-context'
import type { Role, Permission } from '@/types/permissions'

interface ProtectedProps {
  children: React.ReactNode
  roles?: Role | Role[]
  permissions?: Permission | Permission[]
  requireAll?: boolean // Require all permissions (default: true)
  fallback?: React.ReactNode
}

export function Protected({
  children,
  roles,
  permissions,
  requireAll = true,
  fallback = null,
}: ProtectedProps) {
  const { hasRole, hasPermission, hasAnyPermission } = useAuth()

  // Check roles
  if (roles && !hasRole(roles)) {
    return <>{fallback}</>
  }

  // Check permissions
  if (permissions) {
    const hasAccess = requireAll
      ? hasPermission(permissions)
      : hasAnyPermission(
          Array.isArray(permissions) ? permissions : [permissions]
        )

    if (!hasAccess) {
      return <>{fallback}</>
    }
  }

  return <>{children}</>
}
```

### Usage in Components

```tsx
// Example: Conditionally show delete button
import { Protected } from '@/components/auth/protected'

export function ProductActions({ productId }: { productId: string }) {
  return (
    <div className="flex gap-2">
      <Button>View</Button>

      <Protected permissions="products:update">
        <Button>Edit</Button>
      </Protected>

      <Protected permissions="products:delete">
        <Button variant="destructive">Delete</Button>
      </Protected>
    </div>
  )
}
```

---

## Database Schema

### Profiles Table with Roles

```sql
-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  permissions TEXT[], -- Custom permissions array
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check constraint for valid roles
ALTER TABLE profiles ADD CONSTRAINT valid_role
  CHECK (role IN ('admin', 'manager', 'staff', 'user'));

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = OLD.role); -- Prevent role self-modification

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Indexes
CREATE INDEX idx_profiles_role ON profiles(role);
```

---

## Testing Permissions

### Permission Check Examples

```tsx
// Example: Check if user has permission
import { useAuth } from '@/contexts/auth-context'

export function ProductManagement() {
  const { hasPermission, hasRole } = useAuth()

  const canCreate = hasPermission('products:create')
  const canDelete = hasPermission('products:delete')
  const isAdmin = hasRole('admin')

  return (
    <div>
      {canCreate && <Button>Create Product</Button>}
      {canDelete && <Button variant="destructive">Delete All</Button>}
      {isAdmin && <Badge>Admin</Badge>}
    </div>
  )
}
```

---

## Best Practices

1. **Principle of Least Privilege**: Grant minimum necessary permissions
2. **Server-Side Validation**: Always verify permissions on the server
3. **Client-Side UX**: Use client checks to hide/show UI elements
4. **Permission Granularity**: Define specific permissions (not broad ones)
5. **Role Hierarchy**: Structure roles from least to most privileged
6. **Audit Logging**: Log permission changes and access attempts
7. **Default Deny**: Require explicit permission grants
8. **Cache User Permissions**: Reduce database queries with caching

---

## Common Patterns

### Multi-Tenant Access Control

```typescript
// Check if user belongs to organization
export async function requireOrganizationAccess(orgId: string) {
  const { user } = await requireAuth()
  const supabase = await createServerSupabaseClient()

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/unauthorized')
  }

  return { user, membership }
}
```

### Dynamic Permission Loading

```typescript
// Load permissions from database
export async function getUserPermissions(userId: string) {
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', userId)

  return data?.map((p) => p.permission) || []
}
```

---

## Debugging

### Permission Debugger Component

```tsx
// components/dev/permission-debugger.tsx
'use client'

import { useAuth } from '@/contexts/auth-context'

export function PermissionDebugger() {
  const { profile } = useAuth()

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 bg-black text-white p-4 rounded text-xs max-w-xs">
      <h4 className="font-bold mb-2">Permission Debugger</h4>
      <p>Role: {profile?.role || 'None'}</p>
      <p>Permissions:</p>
      <ul className="list-disc list-inside">
        {profile?.permissions?.map((perm) => (
          <li key={perm}>{perm}</li>
        ))}
      </ul>
    </div>
  )
}
```

---

## Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.38.0",
    "@supabase/ssr": "^0.0.10",
    "next": "^16.0.0",
    "react": "^19.0.0"
  }
}
```

---

**Version**: 3.0.0
**Updated**: January 2026
