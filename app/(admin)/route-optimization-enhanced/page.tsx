'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Bus, Users, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';

interface PassengerTransfer {
  studentId: string;
  studentName: string;
  rollNumber: string;
  currentStop: string;
  targetRoute: string;
  targetRouteId: string;
  matchingStop: string;
  stopCategory: 'regular' | 'possible';
  sourceRouteName?: string;
  availableCapacity: number;
  transferType: 'regular_stop' | 'possible_stop';
}

interface RouteOptimizationResult {
  routeId: string;
  routeName: string;
  routeNumber: string;
  currentPassengers: number;
  transferablePassengers: number;
  transferClassification: 'full_transfer' | 'partial_transfer' | 'no_transfer';
  potentialSavings: number;
  passengerTransfers: PassengerTransfer[];
  enhancedStopsUsed: number;
}

interface OptimizationSummary {
  totalLowCrowdBuses: number;
  totalPassengersAffected: number;
  fullTransfers: number;
  partialTransfers: number;
  noTransfers: number;
  potentialSavings: number;
  enhancedStopsUsed: number;
}

export default function EnhancedRouteOptimizationPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    summary: OptimizationSummary;
    lowCrowdRoutes: RouteOptimizationResult[];
    optimizationId: string;
    useEnhancedStops: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOptimization = async (useEnhancedStops: boolean = true) => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/api/admin/route-optimization/enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date,
          adminId: 'test-admin-id', // In real app, get from session
          useEnhancedStops
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to perform optimization');
      }

      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getTransferBadgeColor = (classification: string) => {
    switch (classification) {
      case 'full_transfer': return 'bg-green-500';
      case 'partial_transfer': return 'bg-yellow-500';
      case 'no_transfer': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStopCategoryBadge = (category: 'regular' | 'possible', sourceRouteName?: string) => {
    if (category === 'regular') {
      return <Badge variant="default" className="bg-blue-500">Regular Stop</Badge>;
    } else {
      return (
        <Badge variant="outline" className="border-purple-500 text-purple-700">
          Possible Stop {sourceRouteName && `(from ${sourceRouteName})`}
        </Badge>
      );
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Enhanced Route Optimization</h1>
          <p className="text-gray-600 mt-2">
            Advanced route optimization using regular and possible stops from overlapping routes
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Optimization Settings</CardTitle>
          <CardDescription>
            Configure the date and options for route optimization analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Optimization Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          
          <div className="flex gap-4">
            <Button 
              onClick={() => handleOptimization(true)} 
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enhanced Optimization (Regular + Possible Stops)
            </Button>
            
            <Button 
              onClick={() => handleOptimization(false)} 
              disabled={loading}
              variant="outline"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Standard Optimization (Regular Stops Only)
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Bus className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm text-gray-600">Low-Crowd Buses</p>
                    <p className="text-2xl font-bold">{results.summary.totalLowCrowdBuses}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm text-gray-600">Transferable Passengers</p>
                    <p className="text-2xl font-bold">{results.summary.totalPassengersAffected}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm text-gray-600">Enhanced Stops Used</p>
                    <p className="text-2xl font-bold">{results.summary.enhancedStopsUsed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="h-5 w-5 bg-green-500 rounded-full" />
                  <div>
                    <p className="text-sm text-gray-600">Potential Savings</p>
                    <p className="text-2xl font-bold">₹{results.summary.potentialSavings}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Enhancement Notice */}
          {results.useEnhancedStops && results.summary.enhancedStopsUsed > 0 && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Enhanced optimization enabled! Found {results.summary.enhancedStopsUsed} additional transfer opportunities 
                using possible stops from overlapping routes.
              </AlertDescription>
            </Alert>
          )}

          {/* Route Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Route Analysis Results</CardTitle>
              <CardDescription>
                Detailed analysis of low-crowd routes and transfer opportunities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="details">Transfer Details</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-4">
                  {results.lowCrowdRoutes.map((route) => (
                    <Card key={route.routeId}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-lg">{route.routeName}</h3>
                            <p className="text-gray-600">Route {route.routeNumber}</p>
                            <div className="flex items-center space-x-4 mt-2">
                              <span className="text-sm">
                                <strong>{route.currentPassengers}</strong> passengers
                              </span>
                              <span className="text-sm">
                                <strong>{route.transferablePassengers}</strong> transferable
                              </span>
                              {route.enhancedStopsUsed > 0 && (
                                <Badge variant="outline" className="border-purple-500 text-purple-700">
                                  +{route.enhancedStopsUsed} enhanced transfers
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className={getTransferBadgeColor(route.transferClassification)}>
                              {route.transferClassification.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <p className="text-sm text-gray-600 mt-1">
                              Savings: ₹{route.potentialSavings}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
                
                <TabsContent value="details" className="space-y-4">
                  {results.lowCrowdRoutes.map((route) => (
                    <Card key={route.routeId}>
                      <CardHeader>
                        <CardTitle className="text-lg">{route.routeName} - Transfer Details</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {route.passengerTransfers.length > 0 ? (
                          <div className="space-y-3">
                            {route.passengerTransfers.map((transfer, index) => (
                              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex-1">
                                  <p className="font-medium">{transfer.studentName}</p>
                                  <p className="text-sm text-gray-600">{transfer.rollNumber}</p>
                                  <p className="text-sm">From: {transfer.currentStop}</p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-gray-400 mx-4" />
                                <div className="flex-1">
                                  <p className="font-medium">{transfer.targetRoute}</p>
                                  <p className="text-sm">Stop: {transfer.matchingStop}</p>
                                  <div className="mt-1">
                                    {getStopCategoryBadge(transfer.stopCategory, transfer.sourceRouteName)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-gray-600">
                                    Capacity: {transfer.availableCapacity}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-600">No transfer opportunities found for this route.</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
