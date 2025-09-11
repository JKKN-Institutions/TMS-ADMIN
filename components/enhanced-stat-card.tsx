'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface EnhancedStatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    trend: 'up' | 'down' | 'neutral';
    timeframe?: string;
  };
  icon: LucideIcon;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo' | 'pink' | 'cyan';
  subtitle?: string;
  loading?: boolean;
  onClick?: () => void;
  delay?: number;
}

const colorVariants = {
  blue: {
    gradient: 'from-blue-500 to-blue-600',
    lightGradient: 'from-blue-50 to-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    shadowColor: 'shadow-blue-500/25',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600',
  },
  green: {
    gradient: 'from-green-500 to-green-600',
    lightGradient: 'from-green-50 to-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    shadowColor: 'shadow-green-500/25',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-600',
  },
  yellow: {
    gradient: 'from-yellow-500 to-yellow-600',
    lightGradient: 'from-yellow-50 to-yellow-100',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
    shadowColor: 'shadow-yellow-500/25',
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-600',
  },
  red: {
    gradient: 'from-red-500 to-red-600',
    lightGradient: 'from-red-50 to-red-100',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    shadowColor: 'shadow-red-500/25',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-600',
  },
  purple: {
    gradient: 'from-purple-500 to-purple-600',
    lightGradient: 'from-purple-50 to-purple-100',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    shadowColor: 'shadow-purple-500/25',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-600',
  },
  indigo: {
    gradient: 'from-indigo-500 to-indigo-600',
    lightGradient: 'from-indigo-50 to-indigo-100',
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-200',
    shadowColor: 'shadow-indigo-500/25',
    iconBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-600',
  },
  pink: {
    gradient: 'from-pink-500 to-pink-600',
    lightGradient: 'from-pink-50 to-pink-100',
    textColor: 'text-pink-700',
    borderColor: 'border-pink-200',
    shadowColor: 'shadow-pink-500/25',
    iconBg: 'bg-pink-500/10',
    iconColor: 'text-pink-600',
  },
  cyan: {
    gradient: 'from-cyan-500 to-cyan-600',
    lightGradient: 'from-cyan-50 to-cyan-100',
    textColor: 'text-cyan-700',
    borderColor: 'border-cyan-200',
    shadowColor: 'shadow-cyan-500/25',
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-600',
  },
};

export default function EnhancedStatCard({
  title,
  value,
  change,
  icon: Icon,
  color,
  subtitle,
  loading = false,
  onClick,
  delay = 0,
}: EnhancedStatCardProps) {
  const colors = colorVariants[color];
  
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
          <div className="w-16 h-6 bg-gray-200 rounded"></div>
        </div>
        <div className="space-y-2">
          <div className="w-20 h-4 bg-gray-200 rounded"></div>
          <div className="w-24 h-8 bg-gray-200 rounded"></div>
          <div className="w-32 h-3 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        delay: delay * 0.1, 
        duration: 0.4, 
        ease: "easeOut",
        type: "spring",
        stiffness: 100
      }}
      whileHover={{ 
        y: -2, 
        scale: 1.02,
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100 p-6 
        hover:shadow-xl transition-all duration-300 
        ${onClick ? 'cursor-pointer' : ''}
        ${colors.shadowColor}
      `}
    >
      {/* Background decoration */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.lightGradient} opacity-50`}></div>
      <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/20 rounded-full blur-xl"></div>
      <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-white/30 rounded-full blur-lg"></div>
      
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-xl ${colors.iconBg} backdrop-blur-sm`}>
            <Icon className={`w-6 h-6 ${colors.iconColor}`} />
          </div>
          
          {change && (
            <div className="flex items-center space-x-1">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (delay * 0.1) + 0.2 }}
                className={`
                  inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold
                  ${change.trend === 'up' ? 'bg-green-100 text-green-700' :
                    change.trend === 'down' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'}
                `}
              >
                {change.trend === 'up' ? '↗' : change.trend === 'down' ? '↘' : '→'}
                <span className="ml-1">
                  {change.value > 0 ? '+' : ''}{change.value}%
                </span>
              </motion.div>
            </div>
          )}
        </div>
        
        {/* Main content */}
        <div className="space-y-2">
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: (delay * 0.1) + 0.1 }}
            className={`text-sm font-medium ${colors.textColor} uppercase tracking-wider`}
          >
            {title}
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (delay * 0.1) + 0.2 }}
            className="space-y-1"
          >
            <p className="text-3xl font-bold text-gray-900 leading-none">
              {value}
            </p>
            {subtitle && (
              <p className="text-sm text-gray-500">{subtitle}</p>
            )}
            {change?.timeframe && (
              <p className="text-xs text-gray-400">vs {change.timeframe}</p>
            )}
          </motion.div>
        </div>
        
        {/* Progress indicator */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Performance</span>
            <span>
              {change?.trend === 'up' ? 'Improving' : 
               change?.trend === 'down' ? 'Declining' : 'Stable'}
            </span>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, 50 + (change?.value || 0)))}%` }}
              transition={{ delay: (delay * 0.1) + 0.4, duration: 0.6 }}
              className={`h-1 rounded-full bg-gradient-to-r ${colors.gradient}`}
            />
          </div>
        </div>
      </div>
      
      {/* Hover effect overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
    </motion.div>
  );
} 