import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: string[];
  rate_limit: number;
  is_active: boolean;
  last_used?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

interface ApiConfig {
  id: string;
  setting_key: string;
  setting_value: any;
  description: string;
  category: 'rate_limiting' | 'cors' | 'webhook' | 'general' | 'api';
  is_active: boolean;
  updated_at: string;
}

interface CreateApiKeyData {
  name: string;
  permissions: string[];
  rate_limit?: number;
  expires_in_days?: number;
}

interface UpdateApiKeyData {
  name?: string;
  permissions?: string[];
  rate_limit?: number;
  is_active?: boolean;
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  is_active: boolean;
  last_triggered?: string;
  created_at: string;
}

// Available API permissions
const API_PERMISSIONS = [
  'routes.read',
  'routes.write',
  'schedules.read',
  'schedules.write',
  'bookings.read',
  'bookings.write',
  'users.read',
  'users.write',
  'payments.read',
  'payments.write',
  'analytics.read',
  'system.read'
];

// Default API settings
const DEFAULT_API_SETTINGS = {
  // Rate Limiting
  'rate_limit.default_requests_per_minute': 60,
  'rate_limit.burst_requests': 10,
  'rate_limit.window_minutes': 1,
  
  // CORS Settings
  'cors.allowed_origins': ['http://localhost:3000'],
  'cors.allowed_methods': ['GET', 'POST', 'PUT', 'DELETE'],
  'cors.allowed_headers': ['Content-Type', 'Authorization'],
  'cors.expose_headers': ['X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  'cors.credentials': true,
  'cors.max_age': 86400,
  
  // Webhook Settings
  'webhook.retry_attempts': 3,
  'webhook.retry_delay_seconds': 30,
  'webhook.timeout_seconds': 30,
  'webhook.signature_header': 'X-Webhook-Signature',
  
  // General API Settings
  'api.version': 'v1',
  'api.documentation_url': '/api/docs',
  'api.health_check_endpoint': '/api/health',
  'api.require_api_key': true,
  'api.log_requests': true,
  'api.log_responses': false
};

// GET - Fetch API settings, keys, or webhooks
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'settings'; // settings, keys, webhooks, permissions

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (type) {
      case 'keys':
        return await getApiKeys(supabase);
      
      case 'webhooks':
        return await getWebhooks(supabase);
      
      case 'permissions':
        return NextResponse.json({
          success: true,
          data: API_PERMISSIONS
        });
      
      case 'settings':
      default:
        return await getApiSettings(supabase);
    }

  } catch (error: any) {
    console.error('Error in API settings GET:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create API key, webhook, or update settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, type, ...data } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (type) {
      case 'api_key':
        return await createApiKey(supabase, data as CreateApiKeyData);
      
      case 'webhook':
        return await createWebhook(supabase, data);
      
      case 'settings':
        return await updateApiSettings(supabase, data);
      
      default:
        return NextResponse.json(
          { error: 'Invalid type specified' },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('Error in API settings POST:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update API key or webhook
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (type) {
      case 'api_key':
        return await updateApiKey(supabase, id, updateData as UpdateApiKeyData);
      
      case 'webhook':
        return await updateWebhook(supabase, id, updateData);
      
      default:
        return NextResponse.json(
          { error: 'Invalid type specified' },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('Error in API settings PUT:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete API key or webhook
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) {
      return NextResponse.json(
        { error: 'Type and ID are required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tableName = type === 'api_key' ? 'api_keys' : 'webhooks';
    
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: `Failed to delete ${type}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${type === 'api_key' ? 'API key' : 'Webhook'} deleted successfully`
    });

  } catch (error: any) {
    console.error('Error in API settings DELETE:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper Functions

async function getApiSettings(supabase: any) {
  const { data: settings, error } = await supabase
    .from('api_settings')
    .select('*')
    .order('category', { ascending: true });

  if (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API settings' },
      { status: 500 }
    );
  }

  // If no settings exist, create defaults
  if (!settings || settings.length === 0) {
    await initializeDefaultSettings(supabase);
    return await getApiSettings(supabase);
  }

  // Group settings by category
  const groupedSettings = settings.reduce((acc: any, setting: any) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {});

  return NextResponse.json({
    success: true,
    data: groupedSettings
  });
}

async function getApiKeys(supabase: any) {
  const { data: keys, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, permissions, rate_limit, is_active, last_used, expires_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: keys || []
  });
}

async function getWebhooks(supabase: any) {
  const { data: webhooks, error } = await supabase
    .from('webhooks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhooks' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: webhooks || []
  });
}

async function createApiKey(supabase: any, data: CreateApiKeyData) {
  const { name, permissions, rate_limit, expires_in_days } = data;

  // Validate permissions
  const invalidPermissions = permissions.filter(p => !API_PERMISSIONS.includes(p));
  if (invalidPermissions.length > 0) {
    return NextResponse.json(
      { error: `Invalid permissions: ${invalidPermissions.join(', ')}` },
      { status: 400 }
    );
  }

  // Generate API key
  const apiKey = generateApiKey();
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyPrefix = apiKey.substring(0, 8);

  // Calculate expiration date
  const expiresAt = expires_in_days 
    ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: newKey, error } = await supabase
    .from('api_keys')
    .insert({
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      permissions,
      rate_limit: rate_limit || 60,
      is_active: true,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ...newKey,
      api_key: apiKey // Only return the full key on creation
    },
    message: 'API key created successfully. Please save it securely as it won\'t be shown again.'
  });
}

async function updateApiKey(supabase: any, id: string, updateData: UpdateApiKeyData) {
  // Validate permissions if provided
  if (updateData.permissions) {
    const invalidPermissions = updateData.permissions.filter(p => !API_PERMISSIONS.includes(p));
    if (invalidPermissions.length > 0) {
      return NextResponse.json(
        { error: `Invalid permissions: ${invalidPermissions.join(', ')}` },
        { status: 400 }
      );
    }
  }

  const { data: updatedKey, error } = await supabase
    .from('api_keys')
    .update({
      ...updateData,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: updatedKey,
    message: 'API key updated successfully'
  });
}

async function createWebhook(supabase: any, data: any) {
  const { name, url, events, secret } = data;

  // Validate URL
  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook URL' },
      { status: 400 }
    );
  }

  const { data: webhook, error } = await supabase
    .from('webhooks')
    .insert({
      name,
      url,
      events: events || [],
      secret: secret || crypto.randomBytes(32).toString('hex'),
      is_active: true,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: webhook,
    message: 'Webhook created successfully'
  });
}

async function updateWebhook(supabase: any, id: string, updateData: any) {
  // Validate URL if provided
  if (updateData.url) {
    try {
      new URL(updateData.url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid webhook URL' },
        { status: 400 }
      );
    }
  }

  const { data: webhook, error } = await supabase
    .from('webhooks')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to update webhook' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: webhook,
    message: 'Webhook updated successfully'
  });
}

async function updateApiSettings(supabase: any, settings: any) {
  try {
    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      const { error } = await supabase
        .from('api_settings')
        .upsert({
          setting_key: key,
          setting_value: value,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        });

      if (error) {
        console.error(`Error updating setting ${key}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'API settings updated successfully'
    });

  } catch (error: any) {
    console.error('Error updating API settings:', error);
    return NextResponse.json(
      { error: 'Failed to update API settings' },
      { status: 500 }
    );
  }
}

async function initializeDefaultSettings(supabase: any) {
  const settingsToCreate = Object.entries(DEFAULT_API_SETTINGS).map(([key, value]) => {
    const categoryPrefix = key.split('.')[0];
    const category = categoryPrefix === 'api' ? 'general' : categoryPrefix as 'rate_limiting' | 'cors' | 'webhook' | 'general';
    return {
      setting_key: key,
      setting_value: value,
      description: getSettingDescription(key),
      category,
      is_active: true,
      updated_at: new Date().toISOString()
    };
  });

  await supabase
    .from('api_settings')
    .insert(settingsToCreate);
}

function generateApiKey(): string {
  return 'sk_' + crypto.randomBytes(32).toString('hex');
}

function getSettingDescription(key: string): string {
  const descriptions: Record<string, string> = {
    'rate_limit.default_requests_per_minute': 'Default rate limit for API requests per minute',
    'rate_limit.burst_requests': 'Number of burst requests allowed',
    'rate_limit.window_minutes': 'Rate limiting window in minutes',
    'cors.allowed_origins': 'Allowed CORS origins',
    'cors.allowed_methods': 'Allowed HTTP methods',
    'cors.allowed_headers': 'Allowed headers',
    'cors.expose_headers': 'Headers to expose to client',
    'cors.credentials': 'Allow credentials in CORS requests',
    'cors.max_age': 'CORS preflight cache time in seconds',
    'webhook.retry_attempts': 'Number of retry attempts for failed webhooks',
    'webhook.retry_delay_seconds': 'Delay between webhook retries in seconds',
    'webhook.timeout_seconds': 'Webhook request timeout in seconds',
    'webhook.signature_header': 'Header name for webhook signature',
    'api.version': 'Current API version',
    'api.documentation_url': 'API documentation URL',
    'api.health_check_endpoint': 'Health check endpoint path',
    'api.require_api_key': 'Require API key for requests',
    'api.log_requests': 'Log incoming API requests',
    'api.log_responses': 'Log API responses'
  };
  
  return descriptions[key] || 'API configuration setting';
} 