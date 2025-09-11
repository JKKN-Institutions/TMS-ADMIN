// MERCYDA GPS Connection Test Script
// Run this to test your GPS connection

const testMercydaConnection = async () => {
  console.log('🔄 Testing MERCYDA GPS Connection...\n');

  try {
    // Test 1: Basic Connection Test
    console.log('1️⃣ Testing MERCYDA API Connection...');
    const testResponse = await fetch('http://localhost:3000/api/admin/gps/mercyda-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'test' }),
    });

    const testResult = await testResponse.json();
    
    if (testResult.success) {
      console.log('✅ MERCYDA Connection: SUCCESS');
      console.log(`📡 Found ${testResult.data?.length || 0} vehicles`);
      
      if (testResult.data && testResult.data.length > 0) {
        console.log('\n📍 Vehicle Data:');
        testResult.data.forEach((vehicle, index) => {
          console.log(`   ${index + 1}. ${vehicle.name} (ID: ${vehicle.id})`);
          console.log(`      📍 Location: ${vehicle.latitude}, ${vehicle.longitude}`);
          console.log(`      🚗 Speed: ${vehicle.speed} km/h`);
          console.log(`      🔄 Status: ${vehicle.status}`);
          console.log(`      🕐 Updated: ${vehicle.timestamp}\n`);
        });
      }
    } else {
      console.log('❌ MERCYDA Connection: FAILED');
      console.log(`💬 Message: ${testResult.message}`);
      return false;
    }

    // Test 2: GPS Device Status
    console.log('\n2️⃣ Checking GPS Device Status...');
    const devicesResponse = await fetch('http://localhost:3000/api/admin/gps/devices');
    const devicesResult = await devicesResponse.json();
    
    if (devicesResult.success) {
      const mercydaDevice = devicesResult.data.find(device => device.device_id === 'MERCYDA001');
      
      if (mercydaDevice) {
        console.log('✅ MERCYDA Device Found:');
        console.log(`   🆔 Device ID: ${mercydaDevice.device_id}`);
        console.log(`   📛 Name: ${mercydaDevice.device_name}`);
        console.log(`   🟢 Status: ${mercydaDevice.status}`);
        console.log(`   💓 Last Heartbeat: ${mercydaDevice.last_heartbeat || 'Never'}`);
      } else {
        console.log('❌ MERCYDA Device: NOT FOUND');
        console.log('💡 Run the database setup script first');
        return false;
      }
    }

    // Test 3: Manual Sync Test
    console.log('\n3️⃣ Testing Manual Data Sync...');
    const syncResponse = await fetch('http://localhost:3000/api/admin/gps/mercyda-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sync' }),
    });

    const syncResult = await syncResponse.json();
    
    if (syncResult.success) {
      console.log('✅ Manual Sync: SUCCESS');
      console.log(`📊 Updated ${syncResult.details?.updated || 0} devices`);
      
      if (syncResult.details?.errors?.length > 0) {
        console.log('⚠️  Sync Warnings:');
        syncResult.details.errors.forEach(error => {
          console.log(`   • ${error}`);
        });
      }
    } else {
      console.log('❌ Manual Sync: FAILED');
      console.log(`💬 Message: ${syncResult.message}`);
    }

    // Test 4: Vehicle Assignment Check
    console.log('\n4️⃣ Checking Vehicle GPS Assignments...');
    const vehiclesResponse = await fetch('http://localhost:3000/api/admin/vehicles');
    const vehiclesResult = await vehiclesResponse.json();
    
    if (vehiclesResult.success) {
      const gpsVehicles = vehiclesResult.data.filter(vehicle => 
        vehicle.gps_device_id && vehicle.live_tracking_enabled
      );
      
      console.log(`🚗 Found ${gpsVehicles.length} vehicles with GPS tracking enabled`);
      
      gpsVehicles.forEach(vehicle => {
        console.log(`   • ${vehicle.registration_number} (${vehicle.model})`);
        console.log(`     📡 GPS Device: ${vehicle.gps_device_id}`);
        console.log(`     📍 Last Location: ${vehicle.current_latitude || 'N/A'}, ${vehicle.current_longitude || 'N/A'}`);
        console.log(`     🕐 Last Update: ${vehicle.last_gps_update || 'Never'}\n`);
      });
    }

    console.log('\n🎉 GPS Connection Test Complete!');
    return true;

  } catch (error) {
    console.error('\n❌ Test Failed with Error:');
    console.error(error.message);
    console.log('\n🔧 Troubleshooting Tips:');
    console.log('1. Check if your development server is running');
    console.log('2. Verify MERCYDA credentials are correct');
    console.log('3. Ensure database is properly configured');
    console.log('4. Check network connectivity');
    return false;
  }
};

// Run the test
testMercydaConnection(); 