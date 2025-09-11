# TMS Supabase Database Files

## 📁 File Overview

### Core Schema Files (Run in Order)

1. **`01-schema.sql`** - Main database tables and relationships
2. **`02-indexes-triggers.sql`** - Performance indexes and automated functions
3. **`03-rls-policies-simple.sql`** - ⭐ **USE THIS** for Row Level Security (avoids permission errors)
4. **`04-seed-data.sql`** - Sample data for testing (optional)

### Alternative Files

- **`03-rls-policies.sql`** - Full RLS policies (may cause permission errors)
- **`schema.sql`** - Legacy schema file

### Documentation

- **`QUICK_FIX_RLS.md`** - Instructions for fixing RLS permission errors
- **`README.md`** - This file

## 🚀 Quick Start

1. Copy and run `01-schema.sql` in Supabase SQL Editor
2. Copy and run `02-indexes-triggers.sql`
3. Copy and run `03-rls-policies-simple.sql` ⭐
4. Optionally run `04-seed-data.sql` for sample data

## ⚠️ If You Get Permission Errors

If you see "permission denied for schema auth", use the simplified RLS file (`03-rls-policies-simple.sql`) instead of the full version.

See `QUICK_FIX_RLS.md` for detailed instructions.
