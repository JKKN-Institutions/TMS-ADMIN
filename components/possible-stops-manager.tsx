"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  MapPin, 
  Clock, 
  Plus, 
  Trash2, 
  Edit, 
  Save, 
  X,
  Search,
  Route as RouteIcon
} from 'lucide-react';
import { toast } from 'sonner';
import StopSearchModal from './stop-search-modal';

interface PossibleStop {
  id: string;
  stop_name: string;
  stop_time: string;
  sequence_order: number;
  source_route_id: string;
  latitude?: number;
  longitude?: number;
  is_major_stop: boolean;
  source_route?: {
    id: string;
    route_name: string;
  };
}

interface PossibleStopsManagerProps {
  routeId: string;
  routeName: string;
}

export default function PossibleStopsManager({ routeId, routeName }: PossibleStopsManagerProps) {
  const [possibleStops, setPossibleStops] = useState<PossibleStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingStop, setEditingStop] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PossibleStop>>({});
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Fetch possible stops
  const fetchPossibleStops = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/routes/${routeId}/possible-stops`);
      if (!response.ok) {
        throw new Error('Failed to fetch possible stops');
      }
      
      const data = await response.json();
      setPossibleStops(data.possibleStops || []);
    } catch (error) {
      console.error('Error fetching possible stops:', error);
      toast.error('Failed to load possible stops');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (routeId) {
      fetchPossibleStops();
    }
  }, [routeId]);

  // Add new possible stops
  const handleAddStops = async (stops: Array<any>) => {
    try {
      console.log('Adding stops:', stops);
      const stopsToAdd = stops.map((stop, index) => ({
        stop_name: stop.stop_name,
        stop_time: stop.stop_time,
        sequence_order: possibleStops.length + index + 1,
        source_route_id: stop.source_route_id,
        latitude: stop.latitude,
        longitude: stop.longitude,
        is_major_stop: stop.is_major_stop
      }));
      
      console.log('Prepared stops for API:', stopsToAdd);

      console.log('Making API request to:', `/api/admin/routes/${routeId}/possible-stops`);
      console.log('Request payload:', JSON.stringify({ possibleStops: stopsToAdd }));
      
      const response = await fetch(`/api/admin/routes/${routeId}/possible-stops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ possibleStops: stopsToAdd }),
      });

      console.log('API response status:', response.status);
      
      if (!response.ok) {
        console.log('=== ERROR RESPONSE DEBUG ===');
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        let errorData = {};
        let responseText = '';
        
        try {
          responseText = await response.text();
          console.log('Raw error response text:', responseText);
          console.log('Response text length:', responseText.length);
          console.log('Response text type:', typeof responseText);
          
          if (responseText && responseText.trim()) {
            errorData = JSON.parse(responseText);
            console.log('Parsed error data:', errorData);
          } else {
            console.log('Empty response body received');
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          console.log('Raw response that failed to parse:', responseText);
        }
        
        // Debug: API error details (can be removed in production)
        console.log('API error details:', response.status, errorData);
        
        // Handle specific error types with user-friendly messages
        if (response.status === 400 && errorData.errorType === 'foreign_key_constraint') {
          toast.error('Invalid route data - please refresh and try again');
          return;
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to add possible stops`);
      }
      
      const responseData = await response.json();
      console.log('API response data:', responseData);

      // Handle partial success responses
      const { addedCount = 0, skippedCount = 0, skippedStops = [] } = responseData;
      
      if (addedCount > 0 && skippedCount > 0) {
        // Partial success: some added, some skipped
        const skippedNames = skippedStops.map((stop: any) => stop.stop_name).join(', ');
        toast.success(`Added ${addedCount} new stop${addedCount !== 1 ? 's' : ''}. Skipped ${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''}: ${skippedNames}`);
      } else if (addedCount > 0) {
        // Full success: all stops added
        toast.success(`Successfully added ${addedCount} possible stop${addedCount !== 1 ? 's' : ''}`);
      } else if (skippedCount > 0) {
        // All duplicates: nothing added
        const skippedNames = skippedStops.map((stop: any) => stop.stop_name).join(', ');
        toast.warning(`All selected stops were already present: ${skippedNames}`);
      } else {
        // Fallback success message
        toast.success('Possible stops processed successfully');
      }
      
      fetchPossibleStops();
    } catch (error) {
      console.error('Error adding possible stops:', error);
      toast.error('Failed to add possible stops');
    }
  };

  // Delete possible stop
  const handleDeleteStop = async (stopId: string) => {
    if (!confirm('Are you sure you want to remove this possible stop?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/routes/${routeId}/possible-stops?stopId=${stopId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete possible stop');
      }

      toast.success('Possible stop removed');
      fetchPossibleStops();
    } catch (error) {
      console.error('Error deleting possible stop:', error);
      toast.error('Failed to remove possible stop');
    }
  };

  // Start editing
  const handleEditStart = (stop: PossibleStop) => {
    setEditingStop(stop.id);
    setEditForm({
      stop_name: stop.stop_name,
      stop_time: stop.stop_time,
      sequence_order: stop.sequence_order,
      is_major_stop: stop.is_major_stop
    });
  };

  // Cancel editing
  const handleEditCancel = () => {
    setEditingStop(null);
    setEditForm({});
  };

  // Save edit
  const handleEditSave = async (stopId: string) => {
    try {
      // For now, we'll implement a simple update via delete and re-add
      // In a production app, you'd want a proper PATCH endpoint
      const stopToUpdate = possibleStops.find(s => s.id === stopId);
      if (!stopToUpdate) return;

      const updatedStop = {
        ...stopToUpdate,
        ...editForm
      };

      // Delete the old stop
      await fetch(`/api/admin/routes/${routeId}/possible-stops?stopId=${stopId}`, {
        method: 'DELETE',
      });

      // Add the updated stop
      await fetch(`/api/admin/routes/${routeId}/possible-stops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          possibleStops: [{
            stop_name: updatedStop.stop_name,
            stop_time: updatedStop.stop_time,
            sequence_order: updatedStop.sequence_order,
            source_route_id: updatedStop.source_route_id,
            latitude: updatedStop.latitude,
            longitude: updatedStop.longitude,
            is_major_stop: updatedStop.is_major_stop
          }]
        }),
      });

      toast.success('Possible stop updated');
      setEditingStop(null);
      setEditForm({});
      fetchPossibleStops();
    } catch (error) {
      console.error('Error updating possible stop:', error);
      toast.error('Failed to update possible stop');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RouteIcon className="h-5 w-5" />
            Possible Stops
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <RouteIcon className="h-5 w-5" />
              Possible Stops
              <Badge variant="secondary">{possibleStops.length}</Badge>
            </CardTitle>
            <Button onClick={() => setShowSearchModal(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Possible Stops
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Possible stops are regular stops from other routes where buses can potentially stop
          </p>
        </CardHeader>
        <CardContent>
          {possibleStops.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No possible stops added</p>
              <p className="text-sm mb-4">
                Add possible stops from other routes to provide more flexibility for passengers
              </p>
              <Button onClick={() => setShowSearchModal(true)} className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search & Add Stops
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {possibleStops
                .sort((a, b) => a.sequence_order - b.sequence_order)
                .map((stop) => (
                  <div
                    key={stop.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      {editingStop === stop.id ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor={`stop-name-${stop.id}`}>Stop Name</Label>
                            <Input
                              id={`stop-name-${stop.id}`}
                              value={editForm.stop_name || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, stop_name: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`stop-time-${stop.id}`}>Stop Time</Label>
                            <Input
                              id={`stop-time-${stop.id}`}
                              type="time"
                              value={editForm.stop_time || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, stop_time: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`sequence-${stop.id}`}>Sequence</Label>
                            <Input
                              id={`sequence-${stop.id}`}
                              type="number"
                              value={editForm.sequence_order || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, sequence_order: parseInt(e.target.value) }))}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              #{stop.sequence_order}
                            </Badge>
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{stop.stop_name}</span>
                            {stop.is_major_stop && (
                              <Badge variant="secondary" className="text-xs">Major</Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{stop.stop_time}</span>
                            </div>
                            
                            {stop.source_route && (
                              <div className="flex items-center gap-1">
                                <RouteIcon className="h-3 w-3" />
                                <span className="text-xs">from {stop.source_route.route_name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {editingStop === stop.id ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditSave(stop.id)}
                            className="flex items-center gap-1"
                          >
                            <Save className="h-3 w-3" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleEditCancel}
                            className="flex items-center gap-1"
                          >
                            <X className="h-3 w-3" />
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditStart(stop)}
                            className="flex items-center gap-1"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteStop(stop.id)}
                            className="flex items-center gap-1 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <StopSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectStops={handleAddStops}
        excludeRouteId={routeId}
      />
    </>
  );
}
