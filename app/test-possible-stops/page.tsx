"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import StopSearchModal from '@/components/stop-search-modal';
import PossibleStopsManager from '@/components/possible-stops-manager';

export default function TestPossibleStops() {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedStops, setSelectedStops] = useState<any[]>([]);

  const handleSelectStops = (stops: any[]) => {
    setSelectedStops(stops);
    console.log('Selected stops:', stops);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Test Possible Stops Implementation</h1>
        <p className="text-gray-600 mb-6">
          This page tests the possible stops functionality including search and management.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Search Modal Test */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Search Modal Test</h2>
          <div className="p-4 border rounded-lg bg-gray-50">
            <p className="text-sm text-gray-600 mb-4">
              Test the stop search modal functionality
            </p>
            <Button onClick={() => setShowSearchModal(true)}>
              Open Search Modal
            </Button>
            
            {selectedStops.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Selected Stops ({selectedStops.length}):</h3>
                <div className="space-y-2">
                  {selectedStops.map((stop, index) => (
                    <div key={stop.id || index} className="text-sm p-2 bg-white rounded border">
                      <div className="font-medium">{stop.stop_name}</div>
                      <div className="text-gray-500">
                        Time: {stop.stop_time} | Route: {stop.source_route_name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Possible Stops Manager Test */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Possible Stops Manager Test</h2>
          <div className="p-4 border rounded-lg bg-gray-50">
            <p className="text-sm text-gray-600 mb-4">
              Test with a sample route ID (ANTHIYUR route)
            </p>
            <PossibleStopsManager 
              routeId="2327dd44-59a6-45cb-840b-4a22fd0892cf" 
              routeName="ANTHIYUR"
            />
          </div>
        </div>
      </div>

      {/* API Test Section */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">API Test Results</h2>
        <div className="p-4 border rounded-lg bg-gray-50">
          <p className="text-sm text-gray-600 mb-4">
            Test API endpoints directly:
          </p>
          <div className="space-y-2 text-sm font-mono">
            <div>✅ GET /api/admin/routes/search-stops?q=college&limit=5</div>
            <div>✅ GET /api/admin/routes/[routeId]/possible-stops</div>
            <div>✅ POST /api/admin/routes/[routeId]/possible-stops</div>
            <div>✅ DELETE /api/admin/routes/[routeId]/possible-stops</div>
          </div>
        </div>
      </div>

      <StopSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectStops={handleSelectStops}
        excludeRouteId="2327dd44-59a6-45cb-840b-4a22fd0892cf"
      />
    </div>
  );
}
