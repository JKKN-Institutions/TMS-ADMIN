#!/bin/bash

# setup_auth.sh - Configure Supabase Auth for Next.js 16
# This script sets up complete authentication with middleware, context, and pages

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Get skill templates directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$SKILL_DIR/templates/auth"

# Check if templates directory exists
check_templates() {
    if [ ! -d "$TEMPLATES_DIR" ]; then
        print_error "Templates directory not found at: $TEMPLATES_DIR"
        print_info "Make sure you're running this script from the skill directory"
        exit 1
    fi
    print_success "Templates directory found"
}

# Create Supabase client utilities
create_supabase_clients() {
    print_header "Creating Supabase Client Utilities"

    mkdir -p lib/supabase

    # Server client
    cat > lib/supabase/server.ts << 'EOF'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options)
          } catch (error) {
            // Handle cookie setting errors
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', options)
          } catch (error) {
            // Handle cookie removal errors
          }
        },
      },
    }
  )
}
EOF

    # Client component client
    cat > lib/supabase/client.ts << 'EOF'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
EOF

    print_success "Supabase clients created"
}

# Copy middleware from templates
copy_middleware() {
    print_header "Creating Middleware"

    if [ -f "$TEMPLATES_DIR/middleware.ts" ]; then
        cp "$TEMPLATES_DIR/middleware.ts" middleware.ts
        print_success "Middleware copied from templates"
    else
        print_error "Middleware template not found"
        exit 1
    fi
}

# Copy auth context from templates
copy_auth_context() {
    print_header "Creating Auth Context"

    mkdir -p contexts

    if [ -f "$TEMPLATES_DIR/auth-context.tsx" ]; then
        cp "$TEMPLATES_DIR/auth-context.tsx" contexts/auth-context.tsx
        print_success "Auth context copied from templates"
    else
        print_error "Auth context template not found"
        exit 1
    fi
}

# Copy protected route component
copy_protected_route() {
    print_header "Creating Protected Route Component"

    mkdir -p components/auth

    if [ -f "$TEMPLATES_DIR/protected-route.tsx" ]; then
        cp "$TEMPLATES_DIR/protected-route.tsx" components/auth/protected-route.tsx
        print_success "Protected route component copied"
    else
        print_error "Protected route template not found"
        exit 1
    fi
}

# Copy user dropdown component
copy_user_dropdown() {
    print_header "Creating User Dropdown Component"

    mkdir -p components/header

    if [ -f "$TEMPLATES_DIR/user-dropdown.tsx" ]; then
        cp "$TEMPLATES_DIR/user-dropdown.tsx" components/header/user-dropdown.tsx
        print_success "User dropdown component copied"
    else
        print_error "User dropdown template not found"
        exit 1
    fi
}

# Copy auth pages
copy_auth_pages() {
    print_header "Creating Auth Pages"

    mkdir -p app/auth/{sign-in,sign-up,callback}

    # Sign in page
    if [ -f "$TEMPLATES_DIR/auth-pages/sign-in.tsx" ]; then
        cat > app/auth/sign-in/page.tsx << 'EOF'
import SignIn from '@/templates/auth/auth-pages/sign-in'

export default function SignInPage() {
  return <SignIn />
}
EOF
        # Copy the actual component
        mkdir -p components/auth/pages
        cp "$TEMPLATES_DIR/auth-pages/sign-in.tsx" components/auth/pages/sign-in.tsx
        print_success "Sign in page created"
    fi

    # Sign up page
    if [ -f "$TEMPLATES_DIR/auth-pages/sign-up.tsx" ]; then
        cat > app/auth/sign-up/page.tsx << 'EOF'
import SignUp from '@/templates/auth/auth-pages/sign-up'

export default function SignUpPage() {
  return <SignUp />
}
EOF
        cp "$TEMPLATES_DIR/auth-pages/sign-up.tsx" components/auth/pages/sign-up.tsx
        print_success "Sign up page created"
    fi

    # Auth callback route
    cat > app/auth/callback/route.ts << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(`${origin}/auth/error`)
    }
  }

  return NextResponse.redirect(`${origin}${redirect}`)
}
EOF

    print_success "Auth callback route created"
}

# Create database schema SQL
create_db_schema() {
    print_header "Creating Database Schema"

    mkdir -p supabase/migrations

    cat > supabase/migrations/001_create_profiles.sql << 'EOF'
-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger: Create profile on user signup
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_on_signup();

-- Index for performance
CREATE INDEX idx_profiles_role ON profiles(role);
EOF

    print_success "Database schema created at supabase/migrations/001_create_profiles.sql"
    print_info "Run this migration in your Supabase project"
}

# Update root layout with AuthProvider
update_root_layout() {
    print_header "Updating Root Layout"

    if [ -f "app/layout.tsx" ]; then
        print_info "Root layout exists. You'll need to manually add AuthProvider:"
        echo -e "${YELLOW}"
        cat << 'EOF'

Add to app/layout.tsx:

import { AuthProvider } from '@/contexts/auth-context'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
EOF
        echo -e "${NC}"
    else
        print_info "No root layout found. Create one with AuthProvider wrapper."
    fi
}

# Check environment variables
check_env_vars() {
    print_header "Checking Environment Variables"

    if [ ! -f ".env.local" ]; then
        print_error ".env.local not found"
        cat > .env.local << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
EOF
        print_info "Created .env.local template"
    fi

    # Check if variables are set
    if grep -q "your-project-url" .env.local; then
        print_error "Supabase environment variables not configured"
        print_info "Update .env.local with your Supabase credentials from:"
        print_info "https://app.supabase.com/project/_/settings/api"
    else
        print_success "Environment variables configured"
    fi
}

# Print setup summary
print_summary() {
    print_header "Authentication Setup Complete!"

    echo -e "${GREEN}Auth system configured successfully!${NC}\n"

    echo -e "${YELLOW}Files created:${NC}"
    echo -e "  - lib/supabase/server.ts"
    echo -e "  - lib/supabase/client.ts"
    echo -e "  - middleware.ts"
    echo -e "  - contexts/auth-context.tsx"
    echo -e "  - components/auth/protected-route.tsx"
    echo -e "  - components/header/user-dropdown.tsx"
    echo -e "  - app/auth/sign-in/page.tsx"
    echo -e "  - app/auth/sign-up/page.tsx"
    echo -e "  - app/auth/callback/route.ts"
    echo -e "  - supabase/migrations/001_create_profiles.sql\n"

    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "1. Update .env.local with your Supabase credentials"
    echo -e "2. Run the migration in supabase/migrations/001_create_profiles.sql"
    echo -e "3. Add AuthProvider to app/layout.tsx (see instructions above)"
    echo -e "4. Add UserDropdown to your header component"
    echo -e "5. Test authentication flow:\n"
    echo -e "   ${BLUE}npm run dev${NC}"
    echo -e "   Visit: http://localhost:3000/auth/sign-up\n"

    echo -e "${YELLOW}Documentation:${NC}"
    echo -e "  - Auth Integration Workflow: workflows/auth-integration-workflow.md"
    echo -e "  - Supabase Auth Patterns: references/supabase-auth-patterns.md"
    echo -e "  - Auth Templates README: templates/auth/README.md\n"
}

# Main execution
main() {
    print_header "Supabase Auth Setup"

    check_templates
    create_supabase_clients
    copy_middleware
    copy_auth_context
    copy_protected_route
    copy_user_dropdown
    copy_auth_pages
    create_db_schema
    update_root_layout
    check_env_vars

    print_summary
}

# Run main function
main
