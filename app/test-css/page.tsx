export default function TestCSSPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">CSS Test Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold mb-2">Card 1</h2>
          <p className="text-body">This is a test card to verify CSS is working.</p>
        </div>
        
        <div className="card-hover">
          <h2 className="text-xl font-semibold mb-2">Card 2</h2>
          <p className="text-body">This card should have hover effects.</p>
        </div>
        
        <div className="bg-blue-100 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Tailwind Test</h2>
          <p>This uses Tailwind utility classes.</p>
        </div>
      </div>
      
      <div className="mt-8 space-y-4">
        <button className="btn-primary">Primary Button</button>
        <button className="btn-secondary">Secondary Button</button>
        <button className="btn-ghost">Ghost Button</button>
      </div>
      
      <div className="mt-8">
        <input type="text" placeholder="Test input" className="input" />
      </div>
    </div>
  );
}