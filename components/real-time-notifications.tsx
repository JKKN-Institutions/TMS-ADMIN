'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Bell, 
  X,
  CheckCircle,
  AlertTriangle,
  Clock,
  MessageSquare,
  User,
  Settings,
  Volume2,
  VolumeX
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

interface NotificationProps {
  userId: string;
  userType: 'admin' | 'student';
  className?: string;
}

interface Notification {
  id: string;
  type: 'assignment' | 'status_change' | 'message' | 'deadline' | 'escalation';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionUrl?: string;
  actionLabel?: string;
  grievanceId?: string;
  relatedUser?: {
    id: string;
    name: string;
    role?: string;
  };
}

interface NotificationSettings {
  soundEnabled: boolean;
  assignments: boolean;
  statusChanges: boolean;
  messages: boolean;
  deadlines: boolean;
  escalations: boolean;
}

export default function RealTimeNotifications({ userId, userType, className }: NotificationProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    soundEnabled: true,
    assignments: true,
    statusChanges: true,
    messages: true,
    deadlines: true,
    escalations: true
  });
  const [showSettings, setShowSettings] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastFetchRef = useRef<string>(new Date().toISOString());

  // Simulated notification sounds
  const playNotificationSound = useCallback((priority: string) => {
    if (!settings.soundEnabled) return;
    
    // Create audio context for different notification sounds
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Different frequencies for different priorities
    const frequencies = {
      urgent: [800, 1000, 800],
      high: [600, 800],
      medium: [400],
      low: [300]
    };
    
    const freqs = frequencies[priority as keyof typeof frequencies] || [400];
    
    freqs.forEach((freq, index) => {
      setTimeout(() => {
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        if (index === 0) {
          oscillator.start(audioContext.currentTime);
        }
        if (index === freqs.length - 1) {
          oscillator.stop(audioContext.currentTime + 0.3);
        }
      }, index * 200);
    });
  }, [settings.soundEnabled]);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/${userType === 'admin' ? 'admin' : 'student'}/notifications?userId=${userId}&since=${lastFetchRef.current}`
      );
      
      if (!response.ok) {
        console.warn('Failed to fetch notifications');
        return;
      }
      
      const result = await response.json();
      
      if (result.success && result.data.notifications) {
        const newNotifications = result.data.notifications as Notification[];
        
        // Check for new notifications
        const existingIds = new Set(notifications.map(n => n.id));
        const reallyNewNotifications = newNotifications.filter(n => !existingIds.has(n.id));
        
        if (reallyNewNotifications.length > 0) {
          // Play sound for the highest priority new notification
          const highestPriority = reallyNewNotifications.reduce((prev, current) => {
            const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
            return priorityOrder[current.priority] > priorityOrder[prev.priority] ? current : prev;
          });
          
          playNotificationSound(highestPriority.priority);
          
          // Update notifications
          setNotifications(prev => [...reallyNewNotifications, ...prev].slice(0, 50)); // Keep only last 50
        }
        
        // Update unread count
        const unread = newNotifications.filter(n => !n.read).length;
        setUnreadCount(unread);
        
        lastFetchRef.current = new Date().toISOString();
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [userId, userType, notifications, playNotificationSound]);

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/${userType === 'admin' ? 'admin' : 'student'}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId })
      });
      
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`/api/${userType === 'admin' ? 'admin' : 'student'}/notifications/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId })
      });
      
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const clearNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    if (!notifications.find(n => n.id === notificationId)?.read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const updateSettings = async (newSettings: Partial<NotificationSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    
    try {
      await fetch(`/api/${userType === 'admin' ? 'admin' : 'student'}/notifications/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, settings: updatedSettings })
      });
    } catch (error) {
      console.error('Error updating notification settings:', error);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchNotifications();
    
    // Set up polling for new notifications
    const interval = setInterval(fetchNotifications, 10000); // Poll every 10 seconds
    
    return () => clearInterval(interval);
  }, [userId, userType]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'assignment': return <User className="h-4 w-4 text-blue-500" />;
      case 'status_change': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'message': return <MessageSquare className="h-4 w-4 text-purple-500" />;
      case 'deadline': return <Clock className="h-4 w-4 text-orange-500" />;
      case 'escalation': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'border-l-red-500 bg-red-50';
      case 'high': return 'border-l-orange-500 bg-orange-50';
      case 'medium': return 'border-l-yellow-500 bg-yellow-50';
      case 'low': return 'border-l-green-500 bg-green-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className={className}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge 
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs bg-red-500 text-white"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Notifications</h3>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(!showSettings)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                  >
                    Mark all read
                  </Button>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {showSettings && (
            <div className="border-b p-4 bg-gray-50">
              <h4 className="font-medium mb-3">Notification Settings</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {settings.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    <span className="text-sm">Sound notifications</span>
                  </div>
                  <Switch
                    checked={settings.soundEnabled}
                    onCheckedChange={(checked) => updateSettings({ soundEnabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">New assignments</span>
                  <Switch
                    checked={settings.assignments}
                    onCheckedChange={(checked) => updateSettings({ assignments: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Status changes</span>
                  <Switch
                    checked={settings.statusChanges}
                    onCheckedChange={(checked) => updateSettings({ statusChanges: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Messages</span>
                  <Switch
                    checked={settings.messages}
                    onCheckedChange={(checked) => updateSettings({ messages: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Deadlines</span>
                  <Switch
                    checked={settings.deadlines}
                    onCheckedChange={(checked) => updateSettings({ deadlines: checked })}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer border-l-4 ${getPriorityColor(notification.priority)} ${
                      !notification.read ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => !notification.read && markAsRead(notification.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className={`text-sm font-medium ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {formatTimeAgo(notification.timestamp)}
                            </span>
                            {notification.relatedUser && (
                              <span className="text-xs text-gray-500">
                                by {notification.relatedUser.name}
                              </span>
                            )}
                          </div>
                          {notification.actionUrl && notification.actionLabel && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = notification.actionUrl!;
                              }}
                            >
                              {notification.actionLabel}
                            </Button>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearNotification(notification.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
} 