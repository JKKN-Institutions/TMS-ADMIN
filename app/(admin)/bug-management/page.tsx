'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminBugManagement from '@/components/admin-bug-management';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Bug, 
  AlertCircle,
  Shield,
  CheckCircle,
  TrendingUp
} from 'lucide-react';

export default function BugManagementPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = () => {
    const storedUser = localStorage.getItem('adminUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      if (['super_admin', 'admin', 'transport_manager'].includes(user.role)) {
        setAdminUser(user);
      } else {
        router.push('/admin/dashboard');
      }
    } else {
      router.push('/admin/auth/login');
    }
    setLoading(false);
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
            Access denied. You don't have permission to access bug management.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Bug className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Bug Reporting</p>
                <p className="text-xs text-gray-500">Track user issues</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Issue Resolution</p>
                <p className="text-xs text-gray-500">Fix and close bugs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Analytics</p>
                <p className="text-xs text-gray-500">Performance metrics</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Shield className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Quality Assurance</p>
                <p className="text-xs text-gray-500">Improve app quality</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Alert>
          <Bug className="h-4 w-4" />
          <AlertDescription>
            <strong>User-Friendly Reporting:</strong> Students can easily report bugs with screenshots and detailed information right from the passenger app.
          </AlertDescription>
        </Alert>

        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Comprehensive Tracking:</strong> Full lifecycle management from bug report to resolution with status updates and comments.
          </AlertDescription>
        </Alert>

        <Alert>
          <TrendingUp className="h-4 w-4" />
          <AlertDescription>
            <strong>Performance Analytics:</strong> Track resolution times, bug patterns, and system quality metrics to improve the application.
          </AlertDescription>
        </Alert>
      </div>

      {/* Main Bug Management Component */}
      <AdminBugManagement adminId={adminUser.id} />

      {/* Help Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bug className="w-5 h-5" />
            <span>Bug Management Guide</span>
          </CardTitle>
          <CardDescription>
            How to effectively manage bug reports and improve application quality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">🔍 Bug Triage Process</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Review new bug reports daily</li>
                <li>• Assign severity levels based on impact</li>
                <li>• Categorize bugs by type and area</li>
                <li>• Assign to appropriate team members</li>
                <li>• Set priorities based on business impact</li>
                <li>• Track resolution progress regularly</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">⚡ Quick Actions</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Use status filters to focus on specific bug types</li>
                <li>• Export reports for external analysis</li>
                <li>• Add internal comments for team coordination</li>
                <li>• Update bug status as work progresses</li>
                <li>• Monitor resolution time metrics</li>
                <li>• Use labels for better organization</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">💡 Best Practices</h4>
            <ul className="space-y-1 text-sm text-blue-800">
              <li>• Respond to critical bugs within 24 hours</li>
              <li>• Keep users informed about bug status</li>
              <li>• Document resolution steps for future reference</li>
              <li>• Use analytics to identify recurring issues</li>
              <li>• Maintain clear communication with reporters</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

