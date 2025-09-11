'use client';

import React from 'react';

export default function CSSTestDiagnostic() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">CSS Diagnostic Test</h1>
        
        {/* Test basic Tailwind classes */}
        <div className="card mb-6">
          <h2 className="text-xl font-semibold mb-4">Basic Tailwind Classes Test</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-red-100 text-red-800 p-4 rounded-lg">Red Background</div>
            <div className="bg-green-100 text-green-800 p-4 rounded-lg">Green Background</div>
            <div className="bg-blue-100 text-blue-800 p-4 rounded-lg">Blue Background</div>
          </div>
        </div>

        {/* Test custom CSS classes */}
        <div className="card mb-6">
          <h2 className="text-xl font-semibold mb-4">Custom CSS Classes Test</h2>
          <div className="space-y-4">
            <button className="btn-primary">Primary Button (Custom Class)</button>
            <button className="btn-secondary">Secondary Button (Custom Class)</button>
            <button className="btn-ghost">Ghost Button (Custom Class)</button>
          </div>
        </div>

        {/* Test status badges */}
        <div className="card mb-6">
          <h2 className="text-xl font-semibold mb-4">Status Badge Test</h2>
          <div className="flex space-x-4">
            <span className="status-badge status-active">Active</span>
            <span className="status-badge status-pending">Pending</span>
            <span className="status-badge status-inactive">Inactive</span>
          </div>
        </div>

        {/* Test sidebar classes (simulated) */}
        <div className="card mb-6">
          <h2 className="text-xl font-semibold mb-4">Sidebar Classes Test</h2>
          <div className="bg-white border rounded-lg p-4" style={{width: '240px'}}>
            <div className="sidebar-header">
              <h3 className="font-bold">Sidebar Header</h3>
            </div>
            <div className="py-4">
              <div className="sidebar-nav-item active">
                <span className="mr-2">🏠</span>
                Active Nav Item
              </div>
              <div className="sidebar-nav-item">
                <span className="mr-2">📊</span>
                Regular Nav Item
              </div>
            </div>
            <div className="sidebar-user">
              <div className="user-avatar">UN</div>
              <div className="text-sm">User Name</div>
            </div>
          </div>
        </div>

        {/* CSS Variables Test */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">CSS Variables Test</h2>
          <div className="space-y-2">
            <div className="p-3 rounded" style={{backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))'}}>
              Primary Color Variable
            </div>
            <div className="p-3 rounded" style={{backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--secondary-foreground))'}}>
              Secondary Color Variable
            </div>
          </div>
        </div>

        {/* Debug Information */}
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-yellow-800 mb-2">Debug Information:</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• If custom classes are not styled, globals.css is not loading</li>
            <li>• If Tailwind classes are not working, Tailwind CSS is not loading</li>
            <li>• If colors are wrong, CSS variables may not be defined</li>
            <li>• Check browser console for CSS loading errors</li>
          </ul>
        </div>
      </div>
    </div>
  );
}





