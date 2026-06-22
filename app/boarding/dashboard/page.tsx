'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  QrCode, Route as RouteIcon, Users, ArrowRight, ArrowLeft, CheckCircle2,
  RefreshCw, ChevronRight, Clock, ScanLine, ListChecks, Activity, GraduationCap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import UniversalStatCard from '@/components/universal-stat-card';

interface BoardingRoute {
  id: string;
  route_number: string | null;
  route_name: string | null;
  student_count: number;
  present_today: number;
}
interface RecentScan {
  id: string;
  learner_name: string;
  roll_number: string | null;
  route_number: string | null;
  direction: string | null;
  scanned_at: string | null;
}
interface BoardingDashboard {
  staffName: string;
  assignedRouteCount: number;
  studentsTotal: number;
  today: { total: number; onward: number; return: number };
  routes: BoardingRoute[];
  recent: RecentScan[];
}

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export default function BoardingDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<BoardingDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (mode: 'initial' | 'refresh' = 'initial') => {
    try {
      const res = await fetch('/api/boarding/dashboard', { cache: 'no-store', credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load dashboard');
      setData(json.data as BoardingDashboard);
    } catch (e) {
      console.error('boarding dashboard load error:', e);
      toast.error('Failed to load boarding dashboard');
      setData({
        staffName: 'Boarding Staff', assignedRouteCount: 0, studentsTotal: 0,
        today: { total: 0, onward: 0, return: 0 }, routes: [], recent: [],
      });
    } finally {
      if (mode === 'initial') setLoading(false); else setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData('refresh');
    toast.success('Dashboard refreshed');
  };

  // Quick actions — gradient-icon cards in the admin style; all link to real pages.
  const quickActions = [
    { title: 'Scan Boarding Pass', desc: "Scan a learner's QR to mark present", icon: ScanLine, color: 'bg-gradient-to-br from-green-500 to-emerald-600', href: '/boarding/scan' },
    { title: 'My Route', desc: 'Open your route roster', icon: RouteIcon, color: 'bg-gradient-to-br from-indigo-500 to-blue-600', href: '/boarding/routes' },
    { title: 'Attendance', desc: "Review today's and past boardings", icon: ListChecks, color: 'bg-gradient-to-br from-purple-500 to-violet-600', href: '/boarding/attendance' },
  ];

  const stats = [
    { title: 'Boarded Today', value: data?.today.total ?? 0, subtitle: 'Marked present', icon: CheckCircle2, color: 'green' as const, href: '/boarding/attendance' },
    { title: 'Onward', value: data?.today.onward ?? 0, subtitle: 'Morning trips', icon: ArrowRight, color: 'blue' as const, href: '/boarding/attendance' },
    { title: 'Return', value: data?.today.return ?? 0, subtitle: 'Evening trips', icon: ArrowLeft, color: 'purple' as const, href: '/boarding/attendance' },
    { title: 'Students', value: data?.studentsTotal ?? 0, subtitle: data?.routes?.[0]?.route_number ? `Route ${data.routes[0].route_number}` : 'On your route', icon: Users, color: 'indigo' as const, href: '/boarding/routes' },
  ];

  const myRoute = data?.routes?.[0] ?? null;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 animate-spin rounded-full border-4 border-gray-300 border-t-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">
            Welcome, {data?.staffName || 'Boarding Staff'}
          </h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Here&apos;s today&apos;s boarding activity for your assigned routes.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:gap-3 sm:shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex flex-1 justify-center sm:flex-none items-center whitespace-nowrap px-4 py-2 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <button
            onClick={() => router.push('/boarding/scan')}
            className="inline-flex flex-1 justify-center sm:flex-none items-center whitespace-nowrap px-4 py-2 border border-transparent rounded-lg shadow-sm bg-green-600 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            <QrCode className="w-4 h-4 mr-2" />
            <span className="sm:hidden">Scan</span>
            <span className="hidden sm:inline">Scan Boarding Pass</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <UniversalStatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={stat.icon}
            color={stat.color}
            variant="enhanced"
            loading={false}
            onClick={() => router.push(stat.href)}
            delay={index}
          />
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Quick Actions</h2>
          <button
            onClick={() => router.push('/boarding/routes')}
            className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center transition-colors"
          >
            My Route <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quickActions.map((action) => (
            <div
              key={action.title}
              onClick={() => router.push(action.href)}
              className="relative overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer transition-all duration-300 hover:shadow-md hover:scale-[1.02] group"
            >
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.color} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-sm text-gray-600 truncate">{action.desc}</p>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-green-50 opacity-0 group-hover:opacity-30 transition-opacity duration-300" />
            </div>
          ))}
        </div>
      </div>

      {/* 3-panel row (admin format) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Today&apos;s Summary</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/40 rounded-lg">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-900 dark:text-green-200">Boarded Today</span>
                </div>
                <span className="text-lg font-bold text-green-900 dark:text-green-200">{data?.today.total ?? 0}</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Onward</span>
                  <span className="text-sm font-semibold text-gray-900">{data?.today.onward ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Return</span>
                  <span className="text-sm font-semibold text-gray-900">{data?.today.return ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5"><GraduationCap className="w-4 h-4 text-gray-400" /> Students on your routes</span>
                  <span className="text-sm font-semibold text-gray-900">{data?.studentsTotal ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Routes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-blue-50">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center">
                <RouteIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">My Route</h3>
            </div>
          </div>
          <div className="p-6">
            {myRoute ? (
              <button onClick={() => router.push(`/boarding/routes/${myRoute.id}`)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-gray-900 truncate">{myRoute.route_number || '—'}</p>
                    <p className="text-sm text-gray-600 truncate">{myRoute.route_name || 'Route'}</p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {myRoute.present_today} today
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Users className="w-3.5 h-3.5" /> {myRoute.student_count} students
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                    Open roster <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            ) : (
              <p className="text-sm text-gray-500">No route assigned yet. Ask an admin to assign you to a route.</p>
            )}
          </div>
        </div>

        {/* Recent Boardings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Recent Boardings</h3>
            </div>
          </div>
          <div className="p-6">
            {data && data.recent.length > 0 ? (
              <div className="space-y-4">
                {data.recent.map((s) => (
                  <div key={s.id} className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${s.direction === 'return' ? 'bg-purple-500' : 'bg-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">
                        {s.learner_name}
                        {s.roll_number ? <span className="text-gray-500"> · {s.roll_number}</span> : null}
                      </p>
                      <p className="text-xs text-gray-500">
                        {s.route_number ? `Route ${s.route_number} · ` : ''}
                        <span className="capitalize">{s.direction || 'onward'}</span> · {fmtTime(s.scanned_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No boardings recorded today yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
