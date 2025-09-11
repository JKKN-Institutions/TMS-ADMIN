'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  BarChart3, 
  PieChart, 
  Activity, 
  Target,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Calendar,
  Users,
  Bus,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  MapPin,
  Zap,
  Star,
  Award,
  Filter,
  Download,
  RefreshCw,
  Info
} from 'lucide-react';

// Enhanced Chart Component
interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  trend?: 'up' | 'down' | 'stable';
  percentage?: number;
}

interface EnhancedChartProps {
  title: string;
  subtitle?: string;
  data: ChartDataPoint[];
  type: 'line' | 'bar' | 'pie' | 'donut' | 'area';
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  animated?: boolean;
  className?: string;
  onDataPointClick?: (point: ChartDataPoint) => void;
}

export const EnhancedChart: React.FC<EnhancedChartProps> = ({
  title,
  subtitle,
  data,
  type,
  height = 300,
  showLegend = true,
  showGrid = true,
  animated = true,
  className = '',
  onDataPointClick
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => setIsVisible(true), 300);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(true);
    }
  }, [animated]);

  const maxValue = Math.max(...data.map(d => d.value));
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#6366F1'
  ];

  const renderBarChart = () => (
    <div className="flex items-end justify-between h-full space-x-2">
      {data.map((point, index) => (
        <motion.div
          key={point.label}
          initial={animated ? { height: 0, opacity: 0 } : { height: `${(point.value / maxValue) * 100}%` }}
          animate={isVisible ? { height: `${(point.value / maxValue) * 100}%`, opacity: 1 } : {}}
          transition={{ delay: index * 0.1, duration: 0.5 }}
          className={`flex-1 rounded-t-lg cursor-pointer transition-all duration-200 ${
            hoveredIndex === index ? 'opacity-80 scale-105' : ''
          }`}
          style={{ backgroundColor: point.color || colors[index % colors.length] }}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          onClick={() => onDataPointClick?.(point)}
        >
          {hoveredIndex === index && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap"
            >
              {point.label}: {point.value.toLocaleString()}
            </motion.div>
          )}
        </motion.div>
      ))}
    </div>
  );

  const renderPieChart = () => {
    const total = data.reduce((sum, point) => sum + point.value, 0);
    let currentAngle = 0;
    const radius = 80;
    const centerX = 100;
    const centerY = 100;

    return (
      <div className="flex items-center justify-center">
        <svg width="200" height="200" className="transform -rotate-90">
          {data.map((point, index) => {
            const percentage = (point.value / total) * 100;
            const angle = (point.value / total) * 360;
            const x1 = centerX + radius * Math.cos((currentAngle * Math.PI) / 180);
            const y1 = centerY + radius * Math.sin((currentAngle * Math.PI) / 180);
            const x2 = centerX + radius * Math.cos(((currentAngle + angle) * Math.PI) / 180);
            const y2 = centerY + radius * Math.sin(((currentAngle + angle) * Math.PI) / 180);
            const largeArcFlag = angle > 180 ? 1 : 0;

            const pathData = [
              `M ${centerX} ${centerY}`,
              `L ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
              'Z'
            ].join(' ');

            const result = (
              <motion.path
                key={point.label}
                d={pathData}
                fill={point.color || colors[index % colors.length]}
                initial={animated ? { opacity: 0, scale: 0 } : { opacity: 1, scale: 1 }}
                animate={isVisible ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className={`cursor-pointer transition-all duration-200 ${
                  hoveredIndex === index ? 'opacity-80' : ''
                }`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => onDataPointClick?.(point)}
              />
            );

            currentAngle += angle;
            return result;
          })}
          
          {/* Center circle for donut chart */}
          {type === 'donut' && (
            <circle
              cx={centerX}
              cy={centerY}
              r={40}
              fill="white"
              className="drop-shadow-sm"
            />
          )}
        </svg>
      </div>
    );
  };

  const renderLineChart = () => {
    const width = 300;
    const points = data.map((point, index) => ({
      x: (index / (data.length - 1)) * width,
      y: height - (point.value / maxValue) * height
    }));

    const pathData = points.map((point, index) => 
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    ).join(' ');

    return (
      <svg width={width} height={height} className="w-full">
        {/* Grid lines */}
        {showGrid && (
          <g className="opacity-20">
            {Array.from({ length: 5 }, (_, i) => (
              <line
                key={i}
                x1={0}
                y1={(i / 4) * height}
                x2={width}
                y2={(i / 4) * height}
                stroke="currentColor"
                strokeWidth={1}
              />
            ))}
          </g>
        )}

        {/* Area fill */}
        {type === 'area' && (
          <motion.path
            d={`${pathData} L ${width} ${height} L 0 ${height} Z`}
            fill="url(#areaGradient)"
            initial={animated ? { opacity: 0 } : { opacity: 0.3 }}
            animate={isVisible ? { opacity: 0.3 } : {}}
            transition={{ duration: 0.8 }}
          />
        )}

        {/* Line */}
        <motion.path
          d={pathData}
          fill="none"
          stroke={colors[0]}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0 } : { pathLength: 1 }}
          animate={isVisible ? { pathLength: 1 } : {}}
          transition={{ duration: 1, ease: 'easeInOut' }}
        />

        {/* Data points */}
        {points.map((point, index) => (
          <motion.circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={hoveredIndex === index ? 6 : 4}
            fill={colors[0]}
            className="cursor-pointer"
            initial={animated ? { opacity: 0, scale: 0 } : { opacity: 1, scale: 1 }}
            animate={isVisible ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => onDataPointClick?.(data[index])}
          />
        ))}

        {/* Gradient definition */}
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={colors[0]} stopOpacity={0.3} />
            <stop offset="100%" stopColor={colors[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return renderBarChart();
      case 'pie':
      case 'donut':
        return renderPieChart();
      case 'line':
      case 'area':
        return renderLineChart();
      default:
        return renderBarChart();
    }
  };

  return (
    <div className={`bg-white rounded-3xl shadow-xl border border-gray-100 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-gray-600 text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center space-x-2">
          <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Download className="w-4 h-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="relative" style={{ height: `${height}px` }}>
        {renderChart()}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="mt-6 flex flex-wrap gap-4">
          {data.map((point, index) => (
            <div key={point.label} className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: point.color || colors[index % colors.length] }}
              />
              <span className="text-sm text-gray-600">{point.label}</span>
              {point.trend && (
                <div className="flex items-center">
                  {point.trend === 'up' && <ArrowUp className="w-3 h-3 text-green-500" />}
                  {point.trend === 'down' && <ArrowDown className="w-3 h-3 text-red-500" />}
                  {point.trend === 'stable' && <ArrowRight className="w-3 h-3 text-gray-400" />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Enhanced Metric Card Component
interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'stable';
    period: string;
  };
  color?: string;
  bgColor?: string;
  className?: string;
  onClick?: () => void;
}

export const EnhancedMetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'text-blue-600',
  bgColor = 'bg-blue-50',
  className = '',
  onClick
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getTrendIcon = () => {
    switch (trend?.direction) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-gray-400" />;
      default:
        return null;
    }
  };

  const getTrendColor = () => {
    switch (trend?.direction) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      case 'stable':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`
        bg-white rounded-2xl shadow-lg border border-gray-100 p-6 cursor-pointer
        transition-all duration-300 hover:shadow-xl hover:border-gray-200
        ${className}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-3">
            <div className={`p-3 rounded-xl ${bgColor}`}>
              <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">{title}</h3>
              {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-end space-x-2">
            <span className="text-2xl font-bold text-gray-900">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {trend && (
              <div className={`flex items-center space-x-1 ${getTrendColor()}`}>
                {getTrendIcon()}
                <span className="text-sm font-medium">
                  {trend.value}% {trend.period}
                </span>
              </div>
            )}
          </div>
        </div>

        <motion.div
          animate={{ rotate: isHovered ? 15 : 0 }}
          transition={{ duration: 0.2 }}
          className="opacity-20"
        >
          <Icon className="w-8 h-8 text-gray-400" />
        </motion.div>
      </div>
    </motion.div>
  );
};

// Enhanced Progress Bar Component
interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
  showPercentage?: boolean;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

export const EnhancedProgressBar: React.FC<ProgressBarProps> = ({
  label,
  value,
  max,
  color = 'bg-blue-500',
  showPercentage = true,
  showValue = false,
  size = 'md',
  animated = true,
  className = ''
}) => {
  const [animatedValue, setAnimatedValue] = useState(0);
  const percentage = Math.round((value / max) * 100);

  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        setAnimatedValue(value);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setAnimatedValue(value);
    }
  }, [value, animated]);

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center space-x-2">
          {showValue && (
            <span className="text-sm text-gray-600">
              {animatedValue.toLocaleString()} / {max.toLocaleString()}
            </span>
          )}
          {showPercentage && (
            <span className="text-sm font-semibold text-gray-800">
              {Math.round((animatedValue / max) * 100)}%
            </span>
          )}
        </div>
      </div>

      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${(animatedValue / max) * 100}%` }}
          transition={{ duration: animated ? 1 : 0, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

// Enhanced Timeline Component
interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'success' | 'warning' | 'error' | 'info';
  icon?: React.ComponentType<{ className?: string }>;
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export const EnhancedTimeline: React.FC<TimelineProps> = ({
  events,
  className = ''
}) => {
  const getTypeStyles = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'success':
        return { bg: 'bg-green-500', text: 'text-green-600', border: 'border-green-200' };
      case 'warning':
        return { bg: 'bg-yellow-500', text: 'text-yellow-600', border: 'border-yellow-200' };
      case 'error':
        return { bg: 'bg-red-500', text: 'text-red-600', border: 'border-red-200' };
      case 'info':
        return { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200' };
      default:
        return { bg: 'bg-gray-500', text: 'text-gray-600', border: 'border-gray-200' };
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {events.map((event, index) => {
        const styles = getTypeStyles(event.type);
        const Icon = event.icon || Clock;

        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative flex items-start space-x-4"
          >
            {/* Timeline line */}
            {index !== events.length - 1 && (
              <div className="absolute left-4 top-10 w-0.5 h-12 bg-gray-200" />
            )}

            {/* Event marker */}
            <div className={`relative z-10 w-8 h-8 rounded-full ${styles.bg} flex items-center justify-center`}>
              <Icon className="w-4 h-4 text-white" />
            </div>

            {/* Event content */}
            <div className="flex-1 min-w-0">
              <div className={`bg-white rounded-xl border ${styles.border} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-900">{event.title}</h4>
                  <span className="text-xs text-gray-500">{event.time}</span>
                </div>
                <p className="text-sm text-gray-600">{event.description}</p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}; 