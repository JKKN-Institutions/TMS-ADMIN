# 🚀 TMS Admin Deployment Guide

## Quick Start Deployment

### ⚡ One-Click Deployments

**Vercel (Recommended)**
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

**Netlify**
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

---

## 📋 Prerequisites

✅ **Supabase Project** with database configured  
✅ **Environment Variables** ready  
✅ **Node.js 18+** installed locally  
✅ **Database** setup complete

---

## 🔧 Environment Configuration

### 1. Create Environment File

```bash
cp .env.example .env.local
```

### 2. Configure Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 3. Verify Setup

```bash
npm run db:status
```

---

## 🌐 Platform-Specific Deployment

## Vercel Deployment

### Method 1: GitHub Integration

1. Push code to GitHub
2. Connect repository in Vercel dashboard
3. Configure environment variables
4. Deploy automatically

### Method 2: CLI Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login and deploy
vercel login
vercel --prod
```

### Environment Variables in Vercel

```
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

---

## Netlify Deployment

### 1. Build Settings

```toml
[build]
  command = "npm run build"
  publish = ".next"
```

### 2. Environment Variables

Add in Netlify dashboard → Site settings → Environment variables

### 3. Deploy

```bash
netlify deploy --prod
```

---

## Docker Deployment

### 1. Build Image

```bash
docker build -t tms-admin .
```

### 2. Run Container

```bash
docker run -p 3001:3001 \
  -e NEXT_PUBLIC_SUPABASE_URL=your_url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key \
  -e SUPABASE_SERVICE_ROLE_KEY=your_service_key \
  tms-admin
```

### 3. Docker Compose

```bash
docker-compose up -d
```

---

## Traditional Server Deployment

### 1. Server Setup

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
npm install -g pm2
```

### 2. Application Deployment

```bash
# Clone and setup
git clone your-repo
cd tms-admin
npm install
cp .env.example .env.local
# Configure .env.local

# Build and start
npm run build
pm2 start npm --name "tms-admin" -- start
pm2 save
pm2 startup
```

---

## 🔍 Post-Deployment Verification

### 1. Health Check

```bash
curl https://your-domain.com/api/health
```

Expected response:

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Login Test

- Navigate to `/login`
- Use credentials: `SA001` / `superadmin123`
- Verify dashboard loads correctly

### 3. Database Verification

```bash
npm run db:status
```

---

## 🛡️ Production Security

### Security Checklist

- [ ] HTTPS configured
- [ ] Environment variables secured
- [ ] Admin passwords changed
- [ ] Database RLS enabled
- [ ] Error logging configured
- [ ] Monitoring setup

### Recommended Security Headers

```javascript
// Already configured in next.config.ts
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 📊 Monitoring & Maintenance

### Health Monitoring

- Health endpoint: `/api/health`
- Database connectivity checks
- Response time monitoring
- Error rate tracking

### Log Management

```bash
# PM2 logs
pm2 logs tms-admin

# Docker logs
docker logs tms-admin

# Vercel/Netlify logs available in dashboard
```

---

## 🚨 Troubleshooting

### Common Issues

**Environment Variables Not Loading**

```bash
# Verify variables
node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"
```

**Database Connection Failed**

- Check Supabase URL and keys
- Verify network connectivity
- Confirm database is accessible

**Build Failures**

```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

**Health Check Failing**

- Verify environment variables
- Check database connectivity
- Review application logs

---

## 📞 Support Commands

```bash
# Application health
npm run health-check

# Database status
npm run db:status

# Production setup verification
npm run scripts/production-setup

# Build verification
npm run build

# Type checking
npm run type-check
```

---

## ✅ Deployment Checklist

**Pre-Deployment**

- [ ] Database tables created
- [ ] Admin users configured
- [ ] Environment variables set
- [ ] Application builds locally
- [ ] Health check passes

**Post-Deployment**

- [ ] Health endpoint responding
- [ ] Login functionality works
- [ ] Database operations working
- [ ] All pages load correctly
- [ ] HTTPS configured
- [ ] Monitoring enabled

---

## 🎯 Performance Optimization

### Production Settings

- ✅ Standalone output enabled
- ✅ Compression enabled
- ✅ Image optimization configured
- ✅ Security headers applied
- ✅ Telemetry disabled

### Recommended Optimizations

- Configure CDN for static assets
- Enable gzip/brotli compression
- Monitor database query performance
- Set up caching strategies

---

**🎉 Your TMS Admin application is now production-ready and can be deployed to any platform!**

For additional support, check the health endpoint and review logs for any deployment issues.
