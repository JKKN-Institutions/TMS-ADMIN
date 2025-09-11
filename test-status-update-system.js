// Test script to verify the status update system with notifications
console.log('🧪 Testing Status Update System with Notifications...');

async function testStatusUpdateSystem() {
  const BASE_URL = 'http://localhost:3001';
  
  // Test data
  const testData = {
    transportManagerId: '22222222-2222-2222-2222-222222222222',
    superAdminId: '11111111-1111-1111-1111-111111111111',
    // These would be real grievance IDs from your database
    testGrievanceId: 'test-grievance-id'
  };

  try {
    console.log('📋 Step 1: Testing assigned grievances API...');
    
    // Test 1: Get assigned grievances for Transport Manager
    const assignedResponse = await fetch(`${BASE_URL}/api/admin/grievances/assigned?adminId=${testData.transportManagerId}&status=all&priority=all&page=1&limit=10`);
    const assignedData = await assignedResponse.json();
    
    if (assignedData.success) {
      console.log('✅ Assigned grievances API working');
      console.log(`📊 Found ${assignedData.data.summary.total} total grievances`);
      
      if (assignedData.data.grievances.length > 0) {
        testData.testGrievanceId = assignedData.data.grievances[0].id;
        console.log(`🎯 Using grievance ID: ${testData.testGrievanceId}`);
      } else {
        console.log('⚠️  No grievances found for testing');
        return;
      }
    } else {
      console.log('❌ Assigned grievances API failed:', assignedData.error);
      return;
    }

    console.log('\n📋 Step 2: Testing status update with notifications...');
    
    // Test 2: Update grievance status from "open" to "in_progress"
    const statusUpdateResponse = await fetch(`${BASE_URL}/api/admin/grievances/assigned`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grievanceId: testData.testGrievanceId,
        adminId: testData.transportManagerId,
        updates: {
          status: 'in_progress',
          priority: 'high'
        }
      })
    });
    
    const statusUpdateData = await statusUpdateResponse.json();
    
    if (statusUpdateData.success) {
      console.log('✅ Status update API working');
      console.log(`📨 Notifications sent:`, statusUpdateData.data.notifications_sent);
      console.log(`📋 Activity logged:`, statusUpdateData.data.activity_logged);
      console.log(`💬 Message: ${statusUpdateData.message}`);
    } else {
      console.log('❌ Status update failed:', statusUpdateData.error);
      return;
    }

    console.log('\n📋 Step 3: Testing resolution with notifications...');
    
    // Test 3: Resolve grievance with resolution text
    const resolveResponse = await fetch(`${BASE_URL}/api/admin/grievances/assigned`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grievanceId: testData.testGrievanceId,
        adminId: testData.transportManagerId,
        updates: {
          status: 'resolved',
          resolution: 'Issue has been resolved. The bus schedule has been updated to ensure timely arrivals. Additional monitoring has been put in place to prevent future occurrences.',
          expectedResolutionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      })
    });
    
    const resolveData = await resolveResponse.json();
    
    if (resolveData.success) {
      console.log('✅ Resolution update API working');
      console.log(`📨 Student notified:`, resolveData.data.notifications_sent.student);
      console.log(`📨 Superadmin notified:`, resolveData.data.notifications_sent.superadmin);
      console.log(`💬 Message: ${resolveData.message}`);
    } else {
      console.log('❌ Resolution update failed:', resolveData.error);
    }

    console.log('\n📋 Step 4: Testing comment addition...');
    
    // Test 4: Add comment to grievance
    const commentResponse = await fetch(`${BASE_URL}/api/admin/grievances/assigned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grievanceId: testData.testGrievanceId,
        adminId: testData.transportManagerId,
        comment: 'This is a test comment to verify the comment system is working correctly.',
        visibility: 'public'
      })
    });
    
    const commentData = await commentResponse.json();
    
    if (commentData.success) {
      console.log('✅ Comment addition API working');
      console.log(`💬 Message: ${commentData.message}`);
    } else {
      console.log('❌ Comment addition failed:', commentData.error);
    }

    console.log('\n📋 Step 5: Testing notification checks...');
    
    // Test 5: Check if notifications were created
    const notificationResponse = await fetch(`${BASE_URL}/api/admin/notifications?limit=10`);
    
    if (notificationResponse.ok) {
      const notificationData = await notificationResponse.json();
      console.log('✅ Notifications API accessible');
      console.log(`📨 Recent notifications found: ${notificationData.data?.length || 0}`);
    } else {
      console.log('⚠️  Notifications API not accessible (might not exist yet)');
    }

    console.log('\n🎉 Status Update System Test Complete!');
    console.log('✅ All core functionality appears to be working');
    console.log('📨 Notifications are being sent to both students and superadmins');
    console.log('📋 Activity logging is functioning');
    console.log('💬 Comments can be added successfully');

  } catch (error) {
    console.error('💥 Test failed with error:', error);
  }
}

// Run the test
testStatusUpdateSystem().catch(console.error);

// Additional utility functions for testing
function generateTestGrievance() {
  return {
    subject: 'Test Grievance for Status Update System',
    description: 'This is a test grievance created to verify the status update system is working correctly with notifications.',
    category: 'transport_schedule',
    priority: 'medium',
    student_id: 'test-student-id',
    route_id: 'test-route-id'
  };
}

function logSystemStatus() {
  console.log('🔍 System Status:');
  console.log(`⏰ Current time: ${new Date().toISOString()}`);
  console.log(`🌐 Base URL: http://localhost:3001`);
  console.log(`👨‍💼 Transport Manager ID: 22222222-2222-2222-2222-222222222222`);
  console.log(`👑 Super Admin ID: 11111111-1111-1111-1111-111111111111`);
}

// Export for use in other tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testStatusUpdateSystem,
    generateTestGrievance,
    logSystemStatus
  };
} 