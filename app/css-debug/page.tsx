'use client';

import { useEffect, useState } from 'react';

export default function CSSDebugPage() {
  const [cssLoaded, setCssLoaded] = useState(false);
  const [tailwindClasses, setTailwindClasses] = useState<string[]>([]);

  useEffect(() => {
    // Check if CSS is loaded
    const checkCSS = () => {
      const testElement = document.createElement('div');
      testElement.className = 'bg-blue-500';
      document.body.appendChild(testElement);
      
      const computedStyle = window.getComputedStyle(testElement);
      const backgroundColor = computedStyle.backgroundColor;
      
      document.body.removeChild(testElement);
      
      // Check if Tailwind classes are working
      const testClasses = [
        'bg-red-500',
        'text-white',
        'p-4',
        'rounded-lg',
        'shadow-lg',
        'hover:bg-blue-600'
      ];
      
      const workingClasses: string[] = [];
      
      testClasses.forEach(className => {
        const element = document.createElement('div');
        element.className = className;
        document.body.appendChild(element);
        
        const style = window.getComputedStyle(element);
        if (className.includes('bg-') && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          workingClasses.push(className);
        } else if (className.includes('text-') && style.color !== 'rgba(0, 0, 0, 0)') {
          workingClasses.push(className);
        } else if (className.includes('p-') && style.padding !== '0px') {
          workingClasses.push(className);
        } else if (className.includes('rounded-') && style.borderRadius !== '0px') {
          workingClasses.push(className);
        } else if (className.includes('shadow-') && style.boxShadow !== 'none') {
          workingClasses.push(className);
        }
        
        document.body.removeChild(element);
      });
      
      setTailwindClasses(workingClasses);
      setCssLoaded(backgroundColor !== 'rgba(0, 0, 0, 0)');
    };

    // Run check after a short delay to ensure CSS is loaded
    setTimeout(checkCSS, 1000);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">CSS Debug Information</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CSS Status */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">CSS Status</h2>
            <div className="space-y-2">
              <div className={`p-3 rounded ${cssLoaded ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                <strong>CSS Loaded:</strong> {cssLoaded ? 'Yes' : 'No'}
              </div>
              <div className="p-3 bg-blue-100 text-blue-800 rounded">
                <strong>Tailwind Classes Working:</strong> {tailwindClasses.length} / 6
              </div>
            </div>
          </div>

          {/* Visual Test */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Visual Test</h2>
            <div className="space-y-4">
              <div className="bg-blue-500 text-white p-4 rounded-lg">
                Blue Background Test
              </div>
              <div className="bg-green-500 text-white p-4 rounded-lg shadow-lg">
                Green with Shadow Test
              </div>
              <button className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors">
                Hover Test Button
              </button>
            </div>
          </div>

          {/* Working Classes */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Working Tailwind Classes</h2>
            <div className="space-y-2">
              {tailwindClasses.length > 0 ? (
                tailwindClasses.map((className, index) => (
                  <div key={index} className="bg-green-100 text-green-800 p-2 rounded text-sm">
                    ✓ {className}
                  </div>
                ))
              ) : (
                <div className="bg-red-100 text-red-800 p-2 rounded text-sm">
                  ✗ No Tailwind classes detected
                </div>
              )}
            </div>
          </div>

          {/* CSS Files */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">CSS Files</h2>
            <div className="space-y-2">
              <div className="text-sm">
                <strong>Global CSS:</strong> /app/globals.css
              </div>
              <div className="text-sm">
                <strong>Tailwind Config:</strong> /tailwind.config.ts
              </div>
              <div className="text-sm">
                <strong>PostCSS Config:</strong> /postcss.config.mjs
              </div>
            </div>
          </div>
        </div>

        {/* Raw CSS Test */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Raw CSS Test</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-red-500 h-16 rounded"></div>
            <div className="bg-green-500 h-16 rounded"></div>
            <div className="bg-blue-500 h-16 rounded"></div>
            <div className="bg-yellow-500 h-16 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}










