"use client";

import React, { useState, useEffect, useCallback } from 'react';
// Temporarily using a simple modal instead of Radix Dialog to fix infinite loop
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
// Temporarily using simple div instead of ScrollArea to avoid potential issues
// import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, MapPin, Clock, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface Stop {
  id: string;
  stop_name: string;
  stop_time: string;
  sequence_order: number;
  latitude?: number;
  longitude?: number;
  is_major_stop: boolean;
  morning_arrival_time?: string;
  evening_arrival_time?: string;
  route_id?: string;
}

interface Route {
  id: string;
  route_name: string;
  route_code?: string;
}

interface GroupedStop {
  route: Route;
  stops: Stop[];
}

interface StopSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStops: (stops: Array<Stop & { source_route_id: string; source_route_name: string }>) => void;
  excludeRouteId?: string;
  selectedStops?: Array<Stop & { source_route_id: string }>;
}

export default function StopSearchModal({
  isOpen,
  onClose,
  onSelectStops,
  excludeRouteId,
  selectedStops = []
}: StopSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GroupedStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [tempSelectedStops, setTempSelectedStops] = useState<Array<Stop & { source_route_id: string; source_route_name: string }>>([]);

  // Debounced search function
  const searchStops = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        limit: '50'
      });
      
      if (excludeRouteId) {
        params.append('excludeRouteId', excludeRouteId);
      }

      console.log('Searching stops with params:', params.toString());
      const response = await fetch(`/api/admin/routes/search-stops?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Search API error:', response.status, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to search stops`);
      }

      const data = await response.json();
      console.log('Search results:', data);
      
      // Handle the properly grouped response from API
      setSearchResults(data.stops || []);
    } catch (error) {
      console.error('Error searching stops:', error);
      toast.error('Failed to search stops');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [excludeRouteId]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchStops(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]); // Removed searchStops from dependencies to prevent infinite loop

  // Initialize temp selected stops
  useEffect(() => {
    if (isOpen) {
      setTempSelectedStops(selectedStops.map(stop => ({
        ...stop,
        source_route_name: stop.source_route_name || 'Unknown Route'
      })));
    }
  }, [isOpen]); // Removed selectedStops from dependencies to prevent unnecessary re-renders

  const handleStopToggle = (stop: Stop, route: Route) => {
    const stopWithSource = {
      ...stop,
      source_route_id: stop.route_id, // Always use the actual route_id from the stop
      source_route_name: route.route_name
    };
    
    // Validate that we have a valid source_route_id
    if (!stopWithSource.source_route_id) {
      console.error('Invalid stop data - missing route_id:', stop);
      toast.error('Invalid stop data - missing route information');
      return;
    }

    const isSelected = tempSelectedStops.some(s => s.id === stop.id);
    
    if (isSelected) {
      setTempSelectedStops(prev => prev.filter(s => s.id !== stop.id));
    } else {
      setTempSelectedStops(prev => [...prev, stopWithSource]);
    }
  };

  const handleRemoveSelected = (stopId: string) => {
    setTempSelectedStops(prev => prev.filter(s => s.id !== stopId));
  };

  const handleConfirm = () => {
    onSelectStops(tempSelectedStops);
    onClose();
  };

  const handleCancel = () => {
    setTempSelectedStops([]);
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  const isStopSelected = (stopId: string) => {
    return tempSelectedStops.some(s => s.id === stopId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={handleCancel}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold">Add Possible Stops</h2>
            <p className="text-sm text-muted-foreground">
              Search and select regular stops from other routes to add as possible stops
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col space-y-4 p-6">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search for stops by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Selected Stops Summary */}
          {tempSelectedStops.length > 0 && (
            <div className="border rounded-lg p-3 bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">Selected Stops ({tempSelectedStops.length})</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {tempSelectedStops.map((stop) => (
                  <Badge key={stop.id} variant="secondary" className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {stop.stop_name}
                    <span className="text-xs opacity-70">({stop.source_route_name})</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => handleRemoveSelected(stop.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Search Results */}
          <div className="flex-1 border rounded-lg">
            <div className="h-[400px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="p-4 space-y-4">
                  {searchResults.map((group) => (
                    <div key={group.route.id} className="space-y-2">
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <Badge variant="outline" className="font-medium">
                          {group.route.route_name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {group.stops.length} stops
                        </span>
                      </div>
                      
                      <div className="grid gap-2">
                        {group.stops.map((stop) => {
                          const selected = isStopSelected(stop.id);
                          return (
                            <div
                              key={stop.id}
                              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                selected 
                                  ? 'bg-primary/10 border-primary' 
                                  : 'hover:bg-muted/50'
                              }`}
                              onClick={() => handleStopToggle(stop, group.route)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{stop.stop_name}</span>
                                  {stop.is_major_stop && (
                                    <Badge variant="secondary" className="text-xs">Major</Badge>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>{stop.stop_time}</span>
                                  {stop.morning_arrival_time && (
                                    <span className="text-xs">
                                      (M: {stop.morning_arrival_time})
                                    </span>
                                  )}
                                  {stop.evening_arrival_time && (
                                    <span className="text-xs">
                                      (E: {stop.evening_arrival_time})
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <Button
                                variant={selected ? "default" : "outline"}
                                size="sm"
                                className="ml-2"
                              >
                                {selected ? (
                                  <>
                                    <X className="h-4 w-4 mr-1" />
                                    Remove
                                  </>
                                ) : (
                                  <>
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add
                                  </>
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchQuery.trim() ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  <div className="text-center">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No stops found for "{searchQuery}"</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  <div className="text-center">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Start typing to search for stops</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={tempSelectedStops.length === 0}
            >
              Add {tempSelectedStops.length} Stop{tempSelectedStops.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
