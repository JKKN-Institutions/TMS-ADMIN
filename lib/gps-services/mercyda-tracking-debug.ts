import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MercydaCredentials {
  username: string;
  password: string;
  baseUrl?: string;
  authEndpoint?: string;
  vehicleEndpoint?: string;
  authMethod?: 'json' | 'form' | 'basic' | 'query';
}

interface MercydaVehicle {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
  status: string;
}

interface MercydaResponse {
  success: boolean;
  data: MercydaVehicle[];
  message?: string;
  debug?: any;
}

export class MercydaTrackingDebugService {
  private credentials: MercydaCredentials;
  private baseUrl: string;
  private authEndpoint: string;
  private vehicleEndpoint: string;
  private authMethod: string;

  constructor(credentials: MercydaCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.baseUrl || 'https://console.mercydatrack.com';
    this.authEndpoint = credentials.authEndpoint || '/api/auth/login';
    this.vehicleEndpoint = credentials.vehicleEndpoint || '/api/vehicles';
    this.authMethod = credentials.authMethod || 'json';
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(config: Partial<MercydaCredentials>) {
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.authEndpoint) this.authEndpoint = config.authEndpoint;
    if (config.vehicleEndpoint) this.vehicleEndpoint = config.vehicleEndpoint;
    if (config.authMethod) this.authMethod = config.authMethod;
    
    console.log('🔧 Updated MERCYDA Config:', {
      baseUrl: this.baseUrl,
      authEndpoint: this.authEndpoint,
      vehicleEndpoint: this.vehicleEndpoint,
      authMethod: this.authMethod
    });
  }

  /**
   * Authenticate with detailed logging
   */
  async authenticate(): Promise<string | null> {
    let authUrl = `${this.baseUrl}${this.authEndpoint}`;
    
    console.log('🔐 MERCYDA Authentication Attempt:');
    console.log(`   URL: ${authUrl}`);
    console.log(`   Method: ${this.authMethod}`);
    console.log(`   Username: ${this.credentials.username}`);
    
    try {
      let requestOptions: any = {
        method: 'POST',
        headers: {}
      };

      // Configure authentication method
      switch (this.authMethod) {
        case 'json':
          requestOptions.headers['Content-Type'] = 'application/json';
          requestOptions.body = JSON.stringify({
            username: this.credentials.username,
            password: this.credentials.password,
          });
          break;
          
        case 'form':
          requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          requestOptions.body = `username=${encodeURIComponent(this.credentials.username)}&password=${encodeURIComponent(this.credentials.password)}`;
          break;
          
        case 'basic':
          requestOptions.headers['Authorization'] = `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64')}`;
          break;
          
        case 'query':
          requestOptions.method = 'GET';
          authUrl += `?username=${encodeURIComponent(this.credentials.username)}&password=${encodeURIComponent(this.credentials.password)}`;
          break;
      }

      requestOptions.headers['User-Agent'] = 'JKKN-TMS-GPS-Client/1.0';

      console.log('📡 Request Details:', {
        method: requestOptions.method,
        headers: requestOptions.headers,
        bodyType: typeof requestOptions.body
      });

      const response = await fetch(authUrl, requestOptions);
      
      console.log('📨 Response Details:');
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log(`   Raw Response: ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`);

      if (response.ok) {
        console.log('✅ Authentication SUCCESS');
        
        try {
          const data = JSON.parse(responseText);
          console.log('📋 Parsed JSON Response:', JSON.stringify(data, null, 2));
          
          // Try to extract token from various possible locations
          const token = data.token || 
                       data.access_token || 
                       data.authToken || 
                       data.sessionToken || 
                       data.jwt || 
                       data.accessToken ||
                       data.auth_token;
                       
          if (token) {
            console.log(`🔑 Extracted Token: ${token.substring(0, 20)}...`);
            return token;
          } else {
            console.log('⚠️  No token found in response');
            console.log('🔍 Available keys:', Object.keys(data));
            return null;
          }
        } catch (parseError: any) {
          console.log('⚠️  Response is not JSON, treating as token:', parseError.message);
          return responseText.trim();
        }
      } else {
        console.log('❌ Authentication FAILED');
        console.log(`💬 Error: ${response.status} ${response.statusText}`);
        console.log(`📄 Response: ${responseText}`);
        return null;
      }
    } catch (error) {
      console.error('💥 Authentication ERROR:', error);
      return null;
    }
  }

  /**
   * Fetch vehicle locations with detailed logging
   */
  async getVehicleLocations(token?: string): Promise<MercydaVehicle[]> {
    const vehicleUrl = `${this.baseUrl}${this.vehicleEndpoint}`;
    
    console.log('🚗 MERCYDA Vehicle Data Request:');
    console.log(`   URL: ${vehicleUrl}`);
    console.log(`   Token: ${token ? `${token.substring(0, 20)}...` : 'None'}`);

    try {
      if (!token) {
        console.log('🔐 No token provided, authenticating first...');
        const authToken = await this.authenticate();
        if (!authToken) {
          throw new Error('Failed to authenticate with MERCYDA service');
        }
        token = authToken;
      }

      const headers: any = {
        'User-Agent': 'JKKN-TMS-GPS-Client/1.0'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      console.log('📡 Vehicle Request Headers:', headers);

      const response = await fetch(vehicleUrl, {
        method: 'GET',
        headers
      });

      console.log('📨 Vehicle Response:');
      console.log(`   Status: ${response.status} ${response.statusText}`);

      const responseText = await response.text();
      console.log(`   Raw Response: ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`);

      if (response.ok) {
        console.log('✅ Vehicle data SUCCESS');
        
        try {
          const data = JSON.parse(responseText);
          console.log('📋 Parsed Vehicle Data:', JSON.stringify(data, null, 2));
          
          // Try to parse vehicle data from various response formats
          let vehicles = [];
          
          if (Array.isArray(data)) {
            vehicles = data;
          } else if (data.vehicles && Array.isArray(data.vehicles)) {
            vehicles = data.vehicles;
          } else if (data.data && Array.isArray(data.data)) {
            vehicles = data.data;
          } else if (data.result && Array.isArray(data.result)) {
            vehicles = data.result;
          }

          console.log(`🔢 Found ${vehicles.length} vehicles`);
          
          return vehicles.map(this.parseVehicleData);
        } catch (parseError: any) {
          console.log('⚠️  Vehicle response is not JSON:', parseError.message);
          return [];
        }
      } else {
        console.log('❌ Vehicle data FAILED');
        console.log(`💬 Error: ${response.status} ${response.statusText}`);
        return [];
      }
    } catch (error) {
      console.error('💥 Vehicle data ERROR:', error);
      return [];
    }
  }

  /**
   * Parse vehicle data from API response
   */
  private parseVehicleData(vehicleData: any): MercydaVehicle {
    return {
      id: vehicleData.id || vehicleData.vehicleId || vehicleData.device_id || String(Math.random()),
      name: vehicleData.name || vehicleData.vehicleName || vehicleData.device_name || 'Unknown Vehicle',
      latitude: parseFloat(vehicleData.latitude || vehicleData.lat || vehicleData.location?.lat || 0),
      longitude: parseFloat(vehicleData.longitude || vehicleData.lng || vehicleData.location?.lng || 0),
      speed: parseFloat(vehicleData.speed || vehicleData.velocity || 0),
      heading: parseFloat(vehicleData.heading || vehicleData.direction || vehicleData.bearing || 0),
      timestamp: vehicleData.timestamp || vehicleData.last_update || vehicleData.updated_at || new Date().toISOString(),
      status: vehicleData.status || vehicleData.state || 'unknown'
    };
  }

  /**
   * Test connection with detailed debugging
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any; debug?: any }> {
    console.log('\n🧪 MERCYDA CONNECTION TEST');
    console.log('==========================');
    
    const debug = {
      config: {
        baseUrl: this.baseUrl,
        authEndpoint: this.authEndpoint,
        vehicleEndpoint: this.vehicleEndpoint,
        authMethod: this.authMethod
      },
      steps: [] as string[]
    };

    try {
      debug.steps.push('Starting authentication...');
      const token = await this.authenticate();
      
      if (!token) {
        debug.steps.push('Authentication failed');
        return {
          success: false,
          message: 'Authentication failed. Check credentials and endpoint configuration.',
          debug
        };
      }

      debug.steps.push('Authentication successful, fetching vehicles...');
      const vehicles = await this.getVehicleLocations(token);
      debug.steps.push(`Found ${vehicles.length} vehicles`);
      
      return {
        success: true,
        message: `Successfully connected to MERCYDA. Found ${vehicles.length} vehicles.`,
        data: vehicles,
        debug
      };
    } catch (error) {
      debug.steps.push(`Error: ${error}`);
      return {
        success: false,
        message: `Connection test failed: ${error}`,
        debug
      };
    }
  }

  /**
   * Test multiple endpoint configurations
   */
  async testMultipleConfigurations(): Promise<any> {
    console.log('\n🔄 TESTING MULTIPLE CONFIGURATIONS');
    console.log('===================================');

    const configurations: Partial<MercydaCredentials>[] = [
      // Standard REST API patterns
      { baseUrl: 'https://console.mercydatrack.com', authEndpoint: '/login', authMethod: 'json' as const },
      { baseUrl: 'https://console.mercydatrack.com', authEndpoint: '/api/login', authMethod: 'json' as const },
      { baseUrl: 'https://console.mercydatrack.com', authEndpoint: '/auth/login', authMethod: 'json' as const },
      { baseUrl: 'https://console.mercydatrack.com', authEndpoint: '/authenticate', authMethod: 'json' as const },
      
      // Form-based authentication
      { baseUrl: 'https://console.mercydatrack.com', authEndpoint: '/login', authMethod: 'form' as const },
      { baseUrl: 'https://console.mercydatrack.com', authEndpoint: '/api/login', authMethod: 'form' as const },
      
      // Basic authentication
      { baseUrl: 'https://console.mercydatrack.com', authEndpoint: '/login', authMethod: 'basic' as const },
      { baseUrl: 'https://console.mercydatrack.com', authEndpoint: '/api/login', authMethod: 'basic' as const },
      
      // Alternative domains
      { baseUrl: 'https://api.mercydatrack.com', authEndpoint: '/login', authMethod: 'json' as const },
      { baseUrl: 'https://mercydatrack.com/api', authEndpoint: '/login', authMethod: 'json' as const },
    ];

    const results = [];

    for (const config of configurations) {
      console.log(`\n🧪 Testing Configuration:`, config);
      
      this.updateConfig(config);
      const result = await this.testConnection();
      
      results.push({
        config,
        result: {
          success: result.success,
          message: result.message,
          vehicleCount: result.data?.length || 0
        }
      });

      if (result.success) {
        console.log('🎉 FOUND WORKING CONFIGURATION!');
        break;
      }
    }

    return results;
  }
}

// Export debug service instance
export const mercydaDebugService = new MercydaTrackingDebugService({
  username: 'ats@jkkn.org',
  password: '123456'
}); 