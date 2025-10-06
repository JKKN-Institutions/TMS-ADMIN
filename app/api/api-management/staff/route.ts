import { NextRequest, NextResponse } from 'next/server';

const API_KEY = 'jk_5483dc7eb7f1b7cd730a274ec61765cc_mcka9lzk';
const BASE_URL = process.env.STAFF_API_BASE_URL || 'https://www.jkkn.ai/api/api-management';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const departmentId = searchParams.get('department_id');
    const categoryId = searchParams.get('category_id');
    const isActive = searchParams.get('is_active');

    // Build API parameters
    const apiParams = new URLSearchParams();
    if (search) apiParams.append('search', search);
    if (page > 1) apiParams.append('page', page.toString());
    if (limit !== 50) apiParams.append('limit', limit.toString());
    if (departmentId) apiParams.append('department_id', departmentId);
    if (categoryId) apiParams.append('category_id', categoryId);
    if (isActive !== null) apiParams.append('is_active', isActive);

    console.log('🔍 Fetching staff data from external API...');
    const response = await fetch(`${BASE_URL}/staff?${apiParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch staff from external API:', response.status);
      return NextResponse.json(
        { error: 'Failed to fetch staff data from external system' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const staff = data.data || [];

    console.log(`✅ Successfully fetched ${staff.length} staff records`);

    return NextResponse.json({
      success: true,
      data: staff,
      count: staff.length,
      page,
      limit
    });

  } catch (error: any) {
    console.error('Error fetching staff data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
