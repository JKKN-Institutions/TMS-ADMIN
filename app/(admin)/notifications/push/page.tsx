'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminPushNotifications from '@/components/admin-push-notifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Smartphone, 
  Users, 
  Send, 
  BarChart3, 
  AlertCircle,
  CheckCircle,
  Clock,
  Bell
} from 'lucide-react';

export default function PushNotificationsPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pushStats, setPushStats] = useState({
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    totalSent: 0,
    deliveryRate: 0
  });

  useEffect(() => {
    checkAdminAuth();
    loadPushStats();
  }, []);

  const checkAdminAuth = () => {
    const storedUser = localStorage.getItem('adminUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      if (['super_admin', 'admin'].includes(user.role)) {
        setAdminUser(user);
      } else {
        router.push('/admin/dashboard');
      }
    } else {
      router.push('/admin/auth/login');
    }
    setLoading(false);
  };

  const loadPushStats = async () => {
    try {
      // This would be replaced with actual API calls
      // For now, using mock data
      setPushStats({
        totalSubscriptions: 1250,
        activeSubscriptions: 1180,
        totalSent: 15420,
        deliveryRate: 94.2
      });
    } catch (error) {
      console.error('Error loading push stats:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!adminUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Access denied. You don't have permission to access push notifications.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Smartphone className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Subscriptions</p>
                <p className="text-2xl font-bold text-gray-900">{pushStats.totalSubscriptions.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Users</p>
                <p className="text-2xl font-bold text-gray-900">{pushStats.activeSubscriptions.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Send className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Sent</p>
                <p className="text-2xl font-bold text-gray-900">{pushStats.totalSent.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Delivery Rate</p>
                <p className="text-2xl font-bold text-gray-900">{pushStats.deliveryRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Alert>
          <Bell className="h-4 w-4" />
          <AlertDescription>
            <strong>Real-time Delivery:</strong> Push notifications are delivered instantly to active users with immediate delivery confirmation.
          </AlertDescription>
        </Alert>

        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Response Tracking:</strong> Monitor user interactions, read rates, and booking confirmations in real-time.
          </AlertDescription>
        </Alert>

        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            <strong>Scheduling:</strong> Schedule notifications for future delivery with automatic timezone handling.
          </AlertDescription>
        </Alert>
      </div>

      {/* Main Push Notifications Component */}
      <AdminPushNotifications adminId={adminUser.id} />

      {/* Help Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5" />
            <span>Push Notification Guidelines</span>
          </CardTitle>
          <CardDescription>
            Best practices for effective push notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">✅ Do's</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Keep titles under 65 characters</li>
                <li>• Make messages clear and actionable</li>
                <li>• Use appropriate notification types</li>
                <li>• Test notifications before sending to all users</li>
                <li>• Include relevant actions for interactive notifications</li>
                <li>• Schedule notifications during appropriate hours</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">❌ Don'ts</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Don't send notifications too frequently</li>
                <li>• Avoid sending during late night hours</li>
                <li>• Don't use all caps or excessive punctuation</li>
                <li>• Avoid sending duplicate content</li>
                <li>• Don't include sensitive information</li>
                <li>• Avoid non-urgent notifications during emergency alerts</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">💡 Pro Tips</h4>
            <ul className="space-y-1 text-sm text-blue-800">
              <li>• Use templates for consistent messaging</li>
              <li>• Monitor delivery rates and adjust targeting</li>
              <li>• A/B test different message formats</li>
              <li>• Use scheduling for optimal engagement times</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
