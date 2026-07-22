'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings,
  Shield,
  Bell,
  Server,
  Save,
  RefreshCw,
  AlertTriangle,
  Bus,
  Calendar,
  Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { defaultSchedulingSettings, type SchedulingSettings } from '../../../lib/scheduling-config';
import { AttendanceWindowSettings } from '@/components/admin/attendance-window-settings';
import { NotificationsSettings } from '@/components/admin/notifications-settings';
import { SecuritySettings } from '@/components/admin/security-settings';
import { SystemSettings } from '@/components/admin/system-settings';

// Scheduling settings are loaded here via a real API call. Notifications and
// Security also load real data now (NotificationsSettings/SecuritySettings
// fetch /api/admin/settings and /api/admin/system-info themselves, below).
// General is still local-only defaults with no backing API — see
// handleSaveSettings('General'), which just toasts without persisting.
async function fetchSchedulingSettings(): Promise<SchedulingSettings> {
  const response = await fetch('/api/admin/settings');
  if (!response.ok) throw new Error('Failed to load settings');
  const json = await response.json();
  // The route returns the project's standard { success, data } envelope.
  return json.data.settings as SchedulingSettings;
}

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('general');

  // General settings state
  const [generalSettings, setGeneralSettings] = useState({
    systemName: 'TMS Admin Portal',
    timezone: 'Asia/Kolkata',
    language: 'en',
    dateFormat: 'DD/MM/YYYY',
    currency: 'INR'
  });

  // Editable scheduling settings form state, seeded from the loaded record below
  // (same fallback-to-defaults behaviour as the old loadSchedulingSettings).
  const [schedulingSettings, setSchedulingSettings] = useState(defaultSchedulingSettings);
  const {
    data: schedulingData,
    isLoading: loading,
    isError: schedulingLoadError,
  } = useQuery({ queryKey: ['settings', 'scheduling'], queryFn: fetchSchedulingSettings });

  React.useEffect(() => {
    if (schedulingData) setSchedulingSettings(schedulingData);
  }, [schedulingData]);

  React.useEffect(() => {
    if (schedulingLoadError) toast.error('Failed to load settings, using defaults');
  }, [schedulingLoadError]);

  // Check URL params to set active tab on mount.
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const validTabs = ['general', 'scheduling', 'attendance', 'notifications', 'security', 'system'];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  const tabs = [
    { id: 'general', name: 'General', icon: Settings },
    { id: 'scheduling', name: 'Scheduling', icon: Bus },
    { id: 'attendance', name: 'Attendance', icon: Clock },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'system', name: 'System', icon: Server }
  ];

  const handleSaveSettings = async (section: string) => {
    if (section === 'Scheduling') {
      try {
        // Re-GET the current blob right before writing — do NOT POST the copy
        // snapshotted at mount (`schedulingSettings`), which may have gone
        // stale if another admin changed a field on this same blob (e.g. the
        // Notifications tab's autoNotifyPassengers toggle) since this page
        // loaded. Only the four fields this tab actually edits
        // (enableBookingTimeWindow, bookingWindowEndHour, bookingDaysAhead,
        // autoGenerateBills) are meant to change here — everything else rides
        // along from the fresh GET so this save can't clobber a concurrent
        // change made elsewhere. Mirrors components/admin/notifications-settings.tsx.
        const freshResponse = await fetch('/api/admin/settings', { cache: 'no-store' });
        if (!freshResponse.ok) throw new Error('Failed to load current settings');
        const freshJson = await freshResponse.json();
        const current = freshJson.data.settings as SchedulingSettings;
        const merged: SchedulingSettings = {
          ...current,
          enableBookingTimeWindow: schedulingSettings.enableBookingTimeWindow,
          bookingWindowEndHour: schedulingSettings.bookingWindowEndHour,
          bookingDaysAhead: schedulingSettings.bookingDaysAhead,
          autoGenerateBills: schedulingSettings.autoGenerateBills,
        };

        const response = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ settings: merged }),
        });

        if (response.ok) {
          const data = await response.json();
          setSchedulingSettings(data.data.settings as SchedulingSettings);
          toast.success('Scheduling settings saved successfully!');
          console.log('Settings saved:', data);
        } else {
          const errorData = await response.json();
          toast.error(`Failed to save scheduling settings: ${errorData.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Error saving scheduling settings:', error);
        toast.error('Failed to save scheduling settings. Please try again.');
      }
    } else {
      toast.success(`${section} settings saved successfully!`);
    }
  };

  const renderSchedulingSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Scheduling Settings</h3>
        <div className="space-y-6">
          {/* Booking Configuration */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span>Booking Configuration</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enable Booking Time Window
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="enableBookingTimeWindow"
                    checked={schedulingSettings.enableBookingTimeWindow}
                    onChange={(e) => setSchedulingSettings({ ...schedulingSettings, enableBookingTimeWindow: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enableBookingTimeWindow" className="ml-2 text-sm text-gray-600">
                    Enforce a daily booking cutoff time
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Booking Cutoff Time
                </label>
                <select
                  value={schedulingSettings.bookingWindowEndHour}
                  onChange={(e) => setSchedulingSettings({ ...schedulingSettings, bookingWindowEndHour: parseInt(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-600 mt-1">
                  Students cannot book after this time on the day before the trip
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Booking days available (days ahead)
                </label>
                <input
                  type="number"
                  value={schedulingSettings.bookingDaysAhead}
                  onChange={(e) => setSchedulingSettings({ ...schedulingSettings, bookingDaysAhead: parseInt(e.target.value) })}
                  min="1"
                  max="14"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-600 mt-1">
                  How many days ahead learners can book (Sunday is always a holiday)
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-yellow-800 mb-1">Current Booking Policy:</p>
                  <ul className="text-yellow-700 space-y-1 text-sm">
                    <li>• Students can book trips anytime after admin approval</li>
                    <li>• Booking deadline: {schedulingSettings.bookingWindowEndHour === 0 ? '12:00 AM' :
                       schedulingSettings.bookingWindowEndHour < 12 ? `${schedulingSettings.bookingWindowEndHour}:00 AM` :
                       schedulingSettings.bookingWindowEndHour === 12 ? '12:00 PM' :
                       `${schedulingSettings.bookingWindowEndHour-12}:00 PM`} the day before the trip</li>
                    <li>• Each schedule must be individually approved by admin</li>
                    <li>• Booking opens for the next {schedulingSettings.bookingDaysAhead} day(s); Sundays remain closed</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Billing automation — the kill switch for the nightly auto-generation cron. */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900">Automatic bill generation</div>
                <p className="mt-1 max-w-xl text-xs text-gray-600">
                  When on, a nightly run (03:00 IST) generates transport bills for every learner
                  who has become applicable under each ACTIVE fee structure of the current
                  transport year — the same engine as the manual Generate button, so existing
                  bills are never duplicated. People already billed by another structure this
                  year are skipped. Before turning this on, deactivate any test structures:
                  every active current-year structure will generate.
                </p>
              </div>
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={schedulingSettings.autoGenerateBills}
                  onChange={(e) =>
                    setSchedulingSettings({ ...schedulingSettings, autoGenerateBills: e.target.checked })
                  }
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={() => handleSaveSettings('Scheduling')}
          className="btn-primary flex items-center space-x-2"
        >
          <Save className="w-4 h-4" />
          <span>Save Scheduling Settings</span>
        </button>
      </div>
    </div>
  );

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">General Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">System Name</label>
            <input
              type="text"
              value={generalSettings.systemName}
              onChange={(e) => setGeneralSettings(prev => ({ ...prev, systemName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
            <select
              value={generalSettings.timezone}
              onChange={(e) => setGeneralSettings(prev => ({ ...prev, timezone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
            <select
              value={generalSettings.language}
              onChange={(e) => setGeneralSettings(prev => ({ ...prev, language: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="te">Telugu</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Format</label>
            <select
              value={generalSettings.dateFormat}
              onChange={(e) => setGeneralSettings(prev => ({ ...prev, dateFormat: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
        </div>
        <div className="mt-6">
          <button
            onClick={() => handleSaveSettings('General')}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save General Settings</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading settings...</span>
        </div>
      );
    }

    switch (activeTab) {
      case 'general':
        return renderGeneralSettings();
      case 'scheduling':
        return renderSchedulingSettings();
      case 'attendance':
        return <AttendanceWindowSettings />;
      case 'notifications':
        return <NotificationsSettings />;
      case 'security':
        return <SecuritySettings />;
      case 'system':
        return <SystemSettings />;
      default:
        return <div className="text-center py-8">Invalid tab</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your system preferences and configurations</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6 py-4 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;


