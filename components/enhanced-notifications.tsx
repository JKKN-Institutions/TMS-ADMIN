'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  X, 
  Check, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  XCircle,
  Clock,
  Star,
  Heart,
  Zap,
  Shield,
  Target,
  Award,
  Activity,
  TrendingUp,
  MessageSquare,
  Mail,
  User,
  Settings,
  Eye,
  EyeOff,
  MoreHorizontal,
  Filter,
  Search,
  Calendar,
  MapPin,
  CreditCard,
  Bus,
  Users,
  Car,
  Route,
  RefreshCw,
  Archive,
  Trash2,
  Pin,
  Volume2,
  VolumeX,
  Smartphone,
  Monitor,
  Vibrate
} from 'lucide-react';

// Enhanced Toast Notification
interface ToastNotificationProps {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: (id: string) => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  id,
  title,
  message,
  type,
  duration = 5000,
  onClose,
  action,
  position = 'top-right'
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: CheckCircle,
          iconColor: 'text-green-500',
          titleColor: 'text-green-800',
          messageColor: 'text-green-700'
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: XCircle,
          iconColor: 'text-red-500',
          titleColor: 'text-red-800',
          messageColor: 'text-red-700'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: AlertTriangle,
          iconColor: 'text-yellow-500',
          titleColor: 'text-yellow-800',
          messageColor: 'text-yellow-700'
        };
      case 'info':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          icon: Info,
          iconColor: 'text-blue-500',
          titleColor: 'text-blue-800',
          messageColor: 'text-blue-700'
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          icon: Info,
          iconColor: 'text-gray-500',
          titleColor: 'text-gray-800',
          messageColor: 'text-gray-700'
        };
    }
  };

  const styles = getTypeStyles();
  const Icon = styles.icon;

  const getPositionStyles = () => {
    switch (position) {
      case 'top-right':
        return { x: 400, y: -50 };
      case 'top-left':
        return { x: -400, y: -50 };
      case 'bottom-right':
        return { x: 400, y: 50 };
      case 'bottom-left':
        return { x: -400, y: 50 };
      default:
        return { x: 400, y: -50 };
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, ...getPositionStyles() }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, ...getPositionStyles() }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`
            max-w-md w-full ${styles.bg} ${styles.border} border rounded-xl shadow-lg 
            backdrop-blur-sm p-4 pointer-events-auto
          `}
        >
          <div className="flex items-start space-x-3">
            <div className={`flex-shrink-0 ${styles.iconColor}`}>
              <Icon className="w-5 h-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className={`text-sm font-semibold ${styles.titleColor}`}>
                {title}
              </h4>
              <p className={`text-sm ${styles.messageColor} mt-1`}>
                {message}
              </p>
              
              {action && (
                <button
                  onClick={action.onClick}
                  className={`text-sm font-medium ${styles.iconColor} hover:underline mt-2`}
                >
                  {action.label}
                </button>
              )}
            </div>
            
            <button
              onClick={() => {
                setIsVisible(false);
                setTimeout(() => onClose(id), 300);
              }}
              className={`flex-shrink-0 ${styles.iconColor} hover:opacity-70 transition-opacity`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Enhanced Alert Banner
interface AlertBannerProps {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  dismissible?: boolean;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  title,
  message,
  type,
  dismissible = true,
  onDismiss,
  action,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(true);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: CheckCircle,
          iconColor: 'text-green-500',
          titleColor: 'text-green-800',
          messageColor: 'text-green-700'
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: XCircle,
          iconColor: 'text-red-500',
          titleColor: 'text-red-800',
          messageColor: 'text-red-700'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: AlertTriangle,
          iconColor: 'text-yellow-500',
          titleColor: 'text-yellow-800',
          messageColor: 'text-yellow-700'
        };
      case 'info':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          icon: Info,
          iconColor: 'text-blue-500',
          titleColor: 'text-blue-800',
          messageColor: 'text-blue-700'
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          icon: Info,
          iconColor: 'text-gray-500',
          titleColor: 'text-gray-800',
          messageColor: 'text-gray-700'
        };
    }
  };

  const styles = getTypeStyles();
  const Icon = styles.icon;

  const handleDismiss = () => {
    setIsVisible(false);
    if (onDismiss) {
      setTimeout(onDismiss, 300);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className={`
            ${styles.bg} ${styles.border} border rounded-xl p-4 ${className}
          `}
        >
          <div className="flex items-start space-x-3">
            <div className={`flex-shrink-0 ${styles.iconColor}`}>
              <Icon className="w-5 h-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className={`text-sm font-semibold ${styles.titleColor}`}>
                {title}
              </h4>
              <p className={`text-sm ${styles.messageColor} mt-1`}>
                {message}
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              {action && (
                <button
                  onClick={action.onClick}
                  className={`text-sm font-medium ${styles.iconColor} hover:underline`}
                >
                  {action.label}
                </button>
              )}
              
              {dismissible && (
                <button
                  onClick={handleDismiss}
                  className={`flex-shrink-0 ${styles.iconColor} hover:opacity-70 transition-opacity`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Enhanced Notification Center
interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'system';
  timestamp: Date;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
  category: 'transport' | 'payment' | 'system' | 'user' | 'general';
  action?: {
    label: string;
    onClick: () => void;
  };
  avatar?: string;
  metadata?: any;
}

interface NotificationCenterProps {
  notifications: NotificationItem[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onClearAll: () => void;
  className?: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onClearAll,
  className = ''
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredNotifications = notifications.filter(notification => {
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'unread' && !notification.read) ||
      (filter === 'read' && notification.read);

    const matchesCategory = 
      categoryFilter === 'all' || 
      notification.category === categoryFilter;

    const matchesSearch = 
      searchTerm === '' ||
      notification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notification.message.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesCategory && matchesSearch;
  });

  const getTypeIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'error':
        return XCircle;
      case 'warning':
        return AlertTriangle;
      case 'info':
        return Info;
      case 'system':
        return Settings;
      default:
        return Bell;
    }
  };

  const getTypeColor = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      case 'info':
        return 'text-blue-500';
      case 'system':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  const getPriorityStyles = (priority: NotificationItem['priority']) => {
    switch (priority) {
      case 'high':
        return 'border-l-4 border-red-500';
      case 'medium':
        return 'border-l-4 border-yellow-500';
      case 'low':
        return 'border-l-4 border-gray-300';
      default:
        return '';
    }
  };

  const formatTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <div className={`bg-white rounded-3xl shadow-xl border border-gray-100 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Notifications</h2>
              <p className="text-sm text-gray-600">
                {notifications.filter(n => !n.read).length} unread
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={onMarkAllAsRead}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Mark all read
            </button>
            <button
              onClick={onClearAll}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Clear all
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-4">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="transport">Transport</option>
              <option value="payment">Payment</option>
              <option value="system">System</option>
              <option value="user">User</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No notifications found</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredNotifications.map((notification) => {
              const Icon = getTypeIcon(notification.type);
              const iconColor = getTypeColor(notification.type);
              const priorityStyles = getPriorityStyles(notification.priority);

              return (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`
                    relative p-4 hover:bg-gray-50 transition-colors cursor-pointer
                    ${!notification.read ? 'bg-blue-50' : ''}
                    ${priorityStyles}
                  `}
                  onClick={() => onMarkAsRead(notification.id)}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`flex-shrink-0 ${iconColor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-sm font-semibold ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                          {notification.title}
                        </h4>
                        <span className="text-xs text-gray-500">
                          {formatTime(notification.timestamp)}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.message}
                      </p>
                      
                      {notification.action && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            notification.action!.onClick();
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-2"
                        >
                          {notification.action.label}
                        </button>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNotification(notification.id);
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced Notification Badge
interface NotificationBadgeProps {
  count: number;
  max?: number;
  className?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count,
  max = 99,
  className = '',
  variant = 'primary'
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-blue-500 text-white';
      case 'secondary':
        return 'bg-gray-500 text-white';
      case 'success':
        return 'bg-green-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      default:
        return 'bg-blue-500 text-white';
    }
  };

  if (count === 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      className={`
        absolute -top-2 -right-2 min-w-5 h-5 flex items-center justify-center
        rounded-full text-xs font-bold ${getVariantStyles()} ${className}
      `}
    >
      {displayCount}
    </motion.div>
  );
};

// Status Indicator
interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'away' | 'busy' | 'idle';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  size = 'md',
  showLabel = false,
  className = ''
}) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'online':
        return { bg: 'bg-green-500', label: 'Online' };
      case 'offline':
        return { bg: 'bg-gray-400', label: 'Offline' };
      case 'away':
        return { bg: 'bg-yellow-500', label: 'Away' };
      case 'busy':
        return { bg: 'bg-red-500', label: 'Busy' };
      case 'idle':
        return { bg: 'bg-orange-500', label: 'Idle' };
      default:
        return { bg: 'bg-gray-400', label: 'Unknown' };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return 'w-2 h-2';
      case 'md':
        return 'w-3 h-3';
      case 'lg':
        return 'w-4 h-4';
      default:
        return 'w-3 h-3';
    }
  };

  const styles = getStatusStyles();
  const sizeStyles = getSizeStyles();

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className={`${styles.bg} ${sizeStyles} rounded-full`}
      />
      {showLabel && (
        <span className="text-sm text-gray-600">{styles.label}</span>
      )}
    </div>
  );
}; 