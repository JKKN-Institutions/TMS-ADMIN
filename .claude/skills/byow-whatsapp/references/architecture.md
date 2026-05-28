# BYOW WhatsApp Architecture

## System Overview

The BYOW (Bring Your Own WhatsApp) architecture enables web applications to send WhatsApp messages using the user's personal WhatsApp account through WhatsApp Web protocol.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETE ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   User's Phone   │◄────────────────────────────────────────┐            │
│  │   (WhatsApp)     │                                          │            │
│  └────────┬─────────┘                                          │            │
│           │ QR Scan                                             │            │
│           │ Links devices                                       │            │
│           ▼                                                     │            │
│  ┌──────────────────┐      WebSocket      ┌──────────────────┐ │            │
│  │  WhatsApp Web    │◄────────────────────│  whatsapp-web.js │ │            │
│  │  (Protocol)      │                     │  (Puppeteer)     │ │            │
│  └──────────────────┘                     └────────┬─────────┘ │            │
│                                                     │           │            │
│                                           ┌────────▼─────────┐ │            │
│                                           │  Express Server  │ │            │
│                                           │  (Railway)       │ │            │
│                                           │                  │ │            │
│                                           │  Endpoints:      │ │            │
│                                           │  - /connect      │ │            │
│                                           │  - /status       │ │            │
│                                           │  - /send         │ │ Messages   │
│                                           │  - /send-bulk    │ │ sent via   │
│                                           │  - /disconnect   │ │ user's #   │
│                                           └────────┬─────────┘ │            │
│                                                     │           │            │
│                                    HTTPS + API Key  │           │            │
│                                                     │           │            │
│                                           ┌────────▼─────────┐ │            │
│                                           │   Web App        │ │            │
│                                           │   (Vercel)       │─┘            │
│                                           │                  │              │
│                                           │  - Settings UI   │              │
│                                           │  - QR Display    │              │
│                                           │  - Send Actions  │              │
│                                           └────────┬─────────┘              │
│                                                     │                       │
│                                           ┌────────▼─────────┐              │
│                                           │   Supabase       │              │
│                                           │   (Optional)     │              │
│                                           │                  │              │
│                                           │  - Connections   │              │
│                                           │  - Groups        │              │
│                                           │  - Templates     │              │
│                                           │  - Message Logs  │              │
│                                           └──────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. WhatsApp Service (Railway)

**Technology Stack:**
- Express.js (HTTP server)
- whatsapp-web.js (WhatsApp Web client library)
- Puppeteer (headless Chrome)
- qrcode (QR generation)

**Responsibilities:**
- Manage WhatsApp Web connection
- Generate QR codes for authentication
- Send individual and bulk messages
- Persist session across restarts

**Why Railway?**
| Requirement | Why Vercel Won't Work | Railway Solution |
|-------------|----------------------|------------------|
| Persistent process | Serverless = cold starts | Always-on container |
| Chrome/Puppeteer | Binary dependencies fail | Docker with Chromium |
| Session storage | Ephemeral filesystem | Persistent volume |
| Long connections | 10s timeout limit | No timeout |

### 2. Web Application (Vercel)

**Technology Stack:**
- Next.js 14+ (App Router)
- React (UI components)
- Server Actions (API proxy)
- Tailwind CSS (styling)

**Responsibilities:**
- Display QR code for scanning
- Show connection status
- Provide message composition UI
- Proxy requests to WhatsApp service

### 3. Database (Supabase) - Optional

**Tables:**
- `whatsapp_connections` - Track connected accounts per tenant
- `whatsapp_groups` - Store group JIDs and metadata
- `whatsapp_templates` - Reusable message templates
- `whatsapp_message_logs` - Audit trail for sent messages

**Multi-Tenant Model:**
```
tenant_id → chapter_id → whatsapp_connection
                      → whatsapp_groups[]
                      → whatsapp_templates[]
                      → message_logs[]
```

---

## Data Flow

### Connection Flow

```
1. User clicks "Connect WhatsApp"
   └─► Web App sends POST /connect to Service

2. Service initializes whatsapp-web.js
   └─► Launches headless Chrome
   └─► Opens WhatsApp Web
   └─► Waits for QR event

3. QR code generated
   └─► Converted to data URL (base64)
   └─► Returned to Web App
   └─► Displayed in Settings UI

4. User scans QR with phone
   └─► WhatsApp authenticates
   └─► Service receives 'authenticated' event

5. Session established
   └─► Saved to /app/.wwebjs_auth
   └─► Status becomes 'ready'
   └─► Web App shows "Connected"
```

### Message Send Flow

```
1. User composes message in Web App
   └─► Selects recipients (phone/group)
   └─► Writes message content

2. Web App calls Server Action
   └─► Server Action calls WhatsApp Service
   └─► POST /send { phoneNumber, message }

3. Service processes request
   └─► Validates phone number format
   └─► Checks if number is on WhatsApp
   └─► Sends via whatsapp-web.js

4. Message delivered
   └─► Returns success + message ID
   └─► Web App logs to database
   └─► Shows success notification
```

---

## Session Persistence

### Local Development

```
project/
└── .wwebjs_auth/
    └── session-yi-connect/
        ├── Default/
        │   ├── Cookies
        │   ├── Local Storage/
        │   └── ...
        └── ...
```

### Production (Railway)

```
/app/
└── .wwebjs_auth/          ◄── Railway Volume
    └── session-yi-connect/
        └── ...
```

**Volume Configuration:**
- Mount path: `/app/.wwebjs_auth`
- Size: 1GB (sufficient for session data)
- Persistence: Survives redeploys

---

## Phone Number Formatting

WhatsApp uses JIDs (Jabber IDs) for addressing:

| Type | Format | Example |
|------|--------|---------|
| Individual | `{country}{number}@c.us` | `919876543210@c.us` |
| Group | `{id}@g.us` | `120363374011459909@g.us` |

**Conversion Function:**
```typescript
function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');

  // Handle Indian numbers
  if (cleaned.startsWith('0')) {
    cleaned = '91' + cleaned.substring(1);
  } else if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }

  return `${cleaned}@c.us`;
}
```

---

## Connection States

```
┌──────────────┐
│ disconnected │◄──────────────────────────────────────┐
└──────┬───────┘                                        │
       │ POST /connect                                  │
       ▼                                                │
┌──────────────┐                                        │
│  connecting  │────────────────────────────────────────┤
└──────┬───────┘  timeout/error                         │
       │ QR generated                                   │
       ▼                                                │
┌──────────────┐                                        │
│   qr_ready   │────────────────────────────────────────┤
└──────┬───────┘  QR expired                            │
       │ User scans QR                                  │
       ▼                                                │
┌──────────────┐                                        │
│authenticated │                                        │
└──────┬───────┘                                        │
       │ Finalization                                   │
       ▼                                                │
┌──────────────┐                                        │
│    ready     │────────────────────────────────────────┘
└──────────────┘  disconnect/logout
```

---

## Rate Limiting

WhatsApp enforces rate limits (undocumented). Best practices:

| Scenario | Recommendation |
|----------|----------------|
| Bulk messages | 1.5-2 second delay between sends |
| Group messages | Maximum 5 groups per minute |
| New contacts | Verify number exists first |
| Daily limit | Stay under 200-500 messages |

**Implementation:**
```typescript
async function sendBulkMessages(
  recipients: Array<{ phone: string; message: string }>,
  delayMs: number = 1500
) {
  for (const recipient of recipients) {
    await sendMessage(recipient.phone, recipient.message);
    await sleep(delayMs);
  }
}
```

---

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `QR_TIMEOUT` | User didn't scan in time | Regenerate QR |
| `AUTH_FAILURE` | Invalid/expired session | Clear session, reconnect |
| `DISCONNECTED` | Phone went offline | Re-scan QR |
| `NUMBER_NOT_REGISTERED` | Phone not on WhatsApp | Skip recipient |
| `RATE_LIMITED` | Too many messages | Increase delay |
