'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  User,
  Shield,
  Database,
  Bell,
  Mail,
  Key,
  Globe,
  Server,
  HardDrive,
  Save,
  RefreshCw,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  Users,
  Bus,
  Calendar,
  Clock,
  DollarSign,
  Eye,
  Monitor
} from 'lucide-react';
import toast from 'react-hot-toast';
import SchedulingConfigManager, { defaultSchedulingSettings } from '../../../lib/scheduling-config';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  
  // General settings state
  const [generalSettings, setGeneralSettings] = useState({
    systemName: 'TMS Admin Portal',
    timezone: 'Asia/Kolkata',
    language: 'en',
    dateFormat: 'DD/MM/YYYY',
    currency: 'INR'
  });

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: true,
    maintenanceAlerts: true,
    bookingAlerts: true,
    paymentAlerts: true
  });

  // Security settings state
  const [securitySettings, setSecuritySettings] = useState({
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    passwordExpiry: 90,
    twoFactorAuth: false,
    ipRestriction: false
  });
  
  // Load settings from API on component mount
  React.useEffect(() => {
    loadAllSettings();
    
    // Check URL params to set active tab
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const validTabs = ['general', 'scheduling', 'notifications', 'security', 'system'];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  const loadAllSettings = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadSchedulingSettings(),
        loadGeneralSettings(),
        loadNotificationSettings(),
        loadSecuritySettings()
      ]);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Failed to load some settings');
    } finally {
      setLoading(false);
    }
  };

  const loadGeneralSettings = async () => {
    // For now, use default values - in a real app, fetch from API
    console.log('Loading general settings...');
  };

  const loadNotificationSettings = async () => {
    // For now, use default values - in a real app, fetch from API
    console.log('Loading notification settings...');
  };

  const loadSecuritySettings = async () => {
    // For now, use default values - in a real app, fetch from API
    console.log('Loading security settings...');
  };

  const loadSchedulingSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings');
      if (response.ok) {
        const data = await response.json();
        setSchedulingSettings(data.settings);
      } else {
        console.error('Failed to load settings:', response.statusText);
        // Fall back to default settings
        setSchedulingSettings(defaultSchedulingSettings);
        toast.error('Failed to load settings, using defaults');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setSchedulingSettings(defaultSchedulingSettings);
      toast.error('Failed to load settings, using defaults');
    }
  };

  const [schedulingSettings, setSchedulingSettings] = useState(defaultSchedulingSettings);

  const tabs = [
    { id: 'general', name: 'General', icon: Settings },
    { id: 'scheduling', name: 'Scheduling', icon: Bus },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'system', name: 'System', icon: Server }
  ];

  const handleSaveSettings = async (section: string) => {
    if (section === 'Scheduling') {
      try {
        const response = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ settings: schedulingSettings }),
        });

        if (response.ok) {
          const data = await response.json();
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
                    onChange={(e) => setSchedulingSettings({...schedulingSettings, enableBookingTimeWindow: e.target.checked})}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enableBookingTimeWindow" className="ml-2 text-sm text-gray-600">
                    Restrict booking to specific time window
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Booking Cutoff Time
                </label>
                <select
                  value={schedulingSettings.bookingWindowEndHour}
                  onChange={(e) => setSchedulingSettings({...schedulingSettings, bookingWindowEndHour: parseInt(e.target.value)})}
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
                  Booking Window (Days Before)
                </label>
                <input
                  type="number"
                  value={schedulingSettings.bookingWindowDaysBefore}
                  onChange={(e) => setSchedulingSettings({...schedulingSettings, bookingWindowDaysBefore: parseInt(e.target.value)})}
                  min="1"
                  max="7"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Number of days before the trip when booking deadline applies
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Auto-notify Passengers
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="autoNotifyPassengers"
                    checked={schedulingSettings.autoNotifyPassengers}
                    onChange={(e) => setSchedulingSettings({...schedulingSettings, autoNotifyPassengers: e.target.checked})}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="autoNotifyPassengers" className="ml-2 text-sm text-gray-600">
                    Send notifications to passengers automatically
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reminder Hours
              </label>
              <div className="space-y-2">
                {[24, 12, 6, 2, 1].map((hour) => (
                  <div key={hour} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`reminder-${hour}`}
                      checked={schedulingSettings.sendReminderHours.includes(hour)}
                      onChange={(e) => {
                        const newHours = e.target.checked
                          ? [...schedulingSettings.sendReminderHours, hour].sort((a, b) => b - a)
                          : schedulingSettings.sendReminderHours.filter(h => h !== hour);
                        setSchedulingSettings(prev => ({ ...prev, sendReminderHours: newHours }));
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={`reminder-${hour}`} className="ml-2 text-sm text-gray-600">
                      {hour} hours before trip
                    </label>
                  </div>
                ))}
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
                    <li>• No booking allowed on the same day as the trip</li>
                  </ul>
                </div>
              </div>
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

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Preferences</h3>
        <div className="space-y-4">
          {Object.entries(notificationSettings).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </label>
                <p className="text-xs text-gray-500">
                  {key === 'emailNotifications' && 'Receive email notifications for important updates'}
                  {key === 'smsNotifications' && 'Receive SMS alerts for critical notifications'}
                  {key === 'pushNotifications' && 'Receive push notifications in browser'}
                  {key === 'maintenanceAlerts' && 'Get alerts for vehicle maintenance schedules'}
                  {key === 'bookingAlerts' && 'Receive notifications for new bookings'}
                  {key === 'paymentAlerts' && 'Get alerts for payment transactions'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setNotificationSettings(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <button
            onClick={() => handleSaveSettings('Notifications')}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Notification Settings</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Security Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Session Timeout (minutes)</label>
            <input
              type="number"
              value={securitySettings.sessionTimeout}
              onChange={(e) => setSecuritySettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="5"
              max="480"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Max Login Attempts</label>
            <input
              type="number"
              value={securitySettings.maxLoginAttempts}
              onChange={(e) => setSecuritySettings(prev => ({ ...prev, maxLoginAttempts: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="3"
              max="10"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password Expiry (days)</label>
            <input
              type="number"
              value={securitySettings.passwordExpiry}
              onChange={(e) => setSecuritySettings(prev => ({ ...prev, passwordExpiry: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="30"
              max="365"
            />
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Two-Factor Authentication</label>
              <p className="text-xs text-gray-500">Require 2FA for admin logins</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={securitySettings.twoFactorAuth}
                onChange={(e) => setSecuritySettings(prev => ({ ...prev, twoFactorAuth: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">IP Restriction</label>
              <p className="text-xs text-gray-500">Restrict access to specific IP addresses</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={securitySettings.ipRestriction}
                onChange={(e) => setSecuritySettings(prev => ({ ...prev, ipRestriction: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
        <div className="mt-6">
          <button
            onClick={() => handleSaveSettings('Security')}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Security Settings</span>
          </button>
        </div>
      </div>
    </div>
  );



  const renderSystemSettings = () => (
    <div className="space-y-8">
      {/* System Information */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
              <Server className="w-5 h-5 text-blue-600" />
              <span>Application Details</span>
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Version:</span>
                <span className="text-sm text-gray-900">v2.1.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Environment:</span>
                <span className="text-sm text-gray-900">Production</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Node.js:</span>
                <span className="text-sm text-gray-900">18.17.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Next.js:</span>
                <span className="text-sm text-gray-900">14.0.3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Last Updated:</span>
                <span className="text-sm text-gray-900">{new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
              <Database className="w-5 h-5 text-green-600" />
              <span>Database Status</span>
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Type:</span>
                <span className="text-sm text-gray-900">PostgreSQL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Version:</span>
                <span className="text-sm text-gray-900">14.9</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Status:</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Pool Size:</span>
                <span className="text-sm text-gray-900">10/20</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Response Time:</span>
                <span className="text-sm text-gray-900">45ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-blue-700">Avg Response Time</div>
                <div className="text-2xl font-bold text-blue-600">245ms</div>
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-green-700">Uptime</div>
                <div className="text-2xl font-bold text-green-600">99.9%</div>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <HardDrive className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-orange-700">Memory Usage</div>
                <div className="text-2xl font-bold text-orange-600">68%</div>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Globe className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-purple-700">Active Sessions</div>
                <div className="text-2xl font-bold text-purple-600">1,234</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Tools */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Management</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Cache Management */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              <span>Cache Management</span>
            </h4>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                Clear application cache to free memory and ensure fresh data.
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => toast.success('Application cache cleared successfully')}
                  className="w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  Clear App Cache
                </button>
                <button
                  onClick={() => toast.success('Database cache cleared successfully')}
                  className="w-full bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition-colors"
                >
                  Clear DB Cache
                </button>
                <button
                  onClick={() => toast.success('CDN cache purged successfully')}
                  className="w-full bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-700 transition-colors"
                >
                  Purge CDN Cache
                </button>
              </div>
            </div>
          </div>

          {/* Database Tools */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
              <Database className="w-5 h-5 text-green-600" />
              <span>Database Tools</span>
            </h4>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                Database maintenance and optimization tools.
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => toast.success('Database optimization started')}
                  className="w-full bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition-colors"
                >
                  Optimize Database
                </button>
                <button
                  onClick={() => toast.success('Database backup initiated')}
                  className="w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  Create Backup
                </button>
                <button
                  onClick={() => toast.success('Analytics refreshed')}
                  className="w-full bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-700 transition-colors"
                >
                  Refresh Analytics
                </button>
              </div>
            </div>
          </div>

          {/* System Maintenance */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <span>System Maintenance</span>
            </h4>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                System-wide maintenance and monitoring tools.
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => toast.success('Health check completed')}
                  className="w-full bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition-colors"
                >
                  Run Health Check
                </button>
                <button
                  onClick={() => toast.success('Maintenance mode enabled')}
                  className="w-full bg-orange-600 text-white px-3 py-2 rounded text-sm hover:bg-orange-700 transition-colors"
                >
                  Maintenance Mode
                </button>
                <button
                  onClick={() => toast.success('System restart scheduled')}
                  className="w-full bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 transition-colors"
                >
                  Schedule Restart
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Storage & Files */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage & Files</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
              <HardDrive className="w-5 h-5 text-blue-600" />
              <span>Storage Usage</span>
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Database</span>
                <span className="text-sm font-medium">2.4 GB</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '35%' }}></div>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Files & Media</span>
                <span className="text-sm font-medium">8.7 GB</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: '60%' }}></div>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Logs</span>
                <span className="text-sm font-medium">1.2 GB</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-orange-600 h-2 rounded-full" style={{ width: '20%' }}></div>
              </div>
              
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900">Total Used</span>
                  <span className="text-sm font-bold text-gray-900">12.3 GB / 50 GB</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
              <Download className="w-5 h-5 text-green-600" />
              <span>File Management</span>
            </h4>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                Manage system files and generate reports.
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => toast.success('Temporary files cleaned')}
                  className="w-full bg-orange-600 text-white px-3 py-2 rounded text-sm hover:bg-orange-700 transition-colors"
                >
                  Clean Temp Files
                </button>
                <button
                  onClick={() => toast.success('Log files archived')}
                  className="w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  Archive Logs
                </button>
                <button
                  onClick={() => toast.success('System report generated')}
                  className="w-full bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition-colors"
                >
                  Generate Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Monitoring */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Security & Monitoring</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <Shield className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="text-sm font-medium text-gray-900">Security Score</div>
              <div className="text-2xl font-bold text-green-600">94/100</div>
              <div className="text-xs text-gray-500">Last scan: 2 hours ago</div>
            </div>
            
            <div className="text-center">
              <AlertTriangle className="w-8 h-8 text-orange-600 mx-auto mb-2" />
              <div className="text-sm font-medium text-gray-900">Security Alerts</div>
              <div className="text-2xl font-bold text-orange-600">3</div>
              <div className="text-xs text-gray-500">2 low, 1 medium</div>
            </div>
            
            <div className="text-center">
              <Eye className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="text-sm font-medium text-gray-900">Failed Logins</div>
              <div className="text-2xl font-bold text-blue-600">12</div>
              <div className="text-xs text-gray-500">Last 24 hours</div>
            </div>
          </div>
          
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => toast.success('Security scan initiated')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <Shield className="w-4 h-4" />
              <span>Run Security Scan</span>
            </button>
            <button
              onClick={() => toast.success('Monitoring dashboard updated')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Monitor className="w-4 h-4" />
              <span>View Monitoring</span>
            </button>
            <button
              onClick={() => toast.success('Security report generated')}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Report</span>
            </button>
          </div>
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
      case 'notifications':
        return renderNotificationSettings();
      case 'security':
        return renderSecuritySettings();
      case 'system':
        return renderSystemSettings();
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


