// Test Direct GPS Tracking Without MERCYDA API
// This script tests various direct GPS tracking methods

console.log('🛰️ Direct GPS Tracking Test');
console.log('===========================\n');

const API_BASE = 'http://localhost:3000/api/admin/gps/direct-tracking';

async function testDirectGPSTracking() {
  console.log('🎯 Testing direct GPS tracking methods...\n');

  try {
    // Test 1: Check available tracking methods
    console.log('1️⃣ Checking available tracking methods...');
    const statusResponse = await fetch(API_BASE);
    const statusResult = await statusResponse.json();
    
    if (statusResult.success) {
      console.log('✅ Direct tracking available');
      console.log(`📱 Devices with SIM: ${statusResult.data.devices_with_sim}`);
      console.log('📋 Available methods:', statusResult.data.available_methods);
      console.log('🔧 Server status:', statusResult.data.server_status);
      
      if (statusResult.data.devices.length > 0) {
        console.log('\n📱 GPS Devices with SIM cards:');
        statusResult.data.devices.forEach((device, index) => {
          console.log(`   ${index + 1}. ${device.device_name} (${device.device_id})`);
          console.log(`      📞 SIM: ${device.sim_number || 'Not configured'}`);
          console.log(`      📋 IMEI: ${device.has_imei ? 'Available' : 'Not set'}`);
        });
      } else {
        console.log('⚠️  No GPS devices with SIM numbers found');
        console.log('💡 Add SIM numbers to your GPS devices first');
      }
    } else {
      console.log('❌ Direct tracking not available');
      return;
    }

    // Test 2: Start TCP/UDP servers for direct connections
    console.log('\n2️⃣ Starting TCP/UDP servers...');
    const serverResponse = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_tcp_server' })
    });
    
    const serverResult = await serverResponse.json();
    if (serverResult.success) {
      console.log('✅ GPS servers started');
      console.log(`🔌 TCP Port: ${serverResult.ports.tcp}`);
      console.log(`🔌 UDP Port: ${serverResult.ports.udp}`);
      console.log('📡 Ready to receive direct GPS connections');
    } else {
      console.log('❌ Failed to start GPS servers');
    }

    // Test 3: List devices with SIM cards
    console.log('\n3️⃣ Listing GPS devices with SIM cards...');
    const devicesResponse = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_sms_devices' })
    });
    
    const devicesResult = await devicesResponse.json();
    if (devicesResult.success) {
      console.log(`✅ Found ${devicesResult.count} devices with SIM cards`);
      
      if (devicesResult.devices.length > 0) {
        const testDevice = devicesResult.devices[0];
        console.log(`🎯 Using test device: ${testDevice.device_name} (${testDevice.device_id})`);

        // Test 4: Request location via SMS
        console.log('\n4️⃣ Testing SMS location request...');
        const smsResponse = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'sms_location',
            deviceId: testDevice.device_id
          })
        });
        
        const smsResult = await smsResponse.json();
        if (smsResult.success && smsResult.location) {
          console.log('✅ SMS location request successful');
          console.log(`📍 Location: ${smsResult.location.latitude}, ${smsResult.location.longitude}`);
          console.log(`🚗 Speed: ${smsResult.location.speed} km/h`);
          console.log(`🧭 Heading: ${smsResult.location.heading}°`);
          console.log(`🕐 Time: ${smsResult.location.timestamp}`);
        } else {
          console.log('❌ SMS location request failed');
          console.log(`💬 Message: ${smsResult.message}`);
        }

        // Test 5: Enable real-time tracking
        console.log('\n5️⃣ Testing real-time tracking activation...');
        const realtimeResponse = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'enable_realtime',
            deviceId: testDevice.device_id
          })
        });
        
        const realtimeResult = await realtimeResponse.json();
        if (realtimeResult.success) {
          console.log('✅ Real-time tracking enabled');
          console.log(`💬 Message: ${realtimeResult.message}`);
        } else {
          console.log('❌ Real-time tracking failed');
          console.log(`💬 Message: ${realtimeResult.message}`);
        }

      } else {
        console.log('⚠️  No devices available for testing');
      }
    }

    // Test 6: Test device configuration (if you have server IP)
    const serverIP = '192.168.1.100'; // Replace with your actual server IP
    console.log('\n6️⃣ Testing device configuration...');
    console.log(`🌐 Using server IP: ${serverIP}`);
    
    if (devicesResult.devices.length > 0 && devicesResult.devices[0].sim_number) {
      const configResponse = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'configure_device',
          phoneNumber: devicesResult.devices[0].sim_number,
          serverIP: serverIP
        })
      });
      
      const configResult = await configResponse.json();
      if (configResult.success) {
        console.log('✅ Device configuration sent');
        console.log('📱 SMS configuration commands sent to GPS device');
        console.log('⏱️  Wait 2-3 minutes for device to connect directly');
      } else {
        console.log('❌ Device configuration failed');
        console.log(`💬 Message: ${configResult.message}`);
      }
    } else {
      console.log('⚠️  Skipping device configuration (no SIM number)');
    }

    console.log('\n🎉 Direct GPS tracking test completed!');
    
    // Summary
    console.log('\n📊 TEST SUMMARY');
    console.log('================');
    console.log('✅ Available tracking methods:');
    console.log('   • SMS Commands (send SMS to get location)');
    console.log('   • TCP/UDP Direct Connection (device sends data to your server)');
    console.log('   • Real-time tracking (automatic location updates)');
    console.log('   • Device configuration (setup GPS device remotely)');
    
    console.log('\n💡 NEXT STEPS:');
    console.log('1. Add SIM numbers to your GPS devices in the admin panel');
    console.log('2. Configure SMS service (Twilio, TextBelt, or local gateway)');
    console.log('3. Test SMS commands with your actual GPS device');
    console.log('4. Configure GPS device to send data directly to your server');
    console.log('5. Set up port forwarding if needed (ports 8888/8889)');

  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

// Test SMS commands for different GPS device types
async function testSMSCommands() {
  console.log('\n📱 COMMON GPS SMS COMMANDS TO TRY');
  console.log('===================================');
  
  const commonCommands = {
    'Location Request': ['where', 'location', 'loc', 'position', 'G123456#'],
    'Real-time ON': ['monitor on', 'track on', 'auto on', 'T030S***'],
    'Real-time OFF': ['monitor off', 'track off', 'auto off', 'notn'],
    'Device Status': ['status', 'check', 'info', 'bat'],
    'Configuration': ['apn internet', 'server IP PORT', 'timer 30']
  };

  Object.entries(commonCommands).forEach(([category, commands]) => {
    console.log(`\n${category}:`);
    commands.forEach(cmd => console.log(`   📤 "${cmd}"`));
  });

  console.log('\n⚠️  IMPORTANT NOTES:');
  console.log('• SMS commands vary by GPS device manufacturer');
  console.log('• Some devices require a password (usually 123456 or 000000)');
  console.log('• Wait 30-60 seconds for GPS device response');
  console.log('• Ensure GPS device has active SIM card with SMS capability');
  console.log('• Test commands manually first using your phone');
}

// Run tests
testDirectGPSTracking().then(() => {
  testSMSCommands();
}).catch(console.error); 