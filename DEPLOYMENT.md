# TMS Admin Deployment Guide

This guide covers deploying the TMS Admin application to various platforms.

## 🎯 Prerequisites

Before deploying, ensure you have:

1. **Supabase Project** with database tables set up
2. **Environment Variables** configured
3. **Admin Users** created in the database
4. **Application** tested locally

---

## 🔧 Environment Setup

### 1. Copy Environment Template

```bash
cp .env.example .env.local
```

### 2. Configure Variables

Fill in your actual values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Test Database Connection

```bash
npm run db:status
```

---

## 🚀 Deployment Options

## Option 1: Vercel (Recommended)

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/tms-admin)

### Manual Deployment

1. **Install Vercel CLI**

```bash
npm i -g vercel
```

2. **Configure Environment Variables**

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

3. **Deploy**

```bash
npm run deploy:vercel
```

### Vercel Environment Setup

- Go to your project dashboard
- Settings → Environment Variables
- Add the three required variables for Production, Preview, and Development

---

## Option 2: Netlify

### 1. Connect Repository

- Push code to GitHub/GitLab
- Connect repository in Netlify dashboard
- Configure build settings

### 2. Environment Variables

In Netlify dashboard:

- Site settings → Environment variables
- Add required variables

### 3. Deploy

```bash
npm run deploy:netlify
```

---

## Option 3: Docker

### 1. Build Docker Image

```bash
npm run docker:build
```

### 2. Run Container

```bash
docker run -p 3001:3001 \
  -e NEXT_PUBLIC_SUPABASE_URL=your_url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key \
  -e SUPABASE_SERVICE_ROLE_KEY=your_service_key \
  tms-admin
```

### 3. Docker Compose (Recommended)

```bash
npm run docker:compose
```

---

## Option 4: Traditional VPS/Server

### 1. Install Dependencies

```bash
# Node.js 18+ and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 for process management
npm install -g pm2
```

### 2. Deploy Application

```bash
# Clone repository
git clone https://github.com/your-org/tms-admin.git
cd tms-admin

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your values

# Build application
npm run build

# Start with PM2
pm2 start npm --name "tms-admin" -- start
pm2 save
pm2 startup
```

### 3. Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
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
  "message": "TMS Admin application is running",
  "database": "connected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Login Test

- Navigate to `/login`
- Use admin credentials:
  - Username: `SA001`
  - Password: `superadmin123`

### 3. Database Connection

- Check dashboard loads correctly
- Verify all pages load without errors
- Test adding sample data

---

## 🛡️ Security Considerations

### Production Checklist

- [ ] Environment variables secured
- [ ] Database RLS policies enabled
- [ ] HTTPS configured
- [ ] Admin passwords changed
- [ ] Error logging configured
- [ ] Backup strategy implemented
- [ ] Monitoring set up

### Environment Variables Security

- **Never commit** `.env.local` to version control
- Use **encrypted secrets** in CI/CD
- **Rotate keys** regularly
- **Audit access** to environment variables

---

## 🔧 Database Management

### Initial Setup

```bash
# Verify database setup
npm run db:status

# Setup production database
npm run setup-production-db
```

### Backup Strategy

```bash
# Create backup
supabase db dump --schema public > backup.sql

# Restore backup
supabase db reset --linked
psql -h your-db-host -U your-user -d your-db < backup.sql
```

---

## 📊 Monitoring & Maintenance

### Application Monitoring

- Health endpoint: `/api/health`
- Response time monitoring
- Error rate tracking
- Database connection monitoring

### Log Management

```bash
# PM2 logs (if using VPS)
pm2 logs tms-admin

# Docker logs
docker logs tms-admin

# Vercel logs (in dashboard)
```

### Performance Optimization

- Enable CDN for static assets
- Configure caching headers
- Monitor database query performance
- Use compression (gzip/brotli)

---

## 🚨 Troubleshooting

### Common Issues

#### 1. Environment Variables Not Loading

```bash
# Check variables
npm run db:status

# Verify build includes env vars
npm run build
```

#### 2. Database Connection Failed

- Verify Supabase URL and keys
- Check network connectivity
- Confirm RLS policies allow admin access

#### 3. Build Failures

```bash
# Clear cache
rm -rf .next node_modules
npm install
npm run build
```

#### 4. Health Check Failing

- Verify environment variables
- Check database connectivity
- Review application logs

---

## 📞 Support

### Getting Help

1. Check health endpoint: `/api/health`
2. Review application logs
3. Verify database status: `npm run db:status`
4. Check environment configuration

### Useful Commands

```bash
# Quick health check
npm run health-check

# Database status
npm run db:status

# Build verification
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

---

## ✅ Deployment Checklist

- [ ] Supabase project configured
- [ ] Database tables created
- [ ] Admin users set up
- [ ] Environment variables configured
- [ ] Application builds successfully
- [ ] Health check passes
- [ ] Login functionality works
- [ ] All pages load correctly
- [ ] Database operations work
- [ ] HTTPS configured (production)
- [ ] Monitoring set up
- [ ] Backup strategy implemented

**🎉 Your TMS Admin application is now deployed and ready for production use!**
