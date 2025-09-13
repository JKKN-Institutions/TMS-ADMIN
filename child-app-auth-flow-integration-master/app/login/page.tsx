'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleLogin = () => {
    console.log('Login button clicked');
    login();
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-background'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-background p-4'>
      <div className='mb-8 text-center'>
        <h1 className='text-4xl font-bold'>MyJKKN Child App</h1>
        <p className='text-muted-foreground'>Authentication Flow Test</p>
      </div>
      <Card className='w-full max-w-sm'>
        <CardHeader className='text-center'>
          <CardTitle className='text-2xl'>Welcome Back</CardTitle>
          <CardDescription>
            Click the button below to sign in via MyJKKN.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleLogin} className='w-full' size='lg'>
            <LogIn className='mr-2 h-4 w-4' /> Sign in with MyJKKN
          </Button>
        </CardContent>
      </Card>
      <footer className='mt-8 text-center text-sm text-muted-foreground'>
        <p>
          This is a test application for the MyJKKN parent authentication
          system.
        </p>
      </footer>
    </div>
  );
}
