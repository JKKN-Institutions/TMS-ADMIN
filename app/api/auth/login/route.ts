import { NextRequest, NextResponse } from 'next/server';

const DEMO_USERS: Record<string, { password: string; id: string; name: string; role: string; email: string }> = {
  SA001: {
    password: 'superadmin123',
    id: 'demo-sa-001',
    name: 'Super Admin',
    role: 'super_admin',
    email: 'superadmin@jkkn.ac.in',
  },
  TM001: {
    password: 'transport123',
    id: 'demo-tm-001',
    name: 'Transport Manager',
    role: 'transport_manager',
    email: 'transport@jkkn.ac.in',
  },
  FA001: {
    password: 'finance123',
    id: 'demo-fa-001',
    name: 'Finance Admin',
    role: 'finance_admin',
    email: 'finance@jkkn.ac.in',
  },
  OA001: {
    password: 'operations123',
    id: 'demo-oa-001',
    name: 'Operations Admin',
    role: 'operations_admin',
    email: 'operations@jkkn.ac.in',
  },
  DE001: {
    password: 'dataentry123',
    id: 'demo-de-001',
    name: 'Data Entry',
    role: 'data_entry',
    email: 'dataentry@jkkn.ac.in',
  },
};

export async function POST(request: NextRequest) {
  try {
    const { adminId, password } = await request.json();

    if (!adminId || !password) {
      return NextResponse.json(
        { error: 'Missing admin ID or password' },
        { status: 400 }
      );
    }

    const user = DEMO_USERS[adminId.toUpperCase()];

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid Admin ID' },
        { status: 401 }
      );
    }

    if (user.password !== password) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        adminId: adminId.toUpperCase(),
      },
    });
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
} 