# Security Patterns for BYOW WhatsApp

## Overview

BYOW WhatsApp involves sensitive operations. This document covers security best practices for protecting the system and user data.

---

## 1. API Key Authentication

### Implementation

All endpoints (except `/health`) require API key authentication.

**WhatsApp Service Middleware:**
```typescript
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
```

**Web App API Client:**
```typescript
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${WHATSAPP_SERVICE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.WHATSAPP_API_KEY!,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
```

### Best Practices

| Practice | Implementation |
|----------|----------------|
| Strong key | Use `openssl rand -base64 32` |
| Separate keys | Different keys for dev/staging/prod |
| Rotate regularly | Change keys quarterly |
| Never in code | Always use environment variables |
| Never in logs | Sanitize error messages |

---

## 2. CORS Configuration

### Implementation

Restrict which origins can access the WhatsApp service.

```typescript
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'https://your-app.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

### Best Practices

| Practice | Why |
|----------|-----|
| Whitelist only | Prevent unauthorized access |
| No wildcards in prod | `*` allows any origin |
| Include localhost for dev | But remove in production |
| Log blocked origins | Monitor for attacks |

---

## 3. Database Row-Level Security (RLS)

### Multi-Tenant Isolation

Each tenant (chapter/organization) can only access their own data.

```sql
-- Enable RLS on all WhatsApp tables
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
```

### Role-Based Policies

**Connection Management (Chair/Co-Chair only):**
```sql
CREATE POLICY "whatsapp_connections_manage" ON whatsapp_connections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      JOIN user_roles ur ON m.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE m.id = auth.uid()
      AND m.chapter_id = whatsapp_connections.chapter_id
      AND r.name IN ('Chair', 'Co-Chair')
    )
  );
```

**Message Sending (Chair/Co-Chair/EC Member):**
```sql
CREATE POLICY "whatsapp_message_logs_insert" ON whatsapp_message_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m
      JOIN user_roles ur ON m.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE m.id = auth.uid()
      AND m.chapter_id = whatsapp_message_logs.chapter_id
      AND r.name IN ('Chair', 'Co-Chair', 'EC Member')
    )
  );
```

---

## 4. Input Validation

### Phone Number Validation

```typescript
import { z } from 'zod';

const phoneSchema = z.string()
  .min(10, 'Phone number too short')
  .max(15, 'Phone number too long')
  .regex(/^\d+$/, 'Phone number must contain only digits');

function validatePhone(phone: string): string {
  const result = phoneSchema.safeParse(phone.replace(/\D/g, ''));
  if (!result.success) {
    throw new Error(result.error.issues[0].message);
  }
  return result.data;
}
```

### Message Content Validation

```typescript
const messageSchema = z.string()
  .min(1, 'Message cannot be empty')
  .max(4096, 'Message too long (max 4096 characters)');

function validateMessage(message: string): string {
  const result = messageSchema.safeParse(message);
  if (!result.success) {
    throw new Error(result.error.issues[0].message);
  }
  return result.data;
}
```

---

## 5. Rate Limiting

### Service-Level Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please try again later' }
});

// Stricter limit for send endpoints
const sendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute
  message: { error: 'Message rate limit exceeded' }
});

app.use(globalLimiter);
app.use('/send', sendLimiter);
app.use('/send-bulk', sendLimiter);
```

### Application-Level Rate Limiting

```typescript
// Delay between bulk messages
const BULK_MESSAGE_DELAY_MS = 1500;

async function sendBulkMessages(recipients: Recipient[]) {
  for (let i = 0; i < recipients.length; i++) {
    await sendMessage(recipients[i]);

    if (i < recipients.length - 1) {
      await new Promise(r => setTimeout(r, BULK_MESSAGE_DELAY_MS));
    }
  }
}
```

---

## 6. Audit Logging

### Log All Message Operations

```typescript
async function logMessageSent(
  chapterId: string,
  recipientType: 'individual' | 'group' | 'bulk',
  recipientId: string,
  message: string,
  status: 'sent' | 'failed',
  sentBy: string,
  error?: string
) {
  await supabase.from('whatsapp_message_logs').insert({
    chapter_id: chapterId,
    recipient_type: recipientType,
    recipient_id: recipientId,
    message_content: message,
    status,
    sent_by: sentBy,
    error_message: error,
    sent_at: new Date().toISOString()
  });
}
```

### What to Log

| Event | Log Data |
|-------|----------|
| Message sent | recipient, timestamp, sender |
| Message failed | recipient, error, timestamp |
| Connection started | chapter_id, timestamp |
| Connection ended | chapter_id, reason, timestamp |
| Bulk send | count, success_count, fail_count |

---

## 7. Session Security

### Session Isolation

- Each tenant gets unique session directory
- Sessions stored in Railway volume (not accessible externally)
- Session data encrypted by whatsapp-web.js

```typescript
new Client({
  authStrategy: new LocalAuth({
    dataPath: '/app/.wwebjs_auth',
    clientId: `tenant-${tenantId}` // Unique per tenant
  })
});
```

### Session Revocation

User can revoke from phone:
1. Open WhatsApp → Settings
2. Linked Devices
3. Log out specific device

Service can force disconnect:
```typescript
async function revokeSession() {
  await client.logout();
  await client.destroy();
  // Session files automatically cleaned up
}
```

---

## 8. Error Handling

### Don't Expose Internal Errors

```typescript
// BAD - exposes internal details
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

// GOOD - generic error to client, detailed log server-side
app.use((err, req, res, next) => {
  console.error('[Error]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'An internal error occurred',
    code: 'INTERNAL_ERROR'
  });
});
```

---

## 9. Environment Variables

### Required Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `API_KEY` | Service authentication | `abc123...` (32+ chars) |
| `ALLOWED_ORIGINS` | CORS whitelist | `https://app.com` |
| `WHATSAPP_SERVICE_URL` | Service endpoint | `https://wa.railway.app` |
| `WHATSAPP_API_KEY` | Same as API_KEY | `abc123...` |

### Never Commit

Add to `.gitignore`:
```
.env
.env.local
.env.production
```

### Use Secrets Manager

For production, use:
- Vercel Environment Variables
- Railway Variables
- AWS Secrets Manager
- HashiCorp Vault

---

## 10. Security Checklist

Before deploying to production:

- [ ] API key is strong (32+ characters)
- [ ] CORS whitelist contains only your domains
- [ ] RLS policies are enabled and tested
- [ ] Rate limiting is configured
- [ ] Error messages don't expose internals
- [ ] Audit logging is active
- [ ] Environment variables not in code
- [ ] Volume permissions are correct
- [ ] HTTPS is enforced (Railway handles this)
- [ ] Health endpoint doesn't expose sensitive data
