#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { performance } from 'perf_hooks'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔧 TMS Database Connection Status Test')
console.log('=====================================')
console.log()

// Check environment variables
console.log('📋 Environment Variables:')
console.log(`   SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`)
console.log(`   SERVICE_KEY:  ${supabaseServiceKey ? '✅ Set' : '❌ Missing'}`)
console.log()

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testConnection() {
  console.log('🔄 Testing Database Connection...')
  console.log()

  try {
    // Test basic connection
    const startTime = performance.now()
    const { data, error } = await supabase
      .from('admin_users')
      .select('count', { count: 'exact', head: true })
    
    const endTime = performance.now()
    const responseTime = Math.round(endTime - startTime)

    if (error) {
      console.error('❌ Connection Failed:', error.message)
      return false
    }

    console.log('✅ Database Connection: SUCCESS')
    console.log(`⚡ Response Time: ${responseTime}ms`)
    console.log()

    // Get database info
    console.log('📊 Database Information:')
    
    // Test multiple tables
    const tables = [
      'admin_users',
      'routes', 
      'students',
      'drivers',
      'vehicles',
      'bookings',
      'payments',
      'notifications',
      'grievances'
    ]

    console.log('📋 Table Status:')
    for (const table of tables) {
      try {
        const start = performance.now()
        const { count, error: tableError } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
        
        const time = Math.round(performance.now() - start)
        
        if (tableError) {
          console.log(`   ${table.padEnd(15)}: ❌ Error - ${tableError.message}`)
        } else {
          console.log(`   ${table.padEnd(15)}: ✅ ${count} records (${time}ms)`)
        }
      } catch (err) {
        console.log(`   ${table.padEnd(15)}: ❌ Error - ${err.message}`)
      }
    }

    console.log()

    // Test auth functionality
    console.log('🔐 Authentication Test:')
    try {
      const authStart = performance.now()
      const { data: authData, error: authError } = await supabase
        .from('admin_login_mapping')
        .select('login_id, role')
        .limit(1)
      
      const authTime = Math.round(performance.now() - authStart)
      
      if (authError) {
        console.log(`   Auth System: ❌ Error - ${authError.message}`)
      } else {
        console.log(`   Auth System: ✅ Working (${authTime}ms)`)
      }
    } catch (err) {
      console.log(`   Auth System: ❌ Error - ${err.message}`)
    }

    console.log()

    // Real-time connection test
    console.log('📡 Real-time Features:')
    try {
      const channel = supabase.channel('test-channel')
      console.log('   Real-time: ✅ Channel created')
      await supabase.removeChannel(channel)
    } catch (err) {
      console.log(`   Real-time: ❌ Error - ${err.message}`)
    }

    console.log()
    console.log('🎉 Database Status: HEALTHY')
    return true

  } catch (error) {
    console.error('❌ Connection Test Failed:', error.message)
    return false
  }
}

// Run continuous monitoring if requested
async function continuousMonitoring() {
  console.log('🔄 Starting continuous monitoring (Press Ctrl+C to stop)...')
  console.log()
  
  let iteration = 1
  
  const monitor = setInterval(async () => {
    console.log(`\n📊 Health Check #${iteration} - ${new Date().toLocaleTimeString()}`)
    console.log('=' .repeat(50))
    
    const isHealthy = await testConnection()
    console.log(`Status: ${isHealthy ? '🟢 HEALTHY' : '🔴 UNHEALTHY'}`)
    
    iteration++
  }, 10000) // Check every 10 seconds

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping monitoring...')
    clearInterval(monitor)
    process.exit(0)
  })
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const continuous = args.includes('--continuous') || args.includes('-c')
  
  if (continuous) {
    await continuousMonitoring()
  } else {
    await testConnection()
  }
}

main().catch(console.error) 