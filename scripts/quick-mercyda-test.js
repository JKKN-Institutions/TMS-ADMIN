// Quick MERCYDA API Test
// Run this for immediate troubleshooting

const credentials = {
  username: 'ats@jkkn.org',
  password: '123456'
};

async function quickTest() {
  console.log('🚀 Quick MERCYDA Connection Test');
  console.log('=================================\n');

  console.log(`📧 Username: ${credentials.username}`);
  console.log(`🔐 Password: ${'*'.repeat(credentials.password.length)}\n`);

  // Test the current endpoint we're using
  const currentUrl = 'https://console.mercydatrack.com/api/auth/login';
  
  console.log(`🔍 Testing Current Endpoint: ${currentUrl}`);
  
  try {
    const response = await fetch(currentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'JKKN-TMS/1.0'
      },
      body: JSON.stringify(credentials),
    });

    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📄 Headers:`, Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log(`📦 Raw Response: ${responseText}`);

    if (response.ok) {
      console.log('✅ SUCCESS: Authentication worked!');
      
      try {
        const data = JSON.parse(responseText);
        console.log('📋 Parsed Response:', JSON.stringify(data, null, 2));
        
        const token = data.token || data.access_token || data.authToken || data.sessionToken;
        if (token) {
          console.log(`🔑 Found Token: ${token.substring(0, 20)}...`);
        } else {
          console.log('⚠️  No token found in response');
        }
      } catch (parseError) {
        console.log('⚠️  Response is not JSON:', parseError.message);
      }
    } else {
      console.log(`❌ FAILED: ${response.status} ${response.statusText}`);
      console.log(`💬 Response: ${responseText}`);
      
      // Suggest alternatives
      console.log('\n🔧 TROUBLESHOOTING SUGGESTIONS:');
      console.log('1. Check if credentials are correct with MERCYDA support');
      console.log('2. Verify the correct API endpoint URL');
      console.log('3. Check if MERCYDA service is active for your account');
      console.log('4. Run the comprehensive diagnosis: node scripts/diagnose-mercyda-api.js');
    }

  } catch (error) {
    console.log(`💥 ERROR: ${error.message}`);
    
    if (error.message.includes('fetch')) {
      console.log('\n🌐 NETWORK ISSUE DETECTED:');
      console.log('• Check your internet connection');
      console.log('• Verify the base URL is correct');
      console.log('• Check if there are any firewall restrictions');
    }
  }

  // Test a few alternative endpoints quickly
  console.log('\n🔄 Testing Alternative Endpoints...');
  
  const alternatives = [
    'https://api.mercydatrack.com/login',
    'https://mercydatrack.com/api/login',
    'https://console.mercydatrack.com/login'
  ];

  for (const url of alternatives) {
    try {
      console.log(`\n📍 Testing: ${url}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      
      console.log(`   Status: ${response.status}`);
      if (response.ok) {
        console.log(`   🎉 POTENTIAL SUCCESS!`);
        const text = await response.text();
        console.log(`   Response: ${text.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
  }

  console.log('\n📞 CONTACT INFORMATION:');
  console.log('If none of these work, contact your transport manager or MERCYDA support to get:');
  console.log('• Correct API base URL');
  console.log('• Authentication endpoint');
  console.log('• Required authentication method');
  console.log('• Your account status and API access');
}

quickTest().catch(console.error); 