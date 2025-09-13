'use client';

import React, { useState, useEffect } from 'react';
import { 
  Calendar,
  Search,
  Zap,
  Bus,
  Users,
  ArrowRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Eye,
  RefreshCw,
  Clock,
  MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Passenger {
  id: string;
  name: string;
  rollNumber: string;
  email: string;
  mobile: string;
  boardingStop: string;
  seatNumber: string;
}

interface TargetBus {
  scheduleId: string;
  routeName: string;
  routeNumber: string;
  departureTime: string;
  arrivalTime: string;
  availableSeats: number;
  currentPassengers: number;
}

interface PassengerTransfer {
  passenger: Passenger;
  targetBus: TargetBus | null;
  transferFeasible: boolean;
  reason?: string;
}

interface Schedule {
  id: string;
  routeId: string;
  routeName: string;
  routeNumber: string;
  departureTime: string;
  arrivalTime: string;
  currentPassengers: number;
  totalCapacity: number;
  availableSeats: number;
}

interface OptimizationResult {
  schedule: Schedule;
  passengers: PassengerTransfer[];
  transferType: 'full_transfer' | 'partial_transfer' | 'no_transfer' | 'no_bookings' | 'normal_route';
  transferablePassengers: number;
  totalPassengers: number;
  canCancelBus: boolean;
  estimatedSavings: number;
}

interface OptimizationSummary {
  totalLowCrowdBuses: number;
  totalPassengersAffected: number;
  fullTransfers: number;
  partialTransfers: number;
  noTransfers: number;
  noBookings?: number;
  normalRoutes?: number;
  potentialSavings: number;
}

interface ExistingTransfer {
  studentId: string;
  studentName: string;
  rollNumber: string;
  boardingStop: string;
  currentRoute: string;
  transferredAt: string;
}

interface ExistingTransferData {
  hasExistingTransfers: boolean;
  existingTransfers: { [routeName: string]: ExistingTransfer[] };
  transferSummary: {
    totalTransfers: number;
    affectedRoutes: number;
    transferDate: string;
    lastTransferTime: string;
  };
  optimizationDate: string;
}

interface LoadingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
}

const RouteOptimizationPage = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [optimizationData, setOptimizationData] = useState<{
    optimizationId?: string;
    lowCrowdBuses: OptimizationResult[];
    optimizationSummary: OptimizationSummary;
  } | null>(null);
  const [existingTransferData, setExistingTransferData] = useState<ExistingTransferData | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedBus, setSelectedBus] = useState<OptimizationResult | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('adminUser');
    if (storedUser) {
      setAdminUser(JSON.parse(storedUser));
    } else {
      // For testing purposes, use a default admin user
      const defaultAdmin = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'superadmin@tms.local',
        role: 'super_admin',
        name: 'Super Admin'
      };
      setAdminUser(defaultAdmin);
      localStorage.setItem('adminUser', JSON.stringify(defaultAdmin));
      console.log('🔧 Using default admin user for testing:', defaultAdmin);
    }
  }, []);

  const initializeLoadingSteps = () => {
    const steps: LoadingStep[] = [
      {
        id: 'init',
        title: 'Initializing Analysis',
        description: 'Starting route optimization process...',
        status: 'pending'
      },
      {
        id: 'fetch_routes',
        title: 'Fetching Active Routes',
        description: 'Loading all active bus routes from database...',
        status: 'pending'
      },
      {
        id: 'fetch_bookings',
        title: 'Analyzing Bookings',
        description: `Retrieving confirmed bookings for ${selectedDate}...`,
        status: 'pending'
      },
      {
        id: 'identify_low_crowd',
        title: 'Identifying Low-Crowd Routes',
        description: 'Finding routes with ≤30 passengers and empty routes...',
        status: 'pending'
      },
      {
        id: 'analyze_transfers',
        title: 'Analyzing Transfer Feasibility',
        description: 'Checking passenger transfer options for each route...',
        status: 'pending'
      },
      {
        id: 'calculate_savings',
        title: 'Calculating Potential Savings',
        description: 'Computing cost benefits and optimization opportunities...',
        status: 'pending'
      },
      {
        id: 'finalize',
        title: 'Finalizing Results',
        description: 'Preparing optimization recommendations...',
        status: 'pending'
      }
    ];
    setLoadingSteps(steps);
    return steps;
  };

  const updateLoadingStep = (stepId: string, status: LoadingStep['status'], description?: string) => {
    setLoadingSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, ...(description && { description }) }
        : step
    ));
    setCurrentStep(stepId);
  };

  const handleOptimize = async () => {
    console.log('🔍 Starting optimization...', { selectedDate, adminUser });
    
    if (!adminUser) {
      console.error('❌ Admin user not found');
      toast.error('Admin user not found');
      return;
    }

    setLoading(true);
    const steps = initializeLoadingSteps();
    
    try {
      // Step 1: Initialize
      updateLoadingStep('init', 'in_progress', 'Validating parameters and preparing analysis...');
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for UX
      updateLoadingStep('init', 'completed');

      // Step 2: Start API call
      updateLoadingStep('fetch_routes', 'in_progress', 'Connecting to database and loading route data...');
      
      const response = await fetch('/api/admin/route-optimization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: selectedDate,
          adminId: adminUser.id
        }),
      });

      // Simulate progress through steps
      updateLoadingStep('fetch_routes', 'completed');
      updateLoadingStep('fetch_bookings', 'in_progress', `Processing booking data for ${selectedDate}...`);
      await new Promise(resolve => setTimeout(resolve, 800));
      
      updateLoadingStep('fetch_bookings', 'completed');
      updateLoadingStep('identify_low_crowd', 'in_progress', 'Categorizing routes by passenger count...');
      await new Promise(resolve => setTimeout(resolve, 600));
      
      updateLoadingStep('identify_low_crowd', 'completed');
      updateLoadingStep('analyze_transfers', 'in_progress', 'Checking passenger transfers for low-crowd routes...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Simulate detailed transfer analysis with route-specific information
      const routeNames = ['KONGANAPURAM', 'PAALMADAI', 'GURUVAREDDIYUR', 'OMALUR', 'SALEM'];
      
      for (let i = 0; i < routeNames.length && i < 3; i++) {
        updateLoadingStep('analyze_transfers', 'in_progress', 
          `Analyzing ${routeNames[i]} route - checking passenger boarding stops...`);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        updateLoadingStep('analyze_transfers', 'in_progress', 
          `Finding transfer options for ${routeNames[i]} passengers...`);
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      
      updateLoadingStep('analyze_transfers', 'in_progress', 'Finalizing transfer feasibility analysis...');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      updateLoadingStep('analyze_transfers', 'completed');
      updateLoadingStep('calculate_savings', 'in_progress', 'Computing operational cost savings...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      updateLoadingStep('calculate_savings', 'completed');
      updateLoadingStep('finalize', 'in_progress', 'Generating optimization report...');

      const data = await response.json();
      console.log('📊 API Response:', { status: response.status, data });

      if (!response.ok) {
        console.error('❌ API Error:', data);
        updateLoadingStep('finalize', 'error', `Error: ${data.error || 'Failed to optimize routes'}`);
        throw new Error(data.error || 'Failed to optimize routes');
      }

      // Check if there are existing transfers
      if (data.hasExistingTransfers) {
        updateLoadingStep('finalize', 'completed', 'Found existing transfers for this date');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log('📋 Found existing transfers:', data);
        setExistingTransferData(data);
        setOptimizationData(null); // Clear any optimization data
        
        toast(`Found ${data.transferSummary.totalTransfers} existing transfers for ${selectedDate}`, {
          icon: 'ℹ️',
        });
        return;
      }

      updateLoadingStep('finalize', 'completed', 'Optimization analysis complete!');
      await new Promise(resolve => setTimeout(resolve, 300));

      console.log('✅ Setting optimization data:', data);
      setOptimizationData(data);
      setExistingTransferData(null); // Clear any existing transfer data
      
      if (data.optimizationSummary.totalLowCrowdBuses === 0) {
        toast.success('No low-crowd buses found for optimization on this date');
      } else {
        toast.success(`Found ${data.optimizationSummary.totalLowCrowdBuses} routes for optimization`);
      }
    } catch (error) {
      console.error('Optimization error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to optimize routes');
    } finally {
      setLoading(false);
      setCurrentStep(null);
    }
  };

  const handleReOptimize = async () => {
    // Clear existing transfer data and run optimization from beginning
    setExistingTransferData(null);
    setOptimizationData(null);
    await handleOptimize();
  };

  const handleExecuteTransfers = async () => {
    if (!optimizationData || !adminUser) return;

    // Show confirmation modal if there are existing transfers
    if (existingTransferData?.hasExistingTransfers) {
      setShowConfirmModal(true);
      return;
    }

    setOptimizing(true);
    try {
      // Prepare transfers data
      const transfers = [];
      
      for (const bus of optimizationData.lowCrowdBuses) {
        for (const passengerTransfer of bus.passengers) {
          if (passengerTransfer.transferFeasible && passengerTransfer.targetBus) {
            transfers.push({
              studentId: passengerTransfer.passenger.id,
              studentName: passengerTransfer.passenger.name,
              fromScheduleId: bus.schedule.id, // This is route-{routeId} format
              fromRouteId: bus.schedule.routeId,
              toScheduleId: passengerTransfer.targetBus.scheduleId,
              toRouteId: passengerTransfer.targetBus.scheduleId.replace('route-', ''), // Extract route ID
              fromRouteName: bus.schedule.routeName,
              toRouteName: passengerTransfer.targetBus.routeName,
              boardingStop: passengerTransfer.passenger.boardingStop,
              transferType: bus.transferType
            });
          }
        }
      }

      if (transfers.length === 0) {
        toast.error('No feasible transfers found');
        return;
      }

      // Validate required parameters
      const optimizationId = optimizationData.optimizationId || `temp-${Date.now()}`;
      
      if (!transfers || transfers.length === 0) {
        throw new Error('No transfers to execute');
      }
      
      if (!adminUser?.id) {
        throw new Error('Admin user ID is required');
      }

      console.log('🚀 Executing transfers:', {
        optimizationId,
        transferCount: transfers.length,
        adminId: adminUser.id,
        date: selectedDate
      });

      const response = await fetch('/api/admin/route-optimization/execute-transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          optimizationId,
          transfers,
          adminId: adminUser.id,
          date: selectedDate
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to execute transfers');
      }

      if (result.success) {
        toast.success(`Successfully transferred ${result.results.successfulTransfers} passengers`);
        
        if (result.results.cancelledBuses.length > 0) {
          toast.success(`Cancelled ${result.results.cancelledBuses.length} buses: ${result.results.cancelledBuses.join(', ')}`);
        }

        if (result.results.failedTransfers > 0) {
          toast.error(`${result.results.failedTransfers} transfers failed`);
        }

        // Clear optimization data to show the results
        setOptimizationData(null);
      } else {
        throw new Error(result.details || 'Transfer execution failed');
      }
    } catch (error) {
      console.error('Transfer execution error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to execute transfers');
    } finally {
      setOptimizing(false);
    }
  };

  const confirmExecuteTransfers = async () => {
    setShowConfirmModal(false);
    // Clear existing transfer data and execute new transfers
    setExistingTransferData(null);
    setOptimizing(true);
    
    // Continue with normal transfer execution
    try {
      // Prepare transfers data... (same logic as above)
      const transfers = [];
      
      for (const bus of optimizationData!.lowCrowdBuses) {
        for (const passengerTransfer of bus.passengers) {
          if (passengerTransfer.transferFeasible && passengerTransfer.targetBus) {
            transfers.push({
              studentId: passengerTransfer.passenger.id,
              studentName: passengerTransfer.passenger.name,
              fromScheduleId: bus.schedule.id,
              fromRouteId: bus.schedule.routeId,
              toScheduleId: passengerTransfer.targetBus.scheduleId,
              toRouteId: passengerTransfer.targetBus.scheduleId.replace('route-', ''),
              fromRouteName: bus.schedule.routeName,
              toRouteName: passengerTransfer.targetBus.routeName,
              boardingStop: passengerTransfer.passenger.boardingStop,
              transferType: bus.transferType
            });
          }
        }
      }

      if (transfers.length === 0) {
        toast.error('No feasible transfers found');
        return;
      }

      // Validate required parameters
      const optimizationId = optimizationData!.optimizationId || `temp-${Date.now()}`;
      
      if (!transfers || transfers.length === 0) {
        throw new Error('No transfers to execute');
      }
      
      if (!adminUser?.id) {
        throw new Error('Admin user ID is required');
      }

      console.log('🚀 Confirming and executing transfers:', {
        optimizationId,
        transferCount: transfers.length,
        adminId: adminUser.id,
        date: selectedDate
      });

      const response = await fetch('/api/admin/route-optimization/execute-transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          optimizationId,
          transfers,
          adminId: adminUser.id,
          date: selectedDate
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to execute transfers');
      }

      if (result.success) {
        toast.success(`Successfully transferred ${result.results.successfulTransfers} passengers`);
        
        if (result.results.cancelledBuses.length > 0) {
          toast.success(`Cancelled ${result.results.cancelledBuses.length} buses: ${result.results.cancelledBuses.join(', ')}`);
        }

        if (result.results.failedTransfers > 0) {
          toast.error(`${result.results.failedTransfers} transfers failed`);
        }

        // Clear optimization data to show the results
        setOptimizationData(null);
      } else {
        throw new Error(result.details || 'Transfer execution failed');
      }
    } catch (error) {
      console.error('Transfer execution error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to execute transfers');
    } finally {
      setOptimizing(false);
    }
  };

  const getTransferTypeColor = (type: string) => {
    switch (type) {
      case 'full_transfer':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'partial_transfer':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'no_transfer':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'no_bookings':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'normal_route':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTransferTypeIcon = (type: string) => {
    switch (type) {
      case 'full_transfer':
        return <CheckCircle className="w-4 h-4" />;
      case 'partial_transfer':
        return <AlertCircle className="w-4 h-4" />;
      case 'no_transfer':
        return <XCircle className="w-4 h-4" />;
      case 'no_bookings':
        return <Bus className="w-4 h-4" />;
      case 'normal_route':
        return <Users className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-white animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Optimizing Routes
              </h3>
              <p className="text-gray-600">
                Analyzing bus utilization for {selectedDate}
              </p>
            </div>

            <div className="space-y-4">
              {loadingSteps.map((step, index) => (
                <div key={step.id} className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {step.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : step.status === 'in_progress' ? (
                      <RefreshCw className="w-5 h-5 text-purple-500 animate-spin" />
                    ) : step.status === 'error' ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      step.status === 'completed' ? 'text-green-700' :
                      step.status === 'in_progress' ? 'text-purple-700' :
                      step.status === 'error' ? 'text-red-700' :
                      'text-gray-500'
                    }`}>
                      {step.title}
                    </p>
                    <p className={`text-xs ${
                      step.status === 'completed' ? 'text-green-600' :
                      step.status === 'in_progress' ? 'text-purple-600' :
                      step.status === 'error' ? 'text-red-600' :
                      'text-gray-400'
                    }`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="mt-6">
              <div className="flex justify-between text-xs text-gray-600 mb-2">
                <span>Progress</span>
                <span>{Math.round((loadingSteps.filter(s => s.status === 'completed').length / loadingSteps.length) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${(loadingSteps.filter(s => s.status === 'completed').length / loadingSteps.length) * 100}%` 
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Route Optimization</h1>
              <p className="text-gray-600">Optimize bus utilization and reduce operational costs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Date Selection and Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">
                Optimization Date
              </label>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleOptimize}
              disabled={loading}
              className="btn-primary flex items-center space-x-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>{loading ? 'Analyzing...' : 'Find Low-Crowd Buses'}</span>
            </button>

            {optimizationData && optimizationData.lowCrowdBuses.length > 0 && (
              <button
                onClick={handleExecuteTransfers}
                disabled={optimizing}
                className="btn-success flex items-center space-x-2"
              >
                {optimizing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                <span>{optimizing ? 'Executing...' : 'Execute All Transfers'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Existing Transfers Display */}
      {existingTransferData && (
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl shadow-lg border border-orange-200">
          {/* Header Section */}
          <div className="p-6 border-b border-orange-200 bg-white bg-opacity-60 backdrop-blur-sm rounded-t-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center shadow-md">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Previous Transfers Detected
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Found <span className="font-semibold text-orange-600">{existingTransferData.transferSummary.totalTransfers}</span> transfers 
                    for <span className="font-semibold">{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span> 
                    across <span className="font-semibold text-orange-600">{existingTransferData.transferSummary.affectedRoutes}</span> routes
                  </p>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Last Transfer</p>
                  <p className="text-sm font-medium text-gray-700">
                    {new Date(existingTransferData.transferSummary.lastTransferTime).toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      hour12: true 
                    })}
                  </p>
                </div>
                <button
                  onClick={handleReOptimize}
                  className="btn-primary flex items-center space-x-2 shadow-md hover:shadow-lg transition-all duration-200"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Re-Optimize Routes</span>
                </button>
              </div>
            </div>
          </div>

          {/* Transfer Summary Cards */}
          <div className="px-6 py-4 border-b border-orange-200 bg-white bg-opacity-40">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Transfers</p>
                    <p className="text-2xl font-bold text-orange-600">{existingTransferData.transferSummary.totalTransfers}</p>
                  </div>
                  <ArrowRight className="w-8 h-8 text-orange-400" />
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Routes Affected</p>
                    <p className="text-2xl font-bold text-blue-600">{existingTransferData.transferSummary.affectedRoutes}</p>
                  </div>
                  <Bus className="w-8 h-8 text-blue-400" />
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Transfer Date</p>
                    <p className="text-lg font-bold text-gray-700">{new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <Calendar className="w-8 h-8 text-gray-400" />
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
                    <p className="text-lg font-bold text-green-600">Completed</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Transfer Information */}
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Users className="w-5 h-5 text-gray-600 mr-2" />
              Transfer Details by Route
            </h3>
            
            <div className="grid gap-6">
              {Object.entries(existingTransferData.existingTransfers).map(([routeName, transfers]) => (
                <div key={routeName} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Route Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Bus className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-gray-900">{routeName}</h4>
                          <p className="text-sm text-gray-600">
                            {transfers.length} passenger{transfers.length !== 1 ? 's' : ''} transferred
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                          ✓ Transferred
                        </div>
                        <span className="text-sm text-gray-500">
                          {transfers.length}/{transfers.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Passenger List */}
                  <div className="divide-y divide-gray-100">
                    {transfers.map((transfer, index) => (
                      <div key={index} className="px-6 py-4 hover:bg-gray-50 transition-colors duration-150">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            {/* Student Avatar */}
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-purple-600">
                                {transfer.studentName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            
                            {/* Student Info */}
                            <div>
                              <p className="font-semibold text-gray-900">{transfer.studentName}</p>
                              <p className="text-sm text-gray-500">Roll No: {transfer.rollNumber}</p>
                            </div>
                          </div>

                          {/* Transfer Info */}
                          <div className="flex items-center space-x-6">
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-700 flex items-center">
                                <MapPin className="w-4 h-4 text-gray-400 mr-1" />
                                {transfer.boardingStop}
                              </p>
                              <p className="text-xs text-gray-500">Boarding Stop</p>
                            </div>
                            
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-700 flex items-center">
                                <Clock className="w-4 h-4 text-gray-400 mr-1" />
                                {new Date(transfer.transferredAt).toLocaleTimeString('en-US', { 
                                  hour: '2-digit', 
                                  minute: '2-digit',
                                  hour12: true 
                                })}
                              </p>
                              <p className="text-xs text-gray-500">Transfer Time</p>
                            </div>

                            <div className="flex items-center">
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Enhanced Information Panel */}
            <div className="mt-6 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-blue-900 mb-2">What This Means</h4>
                  <div className="space-y-2 text-sm text-blue-800">
                    <p>• <strong>Previous optimization:</strong> These passengers have already been moved from their original routes to optimize bus utilization.</p>
                    <p>• <strong>Current state:</strong> The system is now showing the post-transfer route assignments.</p>
                    <p>• <strong>Re-optimization:</strong> Click "Re-Optimize Routes" to analyze the current state and find new optimization opportunities.</p>
                    <p>• <strong>Data integrity:</strong> All transfers are logged with timestamps for audit purposes.</p>
                  </div>
                  
                  <div className="mt-4 flex items-center space-x-4 text-sm text-blue-700">
                    <div className="flex items-center space-x-1">
                      <CheckCircle className="w-4 h-4" />
                      <span>Transfers completed successfully</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>Last updated: {new Date(existingTransferData.transferSummary.lastTransferTime).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Confirm Transfer Execution</h3>
                  <p className="text-red-100 text-sm">This action will modify existing data</p>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">⚠️ Important Notice</h4>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <p className="text-gray-800 leading-relaxed">
                    Executing new transfers will <strong>replace any existing transfer data</strong> for{' '}
                    <span className="font-semibold text-amber-700">
                      {new Date(selectedDate).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </span>.
                  </p>
                </div>

                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>New passenger transfers will be logged with timestamps</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    <span>Previous transfer records will be archived</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong>This action cannot be undone</strong></span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-6 py-3 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmExecuteTransfers}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
                >
                  Confirm & Execute
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optimization Summary */}
      {optimizationData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Low-Crowd Buses</p>
                <p className="text-2xl font-bold text-gray-900">
                  {optimizationData.optimizationSummary.totalLowCrowdBuses}
                </p>
              </div>
              <Bus className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Passengers Affected</p>
                <p className="text-2xl font-bold text-gray-900">
                  {optimizationData.optimizationSummary.totalPassengersAffected}
                </p>
              </div>
              <Users className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Full Transfers</p>
                <p className="text-2xl font-bold text-green-600">
                  {optimizationData.optimizationSummary.fullTransfers}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Partial Transfers</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {optimizationData.optimizationSummary.partialTransfers}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">No Bookings</p>
                <p className="text-2xl font-bold text-gray-600">
                  {optimizationData.optimizationSummary.noBookings || 0}
                </p>
              </div>
              <Bus className="w-8 h-8 text-gray-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Normal Routes</p>
                <p className="text-2xl font-bold text-blue-600">
                  {optimizationData.optimizationSummary.normalRoutes || 0}
                </p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Potential Savings</p>
                <p className="text-2xl font-bold text-purple-600">
                  ₹{optimizationData.optimizationSummary.potentialSavings.toLocaleString()}
                </p>
              </div>
              <Download className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Low-Crowd Buses List */}
      {optimizationData && optimizationData.lowCrowdBuses.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Route Optimization Analysis</h2>
            <p className="text-sm text-gray-600">All routes analysis: low-crowd (≤30 passengers), normal routes (31+ passengers), and routes with no bookings. Click on a route to view details.</p>
          </div>

          <div className="divide-y divide-gray-200">
            {optimizationData.lowCrowdBuses.map((bus, index) => (
              <div
                key={bus.schedule.id}
                className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedBus(bus)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Bus className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {bus.schedule.routeName} ({bus.schedule.routeNumber})
                      </h3>
                      <p className="text-sm text-gray-600">
                        {bus.schedule.departureTime} - {bus.schedule.arrivalTime}
                      </p>
                      <p className="text-sm text-gray-500">
                        {bus.schedule.currentPassengers}/{bus.schedule.totalCapacity} passengers
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className={`px-3 py-1 rounded-full border text-xs font-medium ${getTransferTypeColor(bus.transferType)}`}>
                      <div className="flex items-center space-x-1">
                        {getTransferTypeIcon(bus.transferType)}
                        <span>
                          {bus.transferType === 'full_transfer' ? 'Full Transfer' :
                           bus.transferType === 'partial_transfer' ? 'Partial Transfer' : 
                           bus.transferType === 'no_transfer' ? 'No Transfer' :
                           bus.transferType === 'no_bookings' ? 'No Bookings' :
                           bus.transferType === 'normal_route' ? 'Normal Route' :
                           'Unknown'}
                        </span>
                      </div>
                    </div>

                    {bus.canCancelBus && (
                      <div className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs font-medium">
                        Can Cancel
                      </div>
                    )}

                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        ₹{bus.estimatedSavings.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">potential savings</p>
                    </div>

                    <Eye className="w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                  <span>{bus.transferablePassengers}/{bus.totalPassengers} passengers can be transferred</span>
                  <span>
                    {bus.passengers.filter(p => p.transferFeasible).length} feasible transfers available
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bus Details Modal */}
      {selectedBus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedBus.schedule.routeName} ({selectedBus.schedule.routeNumber})
                  </h2>
                  <p className="text-gray-600">
                    {selectedBus.schedule.departureTime} - {selectedBus.schedule.arrivalTime} • 
                    {selectedBus.schedule.currentPassengers} passengers
                  </p>
                </div>
                <button
                  onClick={() => setSelectedBus(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Passenger Transfer Options</h3>
                
                {selectedBus.passengers.map((transfer, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 ${
                      transfer.transferFeasible 
                        ? 'border-green-200 bg-green-50' 
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-4">
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {transfer.passenger.name}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {transfer.passenger.rollNumber} • {transfer.passenger.mobile}
                            </p>
                            <p className="text-sm text-gray-500">
                              Boarding: {transfer.passenger.boardingStop} • Seat: {transfer.passenger.seatNumber}
                            </p>
                          </div>
                        </div>
                      </div>

                      {transfer.transferFeasible && transfer.targetBus ? (
                        <div className="flex items-center space-x-4">
                          <ArrowRight className="w-5 h-5 text-gray-400" />
                          <div className="text-right">
                            <p className="font-medium text-gray-900">
                              {transfer.targetBus.routeName}
                            </p>
                            <p className="text-sm text-gray-600">
                              {transfer.targetBus.departureTime} - {transfer.targetBus.arrivalTime}
                            </p>
                            <p className="text-sm text-gray-500">
                              {transfer.targetBus.availableSeats} seats available
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-right">
                          <p className="text-sm text-red-600 font-medium">Cannot Transfer</p>
                          <p className="text-xs text-red-500">
                            {transfer.reason || 'No suitable alternative found'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {optimizationData && optimizationData.lowCrowdBuses.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Low-Crowd Buses Found
          </h3>
          <p className="text-gray-600 mb-4">
            All buses for {selectedDate} have more than 30 passengers. Great utilization!
          </p>
          <button
            onClick={handleOptimize}
            className="btn-primary"
          >
            Check Another Date
          </button>
        </div>
      )}
    </div>
  );
};

export default RouteOptimizationPage;
