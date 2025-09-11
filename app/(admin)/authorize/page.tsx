'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Edit,
  Save,
  X,
  Key,
  Lock,
  Unlock,
  Search,
  CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminUser, Permission } from '@/types';
import { adminUsers } from '@/data/users';

// Using AdminUser type from @/types instead of local interface

// Define available modules and their permissions
const availableModules = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Main dashboard access and overview statistics',
    permissions: ['read']
  },
  {
    id: 'routes',
    name: 'Routes Management',
    description: 'Create, manage, and monitor transport routes',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'students',
    name: 'Student Management',
    description: 'Student registration, profiles, and transport allocation',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'drivers',
    name: 'Driver Management',
    description: 'Driver registration, profiles, and assignment',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'vehicles',
    name: 'Vehicle Management',
    description: 'Vehicle registration, maintenance, and tracking',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'schedules',
    name: 'Schedule Management',
    description: 'Route schedules and timetable management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'bookings',
    name: 'Booking Management',
    description: 'Student bookings and seat reservations',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'payments',
    name: 'Payment Management',
    description: 'Fee collection, refunds, and financial transactions',
    permissions: ['create', 'read', 'update', 'delete', 'approve']
  },
  {
    id: 'notifications',
    name: 'Notification System',
    description: 'Send notifications and manage communication',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'grievances',
    name: 'Grievance Management',
    description: 'Handle student complaints and feedback',
    permissions: ['read', 'update', 'approve']
  },
  {
    id: 'analytics',
    name: 'Analytics & Reports',
    description: 'View system analytics and generate reports',
    permissions: ['read']
  },
  {
    id: 'settings',
    name: 'System Settings',
    description: 'System configuration and preferences',
    permissions: ['read', 'update']
  }
];

const roleTemplates = {
  super_admin: {
    name: 'Super Administrator',
    description: 'Full system access with all permissions',
    color: 'text-red-600 bg-red-100',
    permissions: availableModules.reduce((acc, module) => {
      acc[module.id] = module.permissions;
      return acc;
    }, {} as Record<string, string[]>)
  },
  transport_manager: {
    name: 'Transport Manager',
    description: 'Manages routes, drivers, vehicles, and schedules',
    color: 'text-blue-600 bg-blue-100',
    permissions: {
      dashboard: ['read'],
      routes: ['create', 'read', 'update', 'delete'],
      drivers: ['create', 'read', 'update', 'delete'],
      vehicles: ['create', 'read', 'update'],
      schedules: ['create', 'read', 'update', 'delete'],
      analytics: ['read']
    }
  },
  finance_admin: {
    name: 'Finance Administrator',
    description: 'Handles payments, billing, and financial reports',
    color: 'text-green-600 bg-green-100',
    permissions: {
      dashboard: ['read'],
      students: ['read'],
      bookings: ['read', 'update'],
      payments: ['create', 'read', 'update', 'approve'],
      analytics: ['read']
    }
  },
  operations_admin: {
    name: 'Operations Administrator',
    description: 'Manages bookings, grievances, and notifications',
    color: 'text-purple-600 bg-purple-100',
    permissions: {
      dashboard: ['read'],
      students: ['read', 'update'],
      bookings: ['create', 'read', 'update'],
      notifications: ['create', 'read', 'update'],
      grievances: ['read', 'update', 'approve'],
      analytics: ['read']
    }
  },
  data_entry: {
    name: 'Data Entry Operator',
    description: 'Handles student data entry and basic bookings',
    color: 'text-orange-600 bg-orange-100',
    permissions: {
      dashboard: ['read'],
      students: ['create', 'read', 'update'],
      bookings: ['create', 'read']
    }
  }
};

const AuthorizePage = () => {
  const [users, setUsers] = useState(adminUsers);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [customPermissions, setCustomPermissions] = useState<Record<string, string[]>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [showRoleTemplates, setShowRoleTemplates] = useState(false);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'all' || user.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const handleUserSelect = (user: AdminUser) => {
    setSelectedUser(user);
    setEditingPermissions(false);
    // Convert user permissions to the format we need
    const permissionMap: Record<string, string[]> = {};
    user.permissions.forEach((perm) => {
      if (perm.module === 'all') {
        // Super admin case
        availableModules.forEach(module => {
          permissionMap[module.id] = module.permissions;
        });
      } else {
        permissionMap[perm.module] = perm.actions;
      }
    });
    setCustomPermissions(permissionMap);
  };

  const handlePermissionToggle = (moduleId: string, permission: string) => {
    setCustomPermissions(prev => {
      const modulePerms = prev[moduleId] || [];
      const newPerms = modulePerms.includes(permission)
        ? modulePerms.filter(p => p !== permission)
        : [...modulePerms, permission];
      
      return {
        ...prev,
        [moduleId]: newPerms
      };
    });
  };

  const handleSavePermissions = () => {
    if (!selectedUser) return;

    // Convert permissions back to user format
    const newPermissions: Permission[] = Object.entries(customPermissions)
      .filter(([, perms]) => perms.length > 0)
      .map(([module, actions]) => ({ 
        module, 
        actions: actions as ('create' | 'read' | 'update' | 'delete' | 'approve')[]
      }));

    const updatedUser: AdminUser = {
      ...selectedUser,
      permissions: newPermissions
    };

    setUsers(prev => prev.map(u => u.id === selectedUser.id ? updatedUser : u));
    setSelectedUser(updatedUser);
    setEditingPermissions(false);
    toast.success('Permissions updated successfully!');
  };

  const handleRoleTemplateApply = (roleKey: string) => {
    const template = roleTemplates[roleKey as keyof typeof roleTemplates];
    setCustomPermissions(template.permissions);
    toast.success(`Applied ${template.name} permissions template`);
  };

  const toggleUserStatus = (userId: string) => {
    setUsers(prev => prev.map(user => 
      user.id === userId 
        ? { ...user, isActive: !user.isActive }
        : user
    ));
    toast.success('User status updated successfully!');
  };

  const getPermissionColor = (permission: string) => {
    const colors = {
      create: 'text-green-700 bg-green-100',
      read: 'text-blue-700 bg-blue-100',
      update: 'text-yellow-700 bg-yellow-100',
      delete: 'text-red-700 bg-red-100',
      approve: 'text-purple-700 bg-purple-100'
    };
    return colors[permission as keyof typeof colors] || 'text-gray-700 bg-gray-100';
  };

  const getRoleInfo = (role: string) => {
    return roleTemplates[role as keyof typeof roleTemplates] || {
      name: role.replace('_', ' ').toUpperCase(),
      color: 'text-gray-600 bg-gray-100'
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-3">
            <Shield className="w-8 h-8 text-blue-600" />
            <span>Authorization Management</span>
          </h1>
          <p className="text-gray-600 mt-1">Manage admin roles, permissions, and access controls</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowRoleTemplates(!showRoleTemplates)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2"
          >
            <Key className="w-4 h-4" />
            <span>Role Templates</span>
          </button>
        </div>
      </div>

      {/* Role Templates Modal */}
      <AnimatePresence>
        {showRoleTemplates && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-bold text-gray-900">Role Permission Templates</h2>
                <button
                  onClick={() => setShowRoleTemplates(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {Object.entries(roleTemplates).map(([key, template]) => (
                  <div key={key} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        <p className="text-sm text-gray-600">{template.description}</p>
                      </div>
                      <button
                        onClick={() => handleRoleTemplateApply(key)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        Apply Template
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(template.permissions).map(([moduleId, perms]) => {
                        const moduleInfo = availableModules.find(m => m.id === moduleId);
                        return (
                          <div key={moduleId} className="text-sm">
                            <span className="font-medium text-gray-700">{moduleInfo?.name}:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {perms.map(perm => (
                                <span
                                  key={perm}
                                  className={`px-2 py-0.5 rounded text-xs ${getPermissionColor(perm)}`}
                                >
                                  {perm}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Users List */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin Users</h3>
              
              {/* Search and Filter */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Roles</option>
                  {Object.entries(roleTemplates).map(([key, template]) => (
                    <option key={key} value={key}>{template.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {filteredUsers.map((user) => {
                const roleInfo = getRoleInfo(user.role);
                return (
                  <div
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedUser?.id === user.id ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-semibold text-sm">{user.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <p className="text-sm text-gray-600">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}>
                          {roleInfo.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleUserStatus(user.id);
                          }}
                          className={`p-1 rounded ${user.isActive ? 'text-green-600' : 'text-red-600'}`}
                          title={user.isActive ? 'Active' : 'Inactive'}
                        >
                          {user.isActive ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Permission Details */}
        <div className="xl:col-span-2">
          {selectedUser ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold">{selectedUser.name.charAt(0)}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{selectedUser.name}</h3>
                      <p className="text-gray-600">{selectedUser.email}</p>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleInfo(selectedUser.role).color} mt-1`}>
                        {getRoleInfo(selectedUser.role).name}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {editingPermissions ? (
                      <>
                        <button
                          onClick={() => setEditingPermissions(false)}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSavePermissions}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
                        >
                          <Save className="w-4 h-4" />
                          <span>Save</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setEditingPermissions(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit Permissions</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Module Permissions</h4>
                <div className="space-y-4">
                  {availableModules.map((module) => {
                    const userPermissions = customPermissions[module.id] || [];
                    const hasAnyPermission = userPermissions.length > 0;
                    
                    return (
                      <div
                        key={module.id}
                        className={`border rounded-lg p-4 ${hasAnyPermission ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h5 className="font-medium text-gray-900">{module.name}</h5>
                            <p className="text-sm text-gray-600">{module.description}</p>
                          </div>
                          {hasAnyPermission && (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {module.permissions.map((permission) => {
                            const isGranted = userPermissions.includes(permission);
                            return (
                              <button
                                key={permission}
                                onClick={() => editingPermissions && handlePermissionToggle(module.id, permission)}
                                disabled={!editingPermissions}
                                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                  isGranted
                                    ? `${getPermissionColor(permission)} opacity-100`
                                    : 'text-gray-500 bg-gray-100 opacity-60'
                                } ${editingPermissions ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                              >
                                {permission}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a User</h3>
              <p className="text-gray-600">Choose a user from the list to view and manage their permissions</p>
            </div>
          )}
        </div>
      </div>

      {/* Permission Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Permission Summary by Role</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(roleTemplates).map(([roleKey, template]) => {
            const usersWithRole = users.filter(u => u.role === roleKey);
            return (
              <div key={roleKey} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${template.color}`}>
                    {template.name}
                  </span>
                  <span className="text-sm text-gray-600">{usersWithRole.length} users</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                <div className="text-xs text-gray-500">
                  Access to: {Object.keys(template.permissions).length} modules
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AuthorizePage; 