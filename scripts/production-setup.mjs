#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔧 TMS Admin Production Database Setup')
console.log('=====================================')

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function verifyTables() {
  const tables = [
    'admin_users', 'routes', 'students', 'drivers', 
    'vehicles', 'bookings', 'payments', 'notifications', 'grievances'
  ]

  console.log('\n📋 Verifying database tables...')
  
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`)
        return false
      } else {
        console.log(`   ✅ ${table}: ${count} records`)
      }
    } catch (err) {
      console.log(`   ❌ ${table}: Failed to access`)
      return false
    }
  }
  
  return true
}

async function main() {
  const isReady = await verifyTables()
  
  if (isReady) {
    console.log('\n🎉 Database is ready for production!')
    console.log('\n📝 Deployment checklist:')
    console.log('   ✅ Database tables verified')
    console.log('   ✅ Environment variables configured')
    console.log('   ✅ Admin users available')
    console.log('\n🚀 Ready to deploy!')
  } else {
    console.log('\n❌ Database setup incomplete')
    console.log('   Please run the SQL setup scripts first')
    process.exit(1)
  }
}

main().catch(console.error) 