// Test Multiple MERCYDA API Configurations
// This script systematically tests different endpoint combinations

import { mercydaDebugService } from '../lib/gps-services/mercyda-tracking-debug.js';

console.log('🔄 MERCYDA API Configuration Testing');
console.log('====================================\n');

async function testAllConfigurations() {
  console.log('🎯 Starting comprehensive endpoint testing...\n');
  
  try {
    const results = await mercydaDebugService.testMultipleConfigurations();
    
    console.log('\n📊 FINAL RESULTS SUMMARY');
    console.log('=========================');
    
    let foundWorking = false;
    
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. Configuration:`);
      console.log(`   Base URL: ${result.config.baseUrl}`);
      console.log(`   Auth Endpoint: ${result.config.authEndpoint}`);
      console.log(`   Auth Method: ${result.config.authMethod}`);
      console.log(`   Result: ${result.result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      
      if (result.result.success) {
        console.log(`   🎉 WORKING CONFIGURATION FOUND!`);
        console.log(`   📊 Vehicles: ${result.result.vehicleCount}`);
        foundWorking = true;
      } else {
        console.log(`   💬 Message: ${result.result.message}`);
      }
    });
    
    if (foundWorking) {
      console.log('\n🎊 SUCCESS! Working configuration found.');
      console.log('💡 You can now update your MERCYDA service with the correct endpoints.');
    } else {
      console.log('\n😞 No working configuration found.');
      console.log('📞 Contact MERCYDA support for the correct API details.');
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

// Run the test
testAllConfigurations(); 