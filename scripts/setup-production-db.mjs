#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔧 Setting up TMS Admin Database for Production')
console.log('==============================================')

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ Set' : '❌ Missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupDatabase() {
  try {
    console.log('\n📋 Checking existing tables...')
    
    // Check if tables exist
    const tables = [
      'admin_users',
      'admin_login_mapping', 
      'routes',
      'students',
      'drivers',
      'vehicles',
      'bookings',
      'payments',
      'notifications',
      'grievances'
    ]

    const existingTables = []
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('count', { count: 'exact', head: true })
      
      if (!error) {
        existingTables.push(table)
        console.log(`   ✅ ${table} exists`)
      } else {
        console.log(`   ❌ ${table} missing`)
      }
    }

    if (existingTables.length === tables.length) {
      console.log('\n✅ All required tables exist!')
      
      // Check admin users
      const { data: adminUsers } = await supabase
        .from('admin_users')
        .select('email, role')
      
      console.log(`\n👥 Admin Users: ${adminUsers?.length || 0} configured`)
      if (adminUsers && adminUsers.length > 0) {
        adminUsers.forEach(user => {
          console.log(`   - ${user.email} (${user.role})`)
        })
      }
      
      console.log('\n🎉 Database is ready for production!')
      return true
    }

    console.log('\n⚠️  Some tables are missing. Please run the full database setup first.')
    console.log('   Refer to the SUPABASE_SETUP.md file for instructions.')
    return false

  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message)
    return false
  }
}

async function main() {
  const success = await setupDatabase()
  
  if (success) {
    console.log('\n🚀 Production database setup complete!')
    console.log('\n📝 Next steps:')
    console.log('   1. Deploy your application')
    console.log('   2. Configure environment variables on your hosting platform')
    console.log('   3. Run health check: npm run health-check')
    console.log('   4. Access your admin panel at: /login')
  } else {
    console.log('\n💡 Setup required:')
    console.log('   1. Run the SQL scripts in the supabase/ directory')
    console.log('   2. Ensure all tables are created')
    console.log('   3. Run this script again')
    process.exit(1)
  }
}

main().catch(console.error) 