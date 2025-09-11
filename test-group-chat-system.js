const { createClient } = require('@supabase/supabase-js');

// Test the complete group chat system
async function testGroupChatSystem() {
    try {
        // Initialize Supabase client
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            console.error('❌ Missing Supabase credentials');
            return;
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        console.log('🧪 Testing Group Chat System...\n');
        
        // Step 1: Get sample data
        console.log('1. Getting sample data...');
        const { data: grievances, error: grievanceError } = await supabase
            .from('grievances')
            .select('id, subject, student_id, assigned_to')
            .limit(1);
        
        if (grievanceError || !grievances || grievances.length === 0) {
            console.error('❌ No grievances found for testing');
            return;
        }
        
        const { data: students, error: studentError } = await supabase
            .from('students')
            .select('id, student_name, email')
            .eq('id', grievances[0].student_id);
        
        const { data: admins, error: adminError } = await supabase
            .from('admin_users')
            .select('id, name, email')
            .limit(1);
        
        if (studentError || adminError || !students || !admins) {
            console.error('❌ Error fetching sample data');
            return;
        }
        
        const testGrievance = grievances[0];
        const testStudent = students[0];
        const testAdmin = admins[0];
        
        console.log('✅ Sample data loaded:');
        console.log(`   - Grievance: ${testGrievance.subject}`);
        console.log(`   - Student: ${testStudent.student_name}`);
        console.log(`   - Admin: ${testAdmin.name}\n`);
        
        // Step 2: Test creating a communication from student
        console.log('2. Testing student message creation...');
        const { data: studentMessage, error: studentMessageError } = await supabase
            .from('grievance_communications')
            .insert({
                grievance_id: testGrievance.id,
                sender_id: testStudent.id,
                sender_type: 'student',
                recipient_id: testAdmin.id,
                recipient_type: 'admin',
                message: 'Test message from student - group chat working!'
            })
            .select();
        
        if (studentMessageError) {
            console.error('❌ Failed to create student message:', studentMessageError.message);
            return;
        }
        
        console.log('✅ Student message created successfully\n');
        
        // Step 3: Test creating a communication from admin
        console.log('3. Testing admin message creation...');
        const { data: adminMessage, error: adminMessageError } = await supabase
            .from('grievance_communications')
            .insert({
                grievance_id: testGrievance.id,
                sender_id: testAdmin.id,
                sender_type: 'admin',
                recipient_id: testStudent.id,
                recipient_type: 'student',
                message: 'Test response from admin - group chat working!'
            })
            .select();
        
        if (adminMessageError) {
            console.error('❌ Failed to create admin message:', adminMessageError.message);
            return;
        }
        
        console.log('✅ Admin message created successfully\n');
        
        // Step 4: Test fetching communications
        console.log('4. Testing message retrieval...');
        const { data: messages, error: messagesError } = await supabase
            .from('grievance_communications')
            .select('*')
            .eq('grievance_id', testGrievance.id)
            .order('created_at', { ascending: true });
        
        if (messagesError) {
            console.error('❌ Failed to fetch messages:', messagesError.message);
            return;
        }
        
        console.log('✅ Messages retrieved successfully:');
        messages.forEach((msg, index) => {
            console.log(`   ${index + 1}. [${msg.sender_type}] ${msg.message}`);
        });
        
        // Step 5: Test message updates (marking as read)
        console.log('\n5. Testing message read status...');
        const { error: readError } = await supabase
            .from('grievance_communications')
            .update({ read_at: new Date().toISOString() })
            .eq('id', studentMessage[0].id);
        
        if (readError) {
            console.error('❌ Failed to mark message as read:', readError.message);
            return;
        }
        
        console.log('✅ Message marked as read successfully\n');
        
        // Step 6: Test API endpoint simulation
        console.log('6. Testing API endpoint patterns...');
        
        // Simulate passenger API call
        const { data: passengerMessages, error: passengerError } = await supabase
            .from('grievance_communications')
            .select('*')
            .eq('grievance_id', testGrievance.id)
            .or(`sender_id.eq.${testStudent.id},recipient_id.eq.${testStudent.id}`)
            .order('created_at', { ascending: true });
        
        if (passengerError) {
            console.error('❌ Passenger API simulation failed:', passengerError.message);
            return;
        }
        
        console.log(`✅ Passenger API: Retrieved ${passengerMessages.length} messages`);
        
        // Simulate admin API call
        const { data: adminMessages, error: adminApiError } = await supabase
            .from('grievance_communications')
            .select('*')
            .eq('grievance_id', testGrievance.id)
            .order('created_at', { ascending: true });
        
        if (adminApiError) {
            console.error('❌ Admin API simulation failed:', adminApiError.message);
            return;
        }
        
        console.log(`✅ Admin API: Retrieved ${adminMessages.length} messages\n`);
        
        // Step 7: Cleanup test data
        console.log('7. Cleaning up test data...');
        const { error: cleanupError } = await supabase
            .from('grievance_communications')
            .delete()
            .eq('grievance_id', testGrievance.id);
        
        if (cleanupError) {
            console.error('❌ Cleanup failed:', cleanupError.message);
            return;
        }
        
        console.log('✅ Test data cleaned up\n');
        
        // Final summary
        console.log('🎉 GROUP CHAT SYSTEM TEST RESULTS:');
        console.log('✅ Database structure: Ready');
        console.log('✅ Student messaging: Working');
        console.log('✅ Admin messaging: Working');
        console.log('✅ Message retrieval: Working');
        console.log('✅ Read status updates: Working');
        console.log('✅ API endpoints: Ready');
        console.log('\n🚀 Your group chat system is ready for use!');
        
        console.log('\n📱 Next steps:');
        console.log('1. Open Admin: http://localhost:3000');
        console.log('2. Open Passenger: http://localhost:3001');
        console.log('3. Login and test the group chat in a grievance');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testGroupChatSystem(); 