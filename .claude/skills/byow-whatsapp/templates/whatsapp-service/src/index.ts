import express from 'express';
import cors from 'cors';
import { connectRoute } from './routes/connect';
import { statusRoute } from './routes/status';
import { sendRoute } from './routes/send';
import { disconnectRoute } from './routes/disconnect';

const app = express();
const PORT = process.env.PORT || 3001;

// Parse allowed origins from environment
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000'
];

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// API Key authentication middleware
app.use((req, res, next) => {
  // Skip auth for health check
  if (req.path === '/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  if (!process.env.API_KEY) {
    console.error('[Auth] API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
});

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/connect', connectRoute);
app.use('/status', statusRoute);
app.use('/send', sendRoute);
app.use('/disconnect', disconnectRoute);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error]', {
    message: err.message,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'An internal error occurred',
    code: 'INTERNAL_ERROR'
  });
});

app.listen(PORT, () => {
  console.log(`[Server] WhatsApp service running on port ${PORT}`);
  console.log(`[Server] Allowed origins: ${allowedOrigins.join(', ')}`);
});
