#!/usr/bin/env node

/**
 * Test script to verify student API connection
 * Run with: node test-student-api.mjs
 */

const API_KEY = 'jk_21372a6d0f4ca05d02139a0fb714a2e5_mcejx5qz';
const BASE_URL = 'https://my.jkkn.ac.in/api/api-management';

async function testStudentAPI() {
  console.log('🔍 Testing Student API Connection...\n');
  
  try {
    // Test 1: Search for students
    console.log('1️⃣ Testing student search endpoint...');
    // Try different authentication methods
    console.log('Testing with Bearer token...');
    let searchResponse = await fetch(`${BASE_URL}/students?search=student&limit=5`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (searchResponse.status === 401) {
      console.log('Bearer token failed, trying without Bearer prefix...');
      searchResponse = await fetch(`${BASE_URL}/students?search=student&limit=5`, {
        method: 'GET',
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
    }
    
    if (searchResponse.status === 401) {
      console.log('Authorization header failed, trying as API key header...');
      searchResponse = await fetch(`${BASE_URL}/students?search=student&limit=5`, {
        method: 'GET',
        headers: {
          'X-API-Key': API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
    }
    
    console.log(`Response status: ${searchResponse.status} ${searchResponse.statusText}`);
    
    if (!searchResponse.ok) {
      // Try to get more details about the error
      const errorText = await searchResponse.text();
      console.log('Error response:', errorText);
      throw new Error(`Search failed: ${searchResponse.status} ${searchResponse.statusText}`);
    }
    
    const searchData = await searchResponse.json();
    console.log(`✅ Search successful! Found ${searchData.data?.length || 0} students`);
    
    if (searchData.data && searchData.data.length > 0) {
      const firstStudent = searchData.data[0];
      console.log(`📝 Sample student: ${firstStudent.student_name} (${firstStudent.student_email})`);
      
      // Test 2: Get detailed student info
      console.log('\n2️⃣ Testing student details endpoint...');
      const detailsResponse = await fetch(`${BASE_URL}/students/${firstStudent.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!detailsResponse.ok) {
        throw new Error(`Details fetch failed: ${detailsResponse.status} ${detailsResponse.statusText}`);
      }
      
      const detailsData = await detailsResponse.json();
      console.log('✅ Student details fetch successful!');
      console.log(`📋 Student details: ${detailsData.data.student_name} - ${detailsData.data.department?.department_name || 'Unknown Dept'}`);
      
      // Test 3: Email-based search simulation
      console.log('\n3️⃣ Testing email-based search...');
      const emailSearchResponse = await fetch(`${BASE_URL}/students?search=${firstStudent.student_email}&limit=10`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!emailSearchResponse.ok) {
        throw new Error(`Email search failed: ${emailSearchResponse.status} ${emailSearchResponse.statusText}`);
      }
      
      const emailSearchData = await emailSearchResponse.json();
      const emailMatch = emailSearchData.data?.find(student => 
        student.student_email?.toLowerCase() === firstStudent.student_email?.toLowerCase() ||
        student.college_email?.toLowerCase() === firstStudent.student_email?.toLowerCase()
      );
      
      if (emailMatch) {
        console.log('✅ Email-based search working correctly!');
        console.log(`📧 Found student by email: ${emailMatch.student_name}`);
      } else {
        console.log('⚠️ Email-based search needs verification');
      }
      
    } else {
      console.log('⚠️ No students found in database - this is normal for new installations');
    }
    
    console.log('\n🎉 API Connection Test Complete!');
    console.log('✅ Your student API integration is ready to use!');
    
  } catch (error) {
    console.error('\n❌ API Test Failed:');
    console.error(error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('- Check if the API key is correct');
    console.log('- Verify the API URL is accessible');
    console.log('- Ensure the API endpoints exist and are working');
  }
}

// Run the test
testStudentAPI(); 