# Railway Deployment Guide

## Prerequisites

- Railway account (https://railway.app)
- GitHub repository with WhatsApp service code
- Node.js 18+ compatible code

---

## Step 1: Create Railway Project

1. Go to https://railway.app/new
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account
4. Select the repository containing `whatsapp-service/`

---

## Step 2: Configure Root Directory

If WhatsApp service is in a subdirectory:

1. Go to Project Settings → General
2. Set **Root Directory**: `whatsapp-service`

---

## Step 3: Add Persistent Volume

**Critical:** Without a volume, sessions are lost on redeploy.

1. Go to your service in Railway
2. Click **+ New** → **Volume**
3. Configure:
   - **Mount Path**: `/app/.wwebjs_auth`
   - **Size**: 1 GB (sufficient for session data)
4. Click **Create Volume**

---

## Step 4: Set Environment Variables

Go to **Variables** tab and add:

```env
# Required
API_KEY=generate-a-secure-random-string
ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:3000

# Optional (Railway sets PORT automatically)
PORT=3001
NODE_ENV=production

# Chromium path (for Docker deployments)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Generate secure API key:**
```bash
openssl rand -base64 32
```

---

## Step 5: Add Dockerfile

Create `Dockerfile` in your whatsapp-service directory:

```dockerfile
FROM node:18-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript (if applicable)
RUN npm run build || true

# Expose port
EXPOSE 3001

# Start server
CMD ["npm", "start"]
```

---

## Step 6: Configure package.json

Ensure your `package.json` has proper scripts:

```json
{
  "name": "whatsapp-service",
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc",
    "dev": "tsx watch src/index.ts"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## Step 7: Deploy

**Option A: Auto-deploy from GitHub**
- Push to main branch
- Railway auto-deploys

**Option B: Manual deploy**
```bash
railway up
```

---

## Step 8: Get Service URL

1. Go to your deployed service
2. Click **Settings** → **Networking**
3. Click **Generate Domain**
4. Copy the URL (e.g., `https://whatsapp-service-production-abc123.up.railway.app`)

---

## Step 9: Configure Web App

Add to your web app's environment variables:

```env
WHATSAPP_SERVICE_URL=https://your-service.railway.app
WHATSAPP_API_KEY=same-key-as-railway
```

---

## Monitoring

### View Logs

1. Go to your service in Railway
2. Click **Deployments** → Select deployment
3. Click **View Logs**

### Health Check

Test your deployment:
```bash
curl https://your-service.railway.app/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-15T10:30:00.000Z"}
```

---

## Troubleshooting

### Issue: "Chromium not found"

**Solution:** Ensure Dockerfile installs Chromium and sets:
```env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

### Issue: "Session lost after redeploy"

**Solution:** Verify volume is mounted at `/app/.wwebjs_auth`:
1. Go to service → Volumes
2. Check mount path is correct
3. Redeploy

### Issue: "CORS error"

**Solution:** Add your app's domain to `ALLOWED_ORIGINS`:
```env
ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:3000
```

### Issue: "QR code not generating"

**Solution:** Check logs for Puppeteer errors:
- Memory issues: Upgrade Railway plan
- Timeout: Increase `INIT_TIMEOUT_MS` in code

### Issue: "Connection drops frequently"

**Solution:**
- Ensure phone has stable internet
- Keep phone charged and connected
- Don't use WhatsApp Web on another device simultaneously

---

## Cost Estimation

| Resource | Railway Pricing |
|----------|-----------------|
| Starter Plan | $5/month (includes 500 hours) |
| Volume (1GB) | Included in Starter |
| Bandwidth | Generous free tier |

For low-traffic apps, the Starter plan is sufficient.

---

## Alternative: Docker Compose (Self-hosted)

For self-hosted VPS deployment:

```yaml
version: '3.8'
services:
  whatsapp-service:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - whatsapp_auth:/app/.wwebjs_auth
    environment:
      - API_KEY=${API_KEY}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
      - NODE_ENV=production
    restart: unless-stopped

volumes:
  whatsapp_auth:
```

Run with:
```bash
docker-compose up -d
```
