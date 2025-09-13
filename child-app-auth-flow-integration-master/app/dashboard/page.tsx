'use client';

import { RequireAuth } from '@/components/protected-route';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, ShieldCheck, Activity, LogOut } from 'lucide-react';

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();

  return (
    <div className='min-h-screen bg-background'>
      <header className='bg-card border-b'>
        <div className='container mx-auto py-4 px-6 flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold'>MyJKKN Child App</h1>
            <p className='text-muted-foreground'>Dashboard</p>
          </div>
          <Button variant='outline' onClick={() => logout()}>
            <LogOut className='mr-2 h-4 w-4' />
            Logout
          </Button>
        </div>
      </header>

      <main className='container mx-auto py-8 px-6'>
        <div className='mb-8'>
          <h2 className='text-3xl font-bold'>Welcome, {user?.full_name}!</h2>
          <p className='text-muted-foreground'>
            Here&apos;s an overview of your authenticated session.
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
          <Card>
            <CardHeader>
              <div className='flex items-center gap-4'>
                <User className='h-8 w-8 text-primary' />
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Your account details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                <div>
                  <span className='font-medium text-sm text-muted-foreground'>
                    Name
                  </span>
                  <p>{user?.full_name}</p>
                </div>
                <div>
                  <span className='font-medium text-sm text-muted-foreground'>
                    Email
                  </span>
                  <p>{user?.email}</p>
                </div>
                <div>
                  <span className='font-medium text-sm text-muted-foreground'>
                    Role
                  </span>
                  <div>
                    <Badge variant='secondary'>{user?.role}</Badge>
                  </div>
                </div>
                {user?.institution_id && (
                  <div>
                    <span className='font-medium text-sm text-muted-foreground'>
                      Institution
                    </span>
                    <p>{user.institution_id}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex items-center gap-4'>
                <ShieldCheck className='h-8 w-8 text-primary' />
                <div>
                  <CardTitle>Permissions</CardTitle>
                  <CardDescription>Your current permissions</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {user?.permissions &&
                Object.keys(user.permissions).length > 0 ? (
                  Object.entries(user.permissions).map(
                    ([permission, hasAccess]) => (
                      <div
                        key={permission}
                        className='flex justify-between items-center'
                      >
                        <span className='capitalize'>
                          {permission.replace(/_/g, ' ')}
                        </span>
                        <Badge variant={hasAccess ? 'default' : 'destructive'}>
                          {hasAccess ? 'Granted' : 'Denied'}
                        </Badge>
                      </div>
                    )
                  )
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    No permissions data available.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex items-center gap-4'>
                <Activity className='h-8 w-8 text-primary' />
                <div>
                  <CardTitle>Account Status</CardTitle>
                  <CardDescription>Your account information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                <div className='flex justify-between items-center'>
                  <span>Profile Complete</span>
                  <Badge
                    variant={
                      user?.profile_completed ? 'default' : 'destructive'
                    }
                  >
                    {user?.profile_completed ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className='flex justify-between items-center'>
                  <span>Super Admin</span>
                  <Badge
                    variant={user?.is_super_admin ? 'default' : 'secondary'}
                  >
                    {user?.is_super_admin ? 'Yes' : 'No'}
                  </Badge>
                </div>
                {user?.last_login && (
                  <div>
                    <span className='font-medium text-sm text-muted-foreground'>
                      Last Login
                    </span>
                    <p>{new Date(user.last_login).toLocaleString()}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
