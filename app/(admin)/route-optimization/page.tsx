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
  RefreshCw
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
  transferType: 'full_transfer' | 'partial_transfer' | 'no_transfer' | 'no_bookings';
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
  potentialSavings: number;
}

const RouteOptimizationPage = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationData, setOptimizationData] = useState<{
    optimizationId?: string;
    lowCrowdBuses: OptimizationResult[];
    optimizationSummary: OptimizationSummary;
  } | null>(null);
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

  const handleOptimize = async () => {
    console.log('🔍 Starting optimization...', { selectedDate, adminUser });
    
    if (!adminUser) {
      console.error('❌ Admin user not found');
      toast.error('Admin user not found');
      return;
    }

    setLoading(true);
    try {
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

      const data = await response.json();
      console.log('📊 API Response:', { status: response.status, data });

      if (!response.ok) {
        console.error('❌ API Error:', data);
        throw new Error(data.error || 'Failed to optimize routes');
      }

      console.log('✅ Setting optimization data:', data);
      setOptimizationData(data);
      
      if (data.optimizationSummary.totalLowCrowdBuses === 0) {
        toast.success('No low-crowd buses found for optimization on this date');
      } else {
        toast.success(`Found ${data.optimizationSummary.totalLowCrowdBuses} buses for optimization`);
      }
    } catch (error) {
      console.error('Optimization error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to optimize routes');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTransfers = async () => {
    if (!optimizationData || !adminUser) return;

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
              fromScheduleId: bus.schedule.id,
              toScheduleId: passengerTransfer.targetBus.scheduleId,
              fromRouteName: bus.schedule.routeName,
              toRouteName: passengerTransfer.targetBus.routeName,
              toRouteId: passengerTransfer.targetBus.scheduleId, // This should be route ID, but we'll use schedule for now
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

      const response = await fetch('/api/admin/route-optimization/execute-transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          optimizationId: optimizationData.optimizationId,
          transfers,
          adminId: adminUser.id
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

        // Refresh optimization data
        handleOptimize();
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
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
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
            <p className="text-sm text-gray-600">Low-crowd routes (≤30 passengers) and routes with no bookings. Click on a bus to view details.</p>
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
                           'No Bookings'}
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
