import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPushSubscriptions() {
  console.log('\n🔍 Checking Push Subscriptions...\n');

  // Get all active push subscriptions
  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('is_active', true);

  if (subError) {
    console.error('❌ Error fetching subscriptions:', subError);
    return;
  }

  console.log(`📊 Total active subscriptions: ${subscriptions?.length || 0}\n`);

  if (subscriptions && subscriptions.length > 0) {
    console.log('Active subscriptions:');
    subscriptions.forEach((sub, index) => {
      console.log(`\n${index + 1}. User ID: ${sub.user_id}`);
      console.log(`   User Type: ${sub.user_type}`);
      console.log(`   Endpoint: ${sub.endpoint.substring(0, 50)}...`);
      console.log(`   Created: ${sub.created_at}`);
      console.log(`   Last Used: ${sub.last_used_at || 'Never'}`);
    });

    // Get unique user IDs
    const userIds = [...new Set(subscriptions.map(s => s.user_id))];
    console.log(`\n👥 Total unique users with subscriptions: ${userIds.length}\n`);

    // Get all enrolled students
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, student_name, email, transport_enrolled');

    if (!studentsError && students) {
      console.log(`📚 Total students: ${students.length}`);
      console.log(`🚌 Transport enrolled students: ${students.filter(s => s.transport_enrolled).length}`);

      const enrolledStudentIds = students
        .filter(s => s.transport_enrolled)
        .map(s => s.id);

      const subscribedEnrolled = userIds.filter(uid => enrolledStudentIds.includes(uid));
      const notSubscribed = enrolledStudentIds.filter(uid => !userIds.includes(uid));

      console.log(`✅ Enrolled students with push subscriptions: ${subscribedEnrolled.length}`);
      console.log(`❌ Enrolled students WITHOUT push subscriptions: ${notSubscribed.length}\n`);

      if (notSubscribed.length > 0) {
        console.log('Students without push subscriptions:');
        const studentsWithoutSub = students.filter(s => notSubscribed.includes(s.id));
        studentsWithoutSub.forEach((student, index) => {
          console.log(`${index + 1}. ${student.student_name} (${student.email})`);
        });
      }
    }
  } else {
    console.log('⚠️ No active push subscriptions found');
  }

  // Check recent notifications
  console.log('\n\n📬 Checking recent notifications...\n');
  const { data: notifications, error: notifError } = await supabase
    .from('notifications')
    .select('*')
    .eq('enable_push_notification', true)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!notifError && notifications) {
    console.log(`Recent notifications with push enabled: ${notifications.length}\n`);
    notifications.forEach((notif, index) => {
      console.log(`${index + 1}. ${notif.title}`);
      console.log(`   Target: ${notif.target_audience}`);
      console.log(`   Specific users: ${notif.specific_users?.length || 0}`);
      console.log(`   Created: ${notif.created_at}`);
      
      if (notif.metadata?.deliveryResults) {
        const results = notif.metadata.deliveryResults;
        console.log(`   Delivery: ${results.sent || 0} sent, ${results.failed || 0} failed`);
      }
      console.log('');
    });
  }
}

checkPushSubscriptions().catch(console.error);

