export default function CSSTestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">CSS Test</h1>
        <p className="text-gray-600 mb-6">Testing Tailwind CSS compilation</p>
        
        <div className="space-y-4">
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            ✅ If you see this styled, Tailwind is working!
          </div>
          
          <button className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors">
            Test Button
          </button>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-red-500 text-white p-4 rounded text-center">Red</div>
            <div className="bg-yellow-500 text-white p-4 rounded text-center">Yellow</div>
          </div>
        </div>
      </div>
    </div>
  );
}










