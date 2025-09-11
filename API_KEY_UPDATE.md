# API Key Update Guide

## Current Status

Your student API integration is configured with the endpoint you provided:

- **URL**: `https://my.jkkn.ac.in/api/api-management/students`
- **Current API Key**: `jk_21372a6d0f4ca05d02139a0fb714a2e5_mcejx5qz`

## If You Get "API authentication failed" Error

The current API key might be expired or invalid. Here's how to update it:

### Method 1: Update in Code Files (Quick Fix)

1. **Edit the students search API file:**

   ```bash
   admin/app/api/api-management/students/route.ts
   ```

   Find line 4 and update:

   ```javascript
   const API_KEY = "YOUR_NEW_API_KEY_HERE";
   ```

2. **Edit the student details API file:**

   ```bash
   admin/app/api/api-management/students/[id]/route.ts
   ```

   Find line 4 and update:

   ```javascript
   const API_KEY = "YOUR_NEW_API_KEY_HERE";
   ```

3. **Restart your development server:**
   ```bash
   npm run dev
   ```

### Method 2: Use Environment Variables (Recommended)

1. **Create a `.env.local` file** in the `admin` folder:

   ```bash
   STUDENT_API_KEY=your_new_api_key_here
   ```

2. **Update both API files to use the environment variable:**

   In `admin/app/api/api-management/students/route.ts`:

   ```javascript
   const API_KEY =
     process.env.STUDENT_API_KEY ||
     "jk_21372a6d0f4ca05d02139a0fb714a2e5_mcejx5qz";
   ```

   In `admin/app/api/api-management/students/[id]/route.ts`:

   ```javascript
   const API_KEY =
     process.env.STUDENT_API_KEY ||
     "jk_21372a6d0f4ca05d02139a0fb714a2e5_mcejx5qz";
   ```

3. **Restart your development server:**
   ```bash
   npm run dev
   ```

## Testing the API Connection

After updating the API key, test the connection:

1. **Navigate to Students page** in your admin panel
2. **Click "Add Student"**
3. **Enter a real student email** from your database
4. **Click "Fetch Details"**

If you still get authentication errors:

- Verify the API key is correct and active
- Check with your API provider about any additional authentication requirements
- Ensure the API key has permissions for the students endpoint

## API Endpoint Specification

Your integration uses these exact endpoints as provided:

**Search Students:**

```bash
GET https://my.jkkn.ac.in/api/api-management/students?search=EMAIL&page=1&limit=10
Headers:
- Authorization: Bearer YOUR_API_KEY
- Accept: application/json
- Content-Type: application/json
```

**Get Student Details:**

```bash
GET https://my.jkkn.ac.in/api/api-management/students/STUDENT_ID
Headers:
- Authorization: Bearer YOUR_API_KEY
- Accept: application/json
- Content-Type: application/json
```

The integration is ready to work as soon as the API key authentication is resolved!
