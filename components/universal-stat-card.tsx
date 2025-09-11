'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  LucideIcon,
  Loader2 
} from 'lucide-react';

interface UniversalStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    timeframe?: string;
  };
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'indigo' | 'pink' | 'cyan' | 'orange' | 'teal';
  variant?: 'default' | 'gradient' | 'minimal' | 'enhanced';
  loading?: boolean;
  onClick?: () => void;
  badge?: string;
  size?: 'sm' | 'md' | 'lg';
  delay?: number;
}

const colorVariants = {
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'bg-blue-100 text-blue-600',
    text: 'text-blue-600',
    gradient: 'bg-gradient-to-br from-blue-500 to-blue-600',
    hover: 'hover:border-blue-300 hover:shadow-blue-100'
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'bg-green-100 text-green-600',
    text: 'text-green-600',
    gradient: 'bg-gradient-to-br from-green-500 to-green-600',
    hover: 'hover:border-green-300 hover:shadow-green-100'
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'bg-red-100 text-red-600',
    text: 'text-red-600',
    gradient: 'bg-gradient-to-br from-red-500 to-red-600',
    hover: 'hover:border-red-300 hover:shadow-red-100'
  },
  yellow: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: 'bg-yellow-100 text-yellow-600',
    text: 'text-yellow-600',
    gradient: 'bg-gradient-to-br from-yellow-500 to-yellow-600',
    hover: 'hover:border-yellow-300 hover:shadow-yellow-100'
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: 'bg-purple-100 text-purple-600',
    text: 'text-purple-600',
    gradient: 'bg-gradient-to-br from-purple-500 to-purple-600',
    hover: 'hover:border-purple-300 hover:shadow-purple-100'
  },
  indigo: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    icon: 'bg-indigo-100 text-indigo-600',
    text: 'text-indigo-600',
    gradient: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
    hover: 'hover:border-indigo-300 hover:shadow-indigo-100'
  },
  pink: {
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    icon: 'bg-pink-100 text-pink-600',
    text: 'text-pink-600',
    gradient: 'bg-gradient-to-br from-pink-500 to-pink-600',
    hover: 'hover:border-pink-300 hover:shadow-pink-100'
  },
  cyan: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    icon: 'bg-cyan-100 text-cyan-600',
    text: 'text-cyan-600',
    gradient: 'bg-gradient-to-br from-cyan-500 to-cyan-600',
    hover: 'hover:border-cyan-300 hover:shadow-cyan-100'
  },
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: 'bg-orange-100 text-orange-600',
    text: 'text-orange-600',
    gradient: 'bg-gradient-to-br from-orange-500 to-orange-600',
    hover: 'hover:border-orange-300 hover:shadow-orange-100'
  },
  teal: {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    icon: 'bg-teal-100 text-teal-600',
    text: 'text-teal-600',
    gradient: 'bg-gradient-to-br from-teal-500 to-teal-600',
    hover: 'hover:border-teal-300 hover:shadow-teal-100'
  }
};

const sizeVariants = {
  sm: {
    padding: 'p-4',
    iconSize: 'w-8 h-8',
    iconPadding: 'p-2',
    titleSize: 'text-xs',
    valueSize: 'text-lg',
    subtitleSize: 'text-xs',
    trendSize: 'text-xs'
  },
  md: {
    padding: 'p-6',
    iconSize: 'w-10 h-10',
    iconPadding: 'p-2.5',
    titleSize: 'text-sm',
    valueSize: 'text-2xl',
    subtitleSize: 'text-sm',
    trendSize: 'text-sm'
  },
  lg: {
    padding: 'p-8',
    iconSize: 'w-12 h-12',
    iconPadding: 'p-3',
    titleSize: 'text-base',
    valueSize: 'text-3xl',
    subtitleSize: 'text-base',
    trendSize: 'text-base'
  }
};

const formatValue = (value: string | number): string => {
  if (typeof value === 'number') {
    if (isNaN(value)) return '0';
    
    // Format large numbers
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    
    return value.toLocaleString();
  }
  
  return value || '0';
};

const getTrendIcon = (direction: 'up' | 'down' | 'neutral') => {
  switch (direction) {
    case 'up':
      return TrendingUp;
    case 'down':
      return TrendingDown;
    default:
      return Minus;
  }
};

const getTrendColor = (direction: 'up' | 'down' | 'neutral') => {
  switch (direction) {
    case 'up':
      return 'text-green-600 bg-green-50';
    case 'down':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
};

export default function UniversalStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
  variant = 'default',
  loading = false,
  onClick,
  badge,
  size = 'md',
  delay = 0
}: UniversalStatCardProps) {
  const colors = colorVariants[color];
  const sizes = sizeVariants[size];
  const TrendIcon = trend ? getTrendIcon(trend.direction) : null;

  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${sizes.padding} animate-pulse`}>
        <div className="flex items-center justify-between mb-4">
          <div className={`${sizes.iconSize} bg-gray-200 rounded-lg`}></div>
          {badge && <div className="w-12 h-5 bg-gray-200 rounded-full"></div>}
        </div>
        <div className="space-y-2">
          <div className="w-20 h-4 bg-gray-200 rounded"></div>
          <div className="w-16 h-8 bg-gray-200 rounded"></div>
          {subtitle && <div className="w-24 h-3 bg-gray-200 rounded"></div>}
          {trend && <div className="w-20 h-4 bg-gray-200 rounded"></div>}
        </div>
      </div>
    );
  }

  // Gradient variant (like analytics page)
  if (variant === 'gradient') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay * 0.1 }}
        whileHover={{ scale: 1.02, y: -2 }}
        onClick={onClick}
        className={`relative overflow-hidden rounded-2xl shadow-lg border border-white/20 ${colors.gradient} backdrop-blur-sm ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        <div className={`relative ${sizes.padding}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-white/80 mb-1">{title}</p>
              <p className={`${sizes.valueSize} font-bold text-white mb-2`}>
                {formatValue(value)}
              </p>
              {subtitle && <p className="text-xs text-white/70">{subtitle}</p>}
              {trend && (
                <div className="flex items-center mt-2">
                  {TrendIcon && <TrendIcon className="w-4 h-4 text-green-300" />}
                  <span className="text-sm font-medium ml-1 text-green-300">
                    {trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%
                    {trend.timeframe && ` ${trend.timeframe}`}
                  </span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-xl bg-white/20">
              <Icon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Enhanced variant
  if (variant === 'enhanced') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: delay * 0.1, type: "spring", stiffness: 100 }}
        whileHover={{ y: -2, scale: 1.02 }}
        onClick={onClick}
        className={`relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100 ${sizes.padding} 
          hover:shadow-xl transition-all duration-300 ${colors.hover} ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        {/* Background decoration */}
        <div className={`absolute inset-0 ${colors.bg} opacity-30`}></div>
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/40 rounded-full blur-xl"></div>
        
        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className={`${sizes.iconPadding} rounded-xl ${colors.icon}`}>
              <Icon className={sizes.iconSize} />
            </div>
            
            {badge && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors.text} ${colors.bg}`}>
                {badge}
              </span>
            )}
          </div>
          
          {/* Content */}
          <div className="space-y-1">
            <p className={`${sizes.titleSize} font-medium text-gray-600 uppercase tracking-wider`}>
              {title}
            </p>
            <p className={`${sizes.valueSize} font-bold text-gray-900`}>
              {formatValue(value)}
            </p>
            {subtitle && (
              <p className={`${sizes.subtitleSize} text-gray-500`}>{subtitle}</p>
            )}
            {trend && (
              <div className={`flex items-center space-x-1 ${sizes.trendSize}`}>
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg ${getTrendColor(trend.direction)}`}>
                  {TrendIcon && <TrendIcon className="w-3 h-3" />}
                  <span className="font-medium">
                    {trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%
                  </span>
                </div>
                {trend.timeframe && (
                  <span className="text-gray-400">{trend.timeframe}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // Minimal variant
  if (variant === 'minimal') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay * 0.05 }}
        onClick={onClick}
        className={`bg-white rounded-lg border border-gray-200 ${sizes.padding} hover:border-gray-300 transition-colors ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className={`${sizes.iconPadding} rounded-lg ${colors.icon}`}>
            <Icon className={sizes.iconSize} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`${sizes.titleSize} text-gray-600 truncate`}>{title}</p>
            <p className={`${sizes.valueSize} font-bold text-gray-900`}>
              {formatValue(value)}
            </p>
            {trend && (
              <div className={`flex items-center space-x-1 ${sizes.trendSize} text-gray-500`}>
                {TrendIcon && <TrendIcon className="w-3 h-3" />}
                <span>{trend.value > 0 ? '+' : ''}{trend.value}%</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // Default variant
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1 }}
      whileHover={{ y: -1, shadow: "lg" }}
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border border-gray-200 ${sizes.padding} 
        hover:shadow-md transition-all duration-200 ${colors.hover} ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <p className={`${sizes.titleSize} font-medium text-gray-600`}>{title}</p>
            {badge && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors.text} ${colors.bg}`}>
                {badge}
              </span>
            )}
          </div>
          
          <p className={`${sizes.valueSize} font-bold text-gray-900 mb-2`}>
            {formatValue(value)}
          </p>
          
          {subtitle && (
            <p className={`${sizes.subtitleSize} text-gray-500 mb-2`}>{subtitle}</p>
          )}
          
          {trend && (
            <div className={`flex items-center space-x-1 ${sizes.trendSize}`}>
              <div className={`flex items-center space-x-1 px-2 py-1 rounded ${getTrendColor(trend.direction)}`}>
                {TrendIcon && <TrendIcon className="w-3 h-3" />}
                <span className="font-medium">
                  {trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%
                </span>
              </div>
              {trend.timeframe && (
                <span className="text-gray-400">{trend.timeframe}</span>
              )}
            </div>
          )}
        </div>
        
        <div className={`${sizes.iconPadding} rounded-lg ${colors.icon} ml-4`}>
          <Icon className={sizes.iconSize} />
        </div>
      </div>
    </motion.div>
  );
} 