'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  Key,
  Settings,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Save,
  X,
  Shield,
  Zap,
  Webhook,
  Clock,
  Monitor,
  Link,
  Database
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  rate_limit: number;
  is_active: boolean;
  last_used?: string;
  expires_at?: string;
  created_at: string;
}

interface ApiSettings {
  rate_limiting: any[];
  cors: any[];
  webhook: any[];
  general: any[];
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  last_triggered?: string;
  created_at: string;
}

interface CreateApiKeyForm {
  name: string;
  permissions: string[];
  rate_limit: number;
  expires_in_days: number;
}

interface CreateWebhookForm {
  name: string;
  url: string;
  events: string[];
  secret: string;
}

const ApiSettings = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Data states
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [settings, setSettings] = useState<ApiSettings>({
    rate_limiting: [],
    cors: [],
    webhook: [],
    general: []
  });
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  
  // Modal states
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showCreateWebhookModal, setShowCreateWebhookModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null);
  const [copiedText, setCopiedText] = useState('');
  
  // Form states
  const [createKeyForm, setCreateKeyForm] = useState<CreateApiKeyForm>({
    name: '',
    permissions: [],
    rate_limit: 60,
    expires_in_days: 0
  });
  
  const [createWebhookForm, setCreateWebhookForm] = useState<CreateWebhookForm>({
    name: '',
    url: '',
    events: [],
    secret: ''
  });

  // Temporary settings state for editing
  const [tempSettings, setTempSettings] = useState<any>({});

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSettings(),
        fetchApiKeys(),
        fetchWebhooks(),
        fetchPermissions()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load API settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/api-settings?type=settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      
      const result = await response.json();
      setSettings(result.data || {});
      
      // Initialize temp settings for editing
      const flatSettings: any = {};
      Object.values(result.data || {}).flat().forEach((setting: any) => {
        flatSettings[setting.setting_key] = setting.setting_value;
      });
      setTempSettings(flatSettings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      throw error;
    }
  };

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/admin/api-settings?type=keys');
      if (!response.ok) throw new Error('Failed to fetch API keys');
      
      const result = await response.json();
      setApiKeys(result.data || []);
    } catch (error) {
      console.error('Error fetching API keys:', error);
      throw error;
    }
  };

  const fetchWebhooks = async () => {
    try {
      const response = await fetch('/api/admin/api-settings?type=webhooks');
      if (!response.ok) throw new Error('Failed to fetch webhooks');
      
      const result = await response.json();
      setWebhooks(result.data || []);
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      throw error;
    }
  };

  const fetchPermissions = async () => {
    try {
      const response = await fetch('/api/admin/api-settings?type=permissions');
      if (!response.ok) throw new Error('Failed to fetch permissions');
      
      const result = await response.json();
      setPermissions(result.data || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      throw error;
    }
  };

  const handleCreateApiKey = async () => {
    try {
      const response = await fetch('/api/admin/api-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'api_key',
          ...createKeyForm,
          expires_in_days: createKeyForm.expires_in_days || undefined
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('API key created successfully');
        setShowCreateKeyModal(false);
        resetCreateKeyForm();
        fetchApiKeys();
        
        // Show the new API key in a modal
        setSelectedKey({ ...result.data, api_key: result.data.api_key });
        setShowKeyModal(true);
      } else {
        toast.error(result.error || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    }
  };

  const handleCreateWebhook = async () => {
    try {
      const response = await fetch('/api/admin/api-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'webhook',
          ...createWebhookForm
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Webhook created successfully');
        setShowCreateWebhookModal(false);
        resetCreateWebhookForm();
        fetchWebhooks();
      } else {
        toast.error(result.error || 'Failed to create webhook');
      }
    } catch (error) {
      console.error('Error creating webhook:', error);
      toast.error('Failed to create webhook');
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;

    try {
      const response = await fetch(`/api/admin/api-settings?type=api_key&id=${keyId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('API key deleted successfully');
        fetchApiKeys();
      } else {
        toast.error(result.error || 'Failed to delete API key');
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const response = await fetch(`/api/admin/api-settings?type=webhook&id=${webhookId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Webhook deleted successfully');
        fetchWebhooks();
      } else {
        toast.error(result.error || 'Failed to delete webhook');
      }
    } catch (error) {
      console.error('Error deleting webhook:', error);
      toast.error('Failed to delete webhook');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/api-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'settings',
          ...tempSettings
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Settings saved successfully');
        fetchSettings();
      } else {
        toast.error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedText(''), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const resetCreateKeyForm = () => {
    setCreateKeyForm({
      name: '',
      permissions: [],
      rate_limit: 60,
      expires_in_days: 0
    });
  };

  const resetCreateWebhookForm = () => {
    setCreateWebhookForm({
      name: '',
      url: '',
      events: [],
      secret: ''
    });
  };

  const togglePermission = (permission: string, isKey = true) => {
    if (isKey) {
      setCreateKeyForm(prev => ({
        ...prev,
        permissions: prev.permissions.includes(permission)
          ? prev.permissions.filter(p => p !== permission)
          : [...prev.permissions, permission]
      }));
    } else {
      setCreateWebhookForm(prev => ({
        ...prev,
        events: prev.events.includes(permission)
          ? prev.events.filter(e => e !== permission)
          : [...prev.events, permission]
      }));
    }
  };

  const updateTempSetting = (key: string, value: any) => {
    setTempSettings((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
  };

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Monitor },
    { id: 'keys', name: 'API Keys', icon: Key },
    { id: 'rate-limiting', name: 'Rate Limiting', icon: Zap },
    { id: 'cors', name: 'CORS', icon: Globe },
    { id: 'webhooks', name: 'Webhooks', icon: Webhook },
    { id: 'general', name: 'General', icon: Settings }
  ];

  const webhookEvents = [
    'user.created',
    'user.updated',
    'user.deleted',
    'booking.created',
    'booking.updated',
    'booking.cancelled',
    'payment.processed',
    'payment.failed',
    'schedule.created',
    'schedule.updated'
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading API settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">API Settings</h2>
          <p className="text-gray-600 mt-1">Manage API keys, rate limits, CORS, and webhook configurations</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchAllData}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 overflow-x-auto">
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

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-gray-200">
        {activeTab === 'overview' && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Key className="w-8 h-8 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{apiKeys.length}</div>
                    <div className="text-sm text-blue-700">API Keys</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {apiKeys.filter(k => k.is_active).length}
                    </div>
                    <div className="text-sm text-green-700">Active Keys</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Webhook className="w-8 h-8 text-purple-600" />
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{webhooks.length}</div>
                    <div className="text-sm text-purple-700">Webhooks</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Zap className="w-8 h-8 text-orange-600" />
                  <div>
                    <div className="text-2xl font-bold text-orange-600">
                      {tempSettings['rate_limit.default_requests_per_minute'] || 60}
                    </div>
                    <div className="text-sm text-orange-700">Rate Limit/min</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent API Keys</h3>
                <div className="space-y-3">
                  {apiKeys.slice(0, 3).map((key) => (
                    <div key={key.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">{key.name}</div>
                        <div className="text-sm text-gray-500">
                          {key.key_prefix}... • {key.permissions.length} permissions • {key.rate_limit} req/min
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(key.is_active)}`}>
                        {key.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Webhooks</h3>
                <div className="space-y-3">
                  {webhooks.slice(0, 3).map((webhook) => (
                    <div key={webhook.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">{webhook.name}</div>
                        <div className="text-sm text-gray-500">
                          {webhook.url} • {webhook.events.length} events
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(webhook.is_active)}`}>
                        {webhook.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'keys' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">API Keys</h3>
              <button
                onClick={() => setShowCreateKeyModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create API Key</span>
              </button>
            </div>

            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div key={key.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{key.name}</h4>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(key.is_active)}`}>
                          {key.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>Key: {key.key_prefix}...</span>
                          <span>Rate Limit: {key.rate_limit} req/min</span>
                          <span>Permissions: {key.permissions.length}</span>
                        </div>
                        
                        {key.expires_at && (
                          <div className="text-sm text-orange-600">
                            Expires: {formatDate(key.expires_at)}
                          </div>
                        )}
                        
                        <div className="text-sm text-gray-500">
                          Created: {formatDate(key.created_at)}
                          {key.last_used && ` • Last used: ${formatDate(key.last_used)}`}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDeleteApiKey(key.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Delete API key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {apiKeys.length === 0 && (
                <div className="text-center py-8">
                  <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
                  <p className="text-gray-500 mb-4">Create your first API key to get started with the API.</p>
                  <button
                    onClick={() => setShowCreateKeyModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create API Key
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {(activeTab === 'rate-limiting' || activeTab === 'cors' || activeTab === 'general') && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {activeTab === 'rate-limiting' ? 'Rate Limiting Settings' :
                 activeTab === 'cors' ? 'CORS Settings' : 'General API Settings'}
              </h3>
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>

            <div className="space-y-6">
              {settings[activeTab as keyof ApiSettings]?.map((setting: any) => (
                <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 mb-1">
                        {setting.setting_key.split('.').pop()?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </h4>
                      <p className="text-sm text-gray-500 mb-3">{setting.description}</p>
                      
                      <div className="max-w-md">
                        {typeof setting.setting_value === 'boolean' ? (
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={tempSettings[setting.setting_key] || false}
                              onChange={(e) => updateTempSetting(setting.setting_key, e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            <span className="ml-2 text-sm text-gray-700">
                              {tempSettings[setting.setting_key] ? 'Enabled' : 'Disabled'}
                            </span>
                          </label>
                        ) : Array.isArray(setting.setting_value) ? (
                          <textarea
                            value={Array.isArray(tempSettings[setting.setting_key]) 
                              ? tempSettings[setting.setting_key].join('\n')
                              : (tempSettings[setting.setting_key] || '').toString()}
                            onChange={(e) => updateTempSetting(setting.setting_key, e.target.value.split('\n').filter(Boolean))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={3}
                            placeholder="Enter one value per line"
                          />
                        ) : typeof setting.setting_value === 'number' ? (
                          <input
                            type="number"
                            value={tempSettings[setting.setting_key] || 0}
                            onChange={(e) => updateTempSetting(setting.setting_key, parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <input
                            type="text"
                            value={tempSettings[setting.setting_key] || ''}
                            onChange={(e) => updateTempSetting(setting.setting_key, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Webhooks</h3>
              <button
                onClick={() => setShowCreateWebhookModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Webhook</span>
              </button>
            </div>

            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{webhook.name}</h4>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(webhook.is_active)}`}>
                          {webhook.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      <div className="mt-2 space-y-1">
                        <div className="text-sm text-gray-500">
                          URL: {webhook.url}
                        </div>
                        <div className="text-sm text-gray-500">
                          Events: {webhook.events.join(', ')}
                        </div>
                        <div className="text-sm text-gray-500">
                          Created: {formatDate(webhook.created_at)}
                          {webhook.last_triggered && ` • Last triggered: ${formatDate(webhook.last_triggered)}`}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Delete webhook"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {webhooks.length === 0 && (
                <div className="text-center py-8">
                  <Webhook className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Webhooks</h3>
                  <p className="text-gray-500 mb-4">Create your first webhook to receive real-time notifications.</p>
                  <button
                    onClick={() => setShowCreateWebhookModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create Webhook
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create API Key Modal */}
      <AnimatePresence>
        {showCreateKeyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Create API Key</h2>
                <button
                  onClick={() => {
                    setShowCreateKeyModal(false);
                    resetCreateKeyForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                  <input
                    type="text"
                    value={createKeyForm.name}
                    onChange={(e) => setCreateKeyForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter a descriptive name for this API key"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Rate Limit (requests/minute)</label>
                    <input
                      type="number"
                      value={createKeyForm.rate_limit}
                      onChange={(e) => setCreateKeyForm(prev => ({ ...prev, rate_limit: parseInt(e.target.value) || 60 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                      max="1000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Expires in (days, 0 = never)</label>
                    <input
                      type="number"
                      value={createKeyForm.expires_in_days}
                      onChange={(e) => setCreateKeyForm(prev => ({ ...prev, expires_in_days: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max="365"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {permissions.map((permission) => (
                      <label key={permission} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={createKeyForm.permissions.includes(permission)}
                          onChange={() => togglePermission(permission, true)}
                          className="rounded border-gray-300"
                        />
                        <span className="ml-2 text-sm text-gray-700">{permission}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowCreateKeyModal(false);
                    resetCreateKeyForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateApiKey}
                  disabled={!createKeyForm.name || createKeyForm.permissions.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>Create API Key</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Webhook Modal */}
      <AnimatePresence>
        {showCreateWebhookModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Create Webhook</h2>
                <button
                  onClick={() => {
                    setShowCreateWebhookModal(false);
                    resetCreateWebhookForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                  <input
                    type="text"
                    value={createWebhookForm.name}
                    onChange={(e) => setCreateWebhookForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter a descriptive name for this webhook"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Webhook URL *</label>
                  <input
                    type="url"
                    value={createWebhookForm.url}
                    onChange={(e) => setCreateWebhookForm(prev => ({ ...prev, url: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://your-domain.com/webhook"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Secret (optional)</label>
                  <input
                    type="text"
                    value={createWebhookForm.secret}
                    onChange={(e) => setCreateWebhookForm(prev => ({ ...prev, secret: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave empty to auto-generate"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Events to Subscribe</label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {webhookEvents.map((event) => (
                      <label key={event} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={createWebhookForm.events.includes(event)}
                          onChange={() => togglePermission(event, false)}
                          className="rounded border-gray-300"
                        />
                        <span className="ml-2 text-sm text-gray-700">{event}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowCreateWebhookModal(false);
                    resetCreateWebhookForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWebhook}
                  disabled={!createWebhookForm.name || !createWebhookForm.url}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>Create Webhook</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* API Key Display Modal */}
      <AnimatePresence>
        {showKeyModal && selectedKey && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-lg"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">API Key Created</h2>
                <button
                  onClick={() => {
                    setShowKeyModal(false);
                    setSelectedKey(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-yellow-800">Important!</p>
                      <p className="text-yellow-700 text-sm">
                        Copy this API key now. For security reasons, it won't be shown again.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={(selectedKey as any).api_key || ''}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                    />
                    <button
                      onClick={() => copyToClipboard((selectedKey as any).api_key || '', 'API Key')}
                      className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {copiedText === 'API Key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Name:</span>
                    <div className="text-gray-900">{selectedKey.name}</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Rate Limit:</span>
                    <div className="text-gray-900">{selectedKey.rate_limit} req/min</div>
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-gray-700">Permissions:</span>
                    <div className="text-gray-900">{selectedKey.permissions.join(', ')}</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowKeyModal(false);
                    setSelectedKey(null);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ApiSettings; 