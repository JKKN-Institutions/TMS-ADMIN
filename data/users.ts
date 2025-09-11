// Temporary mock users file to prevent import errors
// This should be replaced with database authentication

import { AdminUser } from '@/types';

export const adminUsers: AdminUser[] = [
  {
    id: '1',
    name: 'Super Administrator',
    email: 'superadmin@tms.local',
    role: 'super_admin',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    permissions: [
      {
        module: 'all',
        actions: ['create', 'read', 'update', 'delete', 'approve']
      }
    ]
  },
  {
    id: '2', 
    name: 'Transport Manager',
    email: 'transport@tms.local',
    role: 'transport_manager',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    permissions: [
      {
        module: 'routes',
        actions: ['create', 'read', 'update', 'delete']
      },
      {
        module: 'drivers',
        actions: ['create', 'read', 'update', 'delete']
      },
      {
        module: 'vehicles',
        actions: ['create', 'read', 'update']
      }
    ]
  }
];

// This file is deprecated - all authentication should use DatabaseService
console.warn('WARNING: users.ts is deprecated. Use database authentication instead.') 