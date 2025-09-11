'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface BreadcrumbItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface EnhancedBreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const EnhancedBreadcrumb: React.FC<EnhancedBreadcrumbProps> = ({ 
  items, 
  className = '' 
}) => {
  const pathname = usePathname();
  
  // Auto-generate breadcrumbs from pathname if items not provided
  const breadcrumbItems = items || generateBreadcrumbs(pathname);

  return (
    <nav className={`flex items-center space-x-2 ${className}`} aria-label="Breadcrumb">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center"
      >
        <Link
          href="/dashboard"
          className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Home className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
      </motion.div>

      {breadcrumbItems.map((item, index) => (
        <motion.div
          key={item.href}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center"
        >
          <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />
          {index === breadcrumbItems.length - 1 ? (
            <span className="flex items-center text-sm font-semibold text-gray-900">
              {item.icon && <item.icon className="w-4 h-4 mr-1" />}
              {item.label}
            </span>
          ) : (
            <Link
              href={item.href}
              className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              {item.icon && <item.icon className="w-4 h-4 mr-1" />}
              {item.label}
            </Link>
          )}
        </motion.div>
      ))}
    </nav>
  );
};

// Helper function to generate breadcrumbs from pathname
const generateBreadcrumbs = (pathname: string): BreadcrumbItem[] => {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [];

  segments.forEach((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const label = segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    items.push({
      label,
      href,
    });
  });

  return items.slice(1); // Remove the first item (dashboard) as it's already handled
};

export default EnhancedBreadcrumb; 