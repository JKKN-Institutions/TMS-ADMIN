'use client';

import React, { useState, useEffect } from 'react';
import { X, Monitor, Tablet, Smartphone, Eye, AlertTriangle } from 'lucide-react';
import { ResponsiveChecker, COMMON_VIEWPORTS, getCurrentBreakpoint } from '@/lib/responsive-test-utils';

const ResponsiveTestOverlay: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentBreakpoint, setCurrentBreakpoint] = useState('lg');
  const [issues, setIssues] = useState<any[]>([]);
  const [viewportInfo, setViewportInfo] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateViewportInfo = () => {
      setViewportInfo({ width: window.innerWidth, height: window.innerHeight });
      setCurrentBreakpoint(getCurrentBreakpoint());
    };

    const checkResponsiveIssues = () => {
      if (isOpen && typeof window !== 'undefined') {
        const checker = new ResponsiveChecker();
        const detectedIssues = checker.runAllChecks();
        setIssues(detectedIssues);
      }
    };

    updateViewportInfo();
    window.addEventListener('resize', updateViewportInfo);
    
    if (isOpen) {
      checkResponsiveIssues();
      const interval = setInterval(checkResponsiveIssues, 2000);
      return () => {
        clearInterval(interval);
        window.removeEventListener('resize', updateViewportInfo);
      };
    }

    return () => window.removeEventListener('resize', updateViewportInfo);
  }, [isOpen]);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const getBreakpointIcon = () => {
    if (viewportInfo.width < 640) return <Smartphone className="w-4 h-4" />;
    if (viewportInfo.width < 1024) return <Tablet className="w-4 h-4" />;
    return <Monitor className="w-4 h-4" />;
  };

  const getBreakpointColor = () => {
    if (viewportInfo.width < 640) return 'bg-red-100 text-red-800';
    if (viewportInfo.width < 1024) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const getDeviceType = () => {
    if (viewportInfo.width < 640) return 'Mobile';
    if (viewportInfo.width < 1024) return 'Tablet';
    return 'Desktop';
  };

  return (
    <>
      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors z-[100]"
          title="Open Responsive Testing Tool"
        >
          <Eye className="w-5 h-5" />
        </button>
      )}

      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-end z-[101]">
          <div className="bg-white w-full sm:w-96 h-full sm:h-auto sm:max-h-[80vh] sm:rounded-l-xl shadow-xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center space-x-2">
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${getBreakpointColor()}`}>
                  <div className="flex items-center space-x-1">
                    {getBreakpointIcon()}
                    <span>{getDeviceType()}</span>
                  </div>
                </div>
                <span className="text-sm text-gray-600">Responsive Test</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Viewport Info */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Current Viewport</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Size:</span>
                  <span className="font-mono">{viewportInfo.width} × {viewportInfo.height}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Breakpoint:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">{currentBreakpoint}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Device:</span>
                  <span>{getDeviceType()}</span>
                </div>
              </div>
            </div>

            {/* Common Viewports */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Test Viewports</h3>
              <div className="space-y-2">
                {COMMON_VIEWPORTS.slice(0, 6).map((viewport) => (
                  <button
                    key={viewport.name}
                    onClick={() => {
                      // This would be used with browser dev tools
                      console.log(`Test viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
                    }}
                    className="w-full text-left p-2 hover:bg-gray-50 rounded text-sm"
                  >
                    <div className="flex justify-between items-center">
                      <span>{viewport.name}</span>
                      <span className="text-gray-500 font-mono text-xs">
                        {viewport.width}×{viewport.height}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Responsive Issues */}
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Issues ({issues.length})
              </h3>
              
              {issues.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Eye className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p>No responsive issues detected</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {issues.map((issue, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border-l-4 ${
                        issue.severity === 'high' ? 'border-red-500 bg-red-50' :
                        issue.severity === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                        'border-blue-500 bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{issue.element}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          issue.severity === 'high' ? 'bg-red-200 text-red-800' :
                          issue.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                          'bg-blue-200 text-blue-800'
                        }`}>
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{issue.issue}</p>
                      <p className="text-xs text-gray-600">💡 {issue.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Testing Checklist */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900 mb-2">Testing Checklist</h3>
              <div className="space-y-1 text-sm text-gray-700">
                <div>✅ Touch targets ≥ 44px</div>
                <div>✅ Text size ≥ 16px on mobile</div>
                <div>✅ No horizontal scroll</div>
                <div>✅ Images are responsive</div>
                <div>✅ Layouts stack properly</div>
                <div>✅ Navigation works on touch</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ResponsiveTestOverlay; 