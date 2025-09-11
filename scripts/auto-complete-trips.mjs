#!/usr/bin/env node

/**
 * AUTO-COMPLETE TRIPS SCRIPT
 * 
 * This script automatically completes trips whose scheduled date has passed.
 * It calls the auto-complete API endpoint to mark trips as completed.
 * 
 * Usage:
 * 1. Direct execution: node admin/scripts/auto-complete-trips.mjs
 * 2. Cron job: Add to crontab to run daily
 * 
 * Cron job example (runs daily at 2 AM):
 * 0 2 * * * cd /path/to/your/app && node admin/scripts/auto-complete-trips.mjs >> /var/log/trip-completion.log 2>&1
 * 
 * Environment variables required:
 * - NEXT_PUBLIC_SUPABASE_URL: Your Supabase URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 * - APP_URL: Your application URL (for API calls)
 */

import fetch from 'node-fetch';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const API_ENDPOINT = `${APP_URL}/api/admin/schedules/auto-complete`;

async function autoCompleteTrips() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Starting auto-completion of trips...`);

  try {
    // Call the auto-complete API endpoint
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    console.log(`[${timestamp}] Auto-completion completed successfully:`);
    console.log(`  - Processed: ${result.summary?.processed || 0} trips`);
    console.log(`  - Completed: ${result.summary?.completed || 0} trips`);
    console.log(`  - Failed: ${result.summary?.failed || 0} trips`);
    
    if (result.completedTrips && result.completedTrips.length > 0) {
      console.log('\n  Completed trips:');
      result.completedTrips.forEach(trip => {
        console.log(`    - Route ${trip.routeNumber} (${trip.routeName}) on ${trip.scheduleDate} - ${trip.passengerCount} passengers`);
      });
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n  Errors encountered:');
      result.errors.forEach(error => {
        console.log(`    - Schedule ${error.scheduleId}: ${error.error}`);
      });
    }

    // Exit with appropriate code
    const exitCode = result.summary?.failed > 0 ? 1 : 0;
    console.log(`[${timestamp}] Script completed with exit code: ${exitCode}`);
    process.exit(exitCode);

  } catch (error) {
    console.error(`[${timestamp}] Error during auto-completion:`, error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Validate environment
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Run the auto-completion
autoCompleteTrips(); 