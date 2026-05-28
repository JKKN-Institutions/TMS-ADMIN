# Tech Stack Reference

Complete dependency list for Next.js 16 admin dashboard with version compatibility.

## Table of Contents

1. [Core Framework](#core-framework)
2. [UI & Styling](#ui--styling)
3. [Forms & Validation](#forms--validation)
4. [Data Tables](#data-tables)
5. [Authentication](#authentication)
6. [State Management](#state-management)
7. [Utilities](#utilities)
8. [Development Tools](#development-tools)
9. [Optional Features](#optional-features)

---

## Core Framework

### Next.js & React

```json
{
  "next": "^16.0.0",
  "react": "^19.2.0",
  "react-dom": "^19.2.0"
}
```

**Why these versions:**
- Next.js 16: Cache Components, async params/searchParams, Turbopack
- React 19.2: Server Actions, useActionState, useFormStatus, async transitions

### TypeScript

```json
{
  "typescript": "^5.7.0",
  "@types/node": "^22.0.0",
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0"
}
```

---

## UI & Styling

### Tailwind CSS

```json
{
  "tailwindcss": "^4.0.0",
  "tailwindcss-animate": "^1.0.7",
  "autoprefixer": "^10.4.20",
  "postcss": "^8.4.47"
}
```

**Configuration**: Uses `@tailwind/postcss` plugin for Tailwind 4

### Shadcn UI & Radix UI

```json
{
  "@radix-ui/react-accordion": "^1.2.2",
  "@radix-ui/react-alert-dialog": "^1.1.4",
  "@radix-ui/react-avatar": "^1.1.2",
  "@radix-ui/react-checkbox": "^1.1.3",
  "@radix-ui/react-collapsible": "^1.1.2",
  "@radix-ui/react-dialog": "^1.1.4",
  "@radix-ui/react-dropdown-menu": "^2.1.4",
  "@radix-ui/react-label": "^2.1.1",
  "@radix-ui/react-popover": "^1.1.4",
  "@radix-ui/react-radio-group": "^1.2.2",
  "@radix-ui/react-scroll-area": "^1.2.2",
  "@radix-ui/react-select": "^2.1.4",
  "@radix-ui/react-separator": "^1.1.1",
  "@radix-ui/react-slider": "^1.2.2",
  "@radix-ui/react-slot": "^1.1.1",
  "@radix-ui/react-switch": "^1.1.2",
  "@radix-ui/react-tabs": "^1.1.2",
  "@radix-ui/react-toast": "^1.2.4",
  "@radix-ui/react-tooltip": "^1.1.6"
}
```

**Total**: 45+ Shadcn UI components available

### Icons

```json
{
  "lucide-react": "^0.468.0",
  "@tabler/icons-react": "^3.29.0"
}
```

**Usage**: Lucide for UI icons, Tabler for additional variety

### Theme & Dark Mode

```json
{
  "next-themes": "^0.4.4"
}
```

**Features**: System preference detection, class-based theming

---

## Forms & Validation

### React Hook Form

```json
{
  "react-hook-form": "^7.54.2",
  "@hookform/resolvers": "^3.9.1"
}
```

**Features**: Client-side validation, async validation, controlled/uncontrolled

### Zod

```json
{
  "zod": "^4.0.0"
}
```

**Features**: Schema validation, type inference, error messages

### Date & Time

```json
{
  "date-fns": "^4.1.0",
  "react-day-picker": "^9.4.4"
}
```

**Features**: Date formatting, calendar picker, timezone support

### OTP Input

```json
{
  "input-otp": "^1.4.2"
}
```

**Features**: One-time password input with patterns

---

## Data Tables

### TanStack Table

```json
{
  "@tanstack/react-table": "^8.20.6"
}
```

**Features**: Headless table, sorting, filtering, pagination

### URL State Management

```json
{
  "nuqs": "^2.2.4"
}
```

**Features**: Type-safe URL state, Next.js 16 compatible, history support

---

## Authentication

### Supabase

```json
{
  "@supabase/supabase-js": "^2.47.10",
  "@supabase/ssr": "^0.5.2"
}
```

**Features**: Auth with SSR, Row Level Security, OAuth providers

---

## State Management

### Client State

```json
{
  "zustand": "^5.0.3"
}
```

**Features**: Minimal, React hooks, no boilerplate

**Note**: Server state managed by Cache Components, not Zustand

---

## Utilities

### Class Utilities

```json
{
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.6.0",
  "class-variance-authority": "^0.7.1"
}
```

**Usage**:
```ts
import { cn } from '@/lib/utils'

cn('base-class', condition && 'conditional-class')
```

### Animation

```json
{
  "motion": "^11.15.0"
}
```

**Features**: Framer Motion successor, declarative animations

---

## Development Tools

### Linting & Formatting

```json
{
  "eslint": "^9.17.0",
  "eslint-config-next": "^16.0.0",
  "prettier": "^3.4.2",
  "prettier-plugin-tailwindcss": "^0.6.9"
}
```

### Git Hooks

```json
{
  "husky": "^9.1.7",
  "lint-staged": "^15.2.11"
}
```

**Configuration**:
```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

## Optional Features

### Command Palette

```json
{
  "kbar": "^0.1.0-beta.45"
}
```

**Features**: Cmd+K search, custom actions, keyboard navigation

### Charts

```json
{
  "recharts": "^2.15.0"
}
```

**Features**: Composable charts, responsive, animations

### Drag & Drop

```json
{
  "@dnd-kit/core": "^6.3.1",
  "@dnd-kit/sortable": "^9.0.0",
  "@dnd-kit/modifiers": "^8.0.0",
  "@dnd-kit/utilities": "^3.2.2"
}
```

**Features**: Kanban boards, sortable lists, accessible

### File Upload

```json
{
  "react-dropzone": "^14.3.5"
}
```

**Features**: Drag-drop upload, validation, preview

### Monitoring

```json
{
  "@sentry/nextjs": "^8.46.0"
}
```

**Features**: Error tracking, performance monitoring, session replay

---

## Installation Command

Install all core dependencies:

```bash
# Core framework
npm install next@16 react@19.2 react-dom@19.2

# TypeScript
npm install -D typescript @types/node @types/react @types/react-dom

# Tailwind CSS 4
npm install tailwindcss@4 tailwindcss-animate autoprefixer postcss

# Shadcn UI prerequisites
npm install @radix-ui/react-accordion @radix-ui/react-alert-dialog \
  @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-popover \
  @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider \
  @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toast \
  @radix-ui/react-tooltip @radix-ui/react-slot @radix-ui/react-scroll-area

# Icons
npm install lucide-react @tabler/icons-react

# Forms & Validation
npm install react-hook-form @hookform/resolvers zod@4 date-fns react-day-picker

# Data Tables
npm install @tanstack/react-table nuqs

# Authentication
npm install @supabase/supabase-js @supabase/ssr

# Utilities
npm install clsx tailwind-merge class-variance-authority next-themes zustand

# Dev tools
npm install -D eslint eslint-config-next prettier prettier-plugin-tailwindcss \
  husky lint-staged
```

Install optional features:

```bash
# Command palette
npm install kbar

# Charts
npm install recharts

# Drag & drop
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities

# File upload
npm install react-dropzone

# Monitoring
npm install @sentry/nextjs
```

---

## Compatibility Matrix

| Package | Next.js 16 | React 19 | TypeScript 5.7 | Node 18+ |
|---------|------------|----------|----------------|----------|
| @tanstack/react-table | ✅ | ✅ | ✅ | ✅ |
| nuqs | ✅ | ✅ | ✅ | ✅ |
| @supabase/ssr | ✅ | ✅ | ✅ | ✅ |
| react-hook-form | ✅ | ✅ | ✅ | ✅ |
| zod | ✅ | ✅ | ✅ | ✅ |
| next-themes | ✅ | ✅ | ✅ | ✅ |
| shadcn/ui | ✅ | ✅ | ✅ | ✅ |

---

## Version Updates

### Migrating from Next.js 15

```bash
# Update Next.js and React
npm install next@16 react@19.2 react-dom@19.2

# Update types
npm install -D @types/react@19 @types/react-dom@19

# Update Tailwind (if on v3)
npm install tailwindcss@4
```

**Breaking changes:**
- `params` and `searchParams` are now async
- `cookies()` and `headers()` are async
- Dynamic APIs require `await`

### Migrating from Zod 3 to Zod 4

```bash
npm install zod@4
```

**Breaking changes:**
- Some schema APIs changed
- Error message format updated
- Check migration guide: https://github.com/colinhacks/zod/releases

---

## Recommended package.json

```json
{
  "name": "dashboard-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "format": "prettier --write .",
    "type-check": "tsc --noEmit",
    "prepare": "husky"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.1",
    "@radix-ui/react-accordion": "^1.2.2",
    "@radix-ui/react-avatar": "^1.1.2",
    "@radix-ui/react-checkbox": "^1.1.3",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-popover": "^1.1.4",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-separator": "^1.1.1",
    "@radix-ui/react-slider": "^1.2.2",
    "@radix-ui/react-slot": "^1.1.1",
    "@radix-ui/react-switch": "^1.1.2",
    "@radix-ui/react-tooltip": "^1.1.6",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.47.10",
    "@tanstack/react-table": "^8.20.6",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.468.0",
    "motion": "^11.15.0",
    "next": "^16.0.0",
    "next-themes": "^0.4.4",
    "nuqs": "^2.2.4",
    "react": "^19.2.0",
    "react-day-picker": "^9.4.4",
    "react-dom": "^19.2.0",
    "react-hook-form": "^7.54.2",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^4.0.0",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "eslint-config-next": "^16.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^15.2.11",
    "postcss": "^8.4.47",
    "prettier": "^3.4.2",
    "prettier-plugin-tailwindcss": "^0.6.9",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

---

## Environment Variables

Required for production:

```env
# Next.js
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Sentry (optional)
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
SENTRY_AUTH_TOKEN=your-auth-token
```

---

## Build Configuration

### next.config.ts

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable experimental features
  experimental: {
    // Cache Components (stable in Next.js 16)
    cacheComponents: true,

    // Use Turbopack in development
    turbo: {},
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'your-supabase-project.supabase.co',
      },
    ],
  },
}

export default nextConfig
```

---

## See Also

- [Shadcn UI Guide](./shadcn-ui-guide.md)
- [Supabase Auth Patterns](./supabase-auth-patterns.md)
- [Complete Workflow](../workflows/complete-workflow.md)
