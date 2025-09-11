// Simple Supabase Connection Test
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Testing Supabase Connection...\n');

// Check environment variables
if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Missing environment variables in .env.local file');
  console.log('Make sure you have:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=your_url');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key');
  process.exit(1);
}

console.log('✅ Environment variables found');
console.log(`📡 URL: ${supabaseUrl.substring(0, 30)}...`);
console.log(`🔑 Key: ${supabaseKey.substring(0, 30)}...`);

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    console.log('\n🔌 Testing database connection...');
    
    // Test basic connection
    const { data, error } = await supabase
      .from('institutions')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      console.log('❌ Connection failed:', error.message);
      return;
    }
    
    console.log('✅ Database connection successful!');
    
    // Test fetching data
    const { data: institutions } = await supabase
      .from('institutions')
      .select('*')
      .limit(3);
    
    if (institutions && institutions.length > 0) {
      console.log('✅ Sample data found:');
      institutions.forEach(inst => {
        console.log(`   - ${inst.name}`);
      });
    } else {
      console.log('ℹ️  No sample data (this is okay)');
    }
    
    console.log('\n🎉 Database is working correctly!');
    console.log('\n📝 You can now:');
    console.log('   1. Run: npm run dev');
    console.log('   2. Visit: http://localhost:3000');
    console.log('   3. Test the admin login');
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testConnection(); 