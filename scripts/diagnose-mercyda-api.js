// MERCYDA API Diagnostic Tool
// This script tests various API endpoints and authentication methods

const credentials = {
  username: 'ats@jkkn.org',
  password: '123456'
};

// Possible base URLs for MERCYDA
const possibleBaseUrls = [
  'https://console.mercydatrack.com/api',
  'https://api.mercydatrack.com',
  'https://mercydatrack.com/api',
  'https://console.mercydatrack.com',
  'https://track.mercydatrack.com/api',
  'https://gps.mercydatrack.com/api'
];

// Possible authentication endpoints
const authEndpoints = [
  '/auth/login',
  '/login',
  '/authenticate',
  '/api/login',
  '/api/auth/login',
  '/user/login',
  '/account/login'
];

// Possible vehicle data endpoints
const vehicleEndpoints = [
  '/vehicles',
  '/vehicles/locations',
  '/tracking/vehicles',
  '/gps/vehicles',
  '/api/vehicles',
  '/vehicle/list',
  '/data/vehicles'
];

async function testEndpoint(url, method = 'GET', body = null, headers = {}) {
  try {
    console.log(`🔍 Testing: ${method} ${url}`);
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'JKKN-TMS-GPS-Client/1.0',
        ...headers
      }
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    console.log(`   ✅ Status: ${response.status} ${response.statusText}`);
    console.log(`   📦 Response: ${typeof responseData === 'object' ? JSON.stringify(responseData, null, 2) : responseData.substring(0, 200)}`);
    
    return {
      success: response.ok,
      status: response.status,
      data: responseData,
      headers: Object.fromEntries(response.headers.entries())
    };
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

async function testAuthentication(baseUrl, authEndpoint) {
  console.log(`\n🔐 Testing Authentication: ${baseUrl}${authEndpoint}`);
  
  // Test different authentication methods
  const authMethods = [
    // Standard JSON POST
    {
      name: 'JSON POST',
      method: 'POST',
      body: credentials,
      headers: { 'Content-Type': 'application/json' }
    },
    // Form data
    {
      name: 'Form Data',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      bodyString: `username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}`
    },
    // Basic Auth
    {
      name: 'Basic Auth',
      method: 'POST',
      headers: { 
        'Authorization': `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
      }
    },
    // GET with query parameters
    {
      name: 'GET with Query',
      method: 'GET',
      url: `${baseUrl}${authEndpoint}?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}`
    }
  ];

  for (const auth of authMethods) {
    console.log(`\n   🧪 Method: ${auth.name}`);
    
    let url = auth.url || `${baseUrl}${authEndpoint}`;
    let body = auth.bodyString || auth.body;
    
    const result = await testEndpoint(url, auth.method, body, auth.headers);
    
    if (result.success && result.data) {
      console.log(`   🎉 POSSIBLE SUCCESS with ${auth.name}!`);
      
      // Look for tokens in response
      const dataStr = JSON.stringify(result.data).toLowerCase();
      if (dataStr.includes('token') || dataStr.includes('key') || dataStr.includes('session')) {
        console.log(`   🔑 Response might contain authentication token!`);
      }
      
      return { method: auth, response: result };
    }
  }
  
  return null;
}

async function testVehicleEndpoints(baseUrl, token = null) {
  console.log(`\n🚗 Testing Vehicle Endpoints: ${baseUrl}`);
  
  for (const endpoint of vehicleEndpoints) {
    console.log(`\n   📍 Testing: ${endpoint}`);
    
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const result = await testEndpoint(`${baseUrl}${endpoint}`, 'GET', null, headers);
    
    if (result.success && result.data) {
      console.log(`   🎉 VEHICLE DATA FOUND!`);
      
      // Check if response looks like vehicle data
      const dataStr = JSON.stringify(result.data).toLowerCase();
      if (dataStr.includes('lat') || dataStr.includes('lon') || dataStr.includes('vehicle') || dataStr.includes('gps')) {
        console.log(`   🗺️  Response appears to contain GPS/Vehicle data!`);
        return { endpoint, response: result };
      }
    }
  }
  
  return null;
}

async function comprehensiveDiagnosis() {
  console.log('🔬 MERCYDA API Comprehensive Diagnosis');
  console.log('=====================================\n');
  
  console.log('📋 Testing Credentials:');
  console.log(`   Username: ${credentials.username}`);
  console.log(`   Password: ${credentials.password.replace(/./g, '*')}`);
  
  const results = {
    workingAuth: null,
    workingVehicles: null,
    allTests: []
  };

  // Test each base URL
  for (const baseUrl of possibleBaseUrls) {
    console.log(`\n🌐 Testing Base URL: ${baseUrl}`);
    console.log('=' .repeat(50));
    
    // First, test if the base URL is reachable
    const baseTest = await testEndpoint(baseUrl, 'GET');
    
    if (!baseTest.success && baseTest.error?.includes('fetch')) {
      console.log(`   ⚠️  Base URL unreachable, skipping...`);
      continue;
    }
    
    // Test authentication endpoints
    for (const authEndpoint of authEndpoints) {
      const authResult = await testAuthentication(baseUrl, authEndpoint);
      
      if (authResult) {
        console.log(`\n🎊 FOUND WORKING AUTHENTICATION!`);
        console.log(`   URL: ${baseUrl}${authEndpoint}`);
        console.log(`   Method: ${authResult.method.name}`);
        
        results.workingAuth = {
          baseUrl,
          endpoint: authEndpoint,
          method: authResult.method,
          response: authResult.response
        };
        
        // Try to extract token and test vehicle endpoints
        let token = null;
        const responseData = authResult.response.data;
        if (typeof responseData === 'object') {
          token = responseData.token || responseData.access_token || responseData.authToken || responseData.sessionToken;
        }
        
        if (token) {
          console.log(`   🔑 Extracted token: ${token.substring(0, 20)}...`);
          
          const vehicleResult = await testVehicleEndpoints(baseUrl, token);
          if (vehicleResult) {
            results.workingVehicles = {
              baseUrl,
              endpoint: vehicleResult.endpoint,
              token,
              response: vehicleResult.response
            };
            break;
          }
        }
      }
    }
    
    // If we found working auth, try vehicle endpoints without token too
    if (!results.workingVehicles) {
      const vehicleResult = await testVehicleEndpoints(baseUrl);
      if (vehicleResult) {
        results.workingVehicles = {
          baseUrl,
          endpoint: vehicleResult.endpoint,
          response: vehicleResult.response
        };
      }
    }
    
    // If we found both working auth and vehicle endpoints, we're done
    if (results.workingAuth && results.workingVehicles) {
      break;
    }
  }
  
  // Final report
  console.log('\n\n🎯 DIAGNOSIS RESULTS');
  console.log('====================');
  
  if (results.workingAuth) {
    console.log('✅ AUTHENTICATION: WORKING');
    console.log(`   🔗 URL: ${results.workingAuth.baseUrl}${results.workingAuth.endpoint}`);
    console.log(`   🔧 Method: ${results.workingAuth.method.name}`);
  } else {
    console.log('❌ AUTHENTICATION: FAILED');
    console.log('   🔍 Try contacting MERCYDA support for correct API details');
  }
  
  if (results.workingVehicles) {
    console.log('✅ VEHICLE DATA: ACCESSIBLE');
    console.log(`   🔗 URL: ${results.workingVehicles.baseUrl}${results.workingVehicles.endpoint}`);
    if (results.workingVehicles.token) {
      console.log(`   🔑 Requires Token: Yes`);
    }
  } else {
    console.log('❌ VEHICLE DATA: INACCESSIBLE');
  }
  
  // Generate code fix suggestions
  if (results.workingAuth || results.workingVehicles) {
    console.log('\n📝 SUGGESTED CODE UPDATES:');
    console.log('---------------------------');
    
    if (results.workingAuth) {
      console.log('// Update mercyda-tracking.ts with:');
      console.log(`const baseUrl = '${results.workingAuth.baseUrl}';`);
      console.log(`const authEndpoint = '${results.workingAuth.endpoint}';`);
      console.log(`const authMethod = '${results.workingAuth.method.name}';`);
    }
    
    if (results.workingVehicles) {
      console.log(`const vehicleEndpoint = '${results.workingVehicles.endpoint}';`);
    }
  }
  
  console.log('\n🏁 Diagnosis Complete!');
}

// Run the diagnosis
comprehensiveDiagnosis().catch(console.error); 