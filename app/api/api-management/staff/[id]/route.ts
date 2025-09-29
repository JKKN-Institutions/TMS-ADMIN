import { NextRequest, NextResponse } from 'next/server';

const API_KEY = 'jk_5483dc7eb7f1b7cd730a274ec61765cc_mcka9lzk';
const BASE_URL = process.env.STAFF_API_BASE_URL || 'https://jkkn.ai/api/api-management';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const staffId = params.id;

    if (!staffId) {
      return NextResponse.json(
        { error: 'Staff ID is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Fetching staff member with ID: ${staffId}`);
    const response = await fetch(`${BASE_URL}/staff/${staffId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Staff member not found' },
          { status: 404 }
        );
      }
      console.error('Failed to fetch staff member from external API:', response.status);
      return NextResponse.json(
        { error: 'Failed to fetch staff data from external system' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const staffMember = data.data || data;

    console.log(`✅ Successfully fetched staff member: ${staffMember.first_name} ${staffMember.last_name}`);

    return NextResponse.json({
      success: true,
      data: staffMember
    });

  } catch (error: any) {
    console.error('Error fetching staff member data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
