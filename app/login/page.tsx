'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  LogIn, 
  Shield, 
  DollarSign, 
  ClipboardList, 
  Database,
  Bus,
  Crown,
  Loader2
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { UserRole } from '@/types';

const roleConfig = {
  super_admin: {
    name: 'Super Admin',
    icon: Crown,
    color: 'bg-purple-500 hover:bg-purple-600',
    description: 'Full system access and control'
  },
  transport_manager: {
    name: 'Transport Manager',
    icon: Bus,
    color: 'bg-blue-500 hover:bg-blue-600',
    description: 'Manage routes, drivers, and vehicles'
  },
  finance_admin: {
    name: 'Finance Admin',
    icon: DollarSign,
    color: 'bg-green-500 hover:bg-green-600',
    description: 'Handle payments and financial operations'
  },
  operations_admin: {
    name: 'Operations Admin',
    icon: ClipboardList,
    color: 'bg-orange-500 hover:bg-orange-600',
    description: 'Manage bookings and grievances'
  },
  data_entry: {
    name: 'Data Entry',
    icon: Database,
    color: 'bg-gray-500 hover:bg-gray-600',
    description: 'Manage student data and records'
  }
};

// Admin ID mapping for different roles
const roleCredentials = {
  super_admin: { id: 'SA001', password: 'superadmin123' },
  transport_manager: { id: 'TM001', password: 'transport123' },
  finance_admin: { id: 'FA001', password: 'finance123' },
  operations_admin: { id: 'OA001', password: 'operations123' },
  data_entry: { id: 'DE001', password: 'dataentry123' }
};

const LoginPage = () => {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole>('super_admin');
  const [adminId, setAdminId] = useState('SA001');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure component is mounted before rendering forms
  useEffect(() => {
    setIsMounted(true);
  }, []);



  React.useEffect(() => {
    const credentials = roleCredentials[selectedRole];
    if (credentials) {
      setAdminId(credentials.id);
    }
  }, [selectedRole]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!adminId || !password) {
      toast.error('Please enter both Admin ID and password');
      return;
    }

    setIsLoading(true);
    
    try {
      // Call the login API route
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId: adminId.toUpperCase(),
          password: password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      if (data.success && data.user) {
        // Store user in localStorage
        localStorage.setItem('adminUser', JSON.stringify(data.user));

        toast.success(`Welcome back, ${data.user.name}!`);
        setTimeout(() => {
          router.push('/dashboard');
        }, 1000);
      } else {
        toast.error('Login failed. Please try again.');
      }

    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Toaster position="top-right" />
      
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Left Panel - Role Selection */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              MYJKKN TMS Admin
            </h1>
            <p className="text-xl text-gray-600">
              JKKN College Transport Administration
            </p>
          </div>

          <div className="space-y-3">
            {isMounted ? (
              Object.entries(roleConfig).map(([role, config]) => {
                const Icon = config.icon;
                const isSelected = selectedRole === role;
                
                return (
                  <motion.button
                    key={role}
                    onClick={() => setSelectedRole(role as UserRole)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50 shadow-lg' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-lg text-white ${config.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{config.name}</h3>
                        <p className="text-sm text-gray-600">{config.description}</p>
                      </div>
                      {isSelected && (
                        <div className="text-blue-500">
                          <Shield className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })
            ) : (
              // Loading skeleton for role buttons
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="w-full p-4 rounded-xl border-2 border-gray-200 bg-white animate-pulse">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Right Panel - Login Form */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-2xl shadow-xl p-8"
        >
          <div className="text-center mb-8">
            <div className={`inline-flex p-4 rounded-full text-white mb-4 ${roleConfig[selectedRole].color}`}>
              {React.createElement(roleConfig[selectedRole].icon, { className: "w-8 h-8" })}
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {roleConfig[selectedRole].name} Login
            </h2>
            <p className="text-gray-600">{roleConfig[selectedRole].description}</p>
          </div>

          {isMounted ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin ID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value.toUpperCase())}
                    className="input input-with-left-icon"
                    placeholder="Enter your Admin ID"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input input-with-left-icon input-with-right-icon"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Demo Credentials:</strong> {roleCredentials[selectedRole].id} / {roleCredentials[selectedRole].password}
                </p>
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full py-3 px-4 rounded-lg text-white font-semibold transition-all ${
                  isLoading 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : `${roleConfig[selectedRole].color} shadow-lg hover:shadow-xl`
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Signing In...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <LogIn className="w-5 h-5" />
                    <span>Sign In as {roleConfig[selectedRole].name}</span>
                  </div>
                )}
              </motion.button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-10 bg-gray-200 rounded"></div>
              </div>
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-10 bg-gray-200 rounded"></div>
              </div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage; 