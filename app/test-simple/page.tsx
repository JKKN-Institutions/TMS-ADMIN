export default function TestSimplePage() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '10px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          color: '#1a1a1a',
          marginBottom: '20px'
        }}>
          Inline CSS Test
        </h1>
        <p style={{
          fontSize: '1.2rem',
          color: '#666',
          marginBottom: '30px'
        }}>
          If you can see this styled with inline CSS, the issue is with Tailwind processing.
        </p>
        <div style={{
          background: '#f0f9ff',
          padding: '20px',
          borderRadius: '8px',
          border: '2px solid #0ea5e9'
        }}>
          <p style={{ color: '#0369a1', fontWeight: '600' }}>
            ✅ Inline CSS is working - This means the issue is with Tailwind CSS processing
          </p>
        </div>
      </div>
    </div>
  );
}










