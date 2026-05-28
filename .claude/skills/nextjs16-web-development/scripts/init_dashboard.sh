#!/bin/bash

# init_dashboard.sh - Initialize Next.js 16 Dashboard
# This script sets up a complete Next.js 16 admin dashboard with all dependencies

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

# Check if Node.js is installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js 18+ is required. Current version: $(node -v)"
        exit 1
    fi

    print_success "Node.js $(node -v) detected"
}

# Detect package manager
detect_package_manager() {
    if [ -f "package-lock.json" ]; then
        PM="npm"
        PM_INSTALL="npm install"
        PM_RUN="npm run"
    elif [ -f "pnpm-lock.yaml" ]; then
        PM="pnpm"
        PM_INSTALL="pnpm install"
        PM_RUN="pnpm"
    elif [ -f "yarn.lock" ]; then
        PM="yarn"
        PM_INSTALL="yarn"
        PM_RUN="yarn"
    elif [ -f "bun.lockb" ]; then
        PM="bun"
        PM_INSTALL="bun install"
        PM_RUN="bun run"
    else
        # Default to npm if no lock file exists
        PM="npm"
        PM_INSTALL="npm install"
        PM_RUN="npm run"
    fi

    print_info "Using package manager: $PM"
}

# Install core dependencies
install_core() {
    print_header "Installing Core Framework"

    $PM_INSTALL next@16 react@19.2 react-dom@19.2

    print_success "Core framework installed"
}

# Install TypeScript
install_typescript() {
    print_header "Installing TypeScript"

    $PM_INSTALL -D typescript @types/node@22 @types/react@19 @types/react-dom@19

    print_success "TypeScript installed"
}

# Install Tailwind CSS 4
install_tailwind() {
    print_header "Installing Tailwind CSS 4"

    $PM_INSTALL tailwindcss@4 tailwindcss-animate autoprefixer postcss

    print_success "Tailwind CSS 4 installed"
}

# Install Shadcn UI prerequisites
install_shadcn_deps() {
    print_header "Installing Shadcn UI Dependencies"

    $PM_INSTALL @radix-ui/react-accordion @radix-ui/react-alert-dialog \
        @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-dialog \
        @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-popover \
        @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider \
        @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toast \
        @radix-ui/react-tooltip @radix-ui/react-slot @radix-ui/react-scroll-area \
        @radix-ui/react-radio-group @radix-ui/react-collapsible

    print_success "Shadcn UI dependencies installed"
}

# Install icons
install_icons() {
    print_header "Installing Icon Libraries"

    $PM_INSTALL lucide-react @tabler/icons-react

    print_success "Icon libraries installed"
}

# Install forms and validation
install_forms() {
    print_header "Installing Form Libraries"

    $PM_INSTALL react-hook-form @hookform/resolvers zod@4 date-fns react-day-picker input-otp

    print_success "Form libraries installed"
}

# Install data tables
install_tables() {
    print_header "Installing Data Table Libraries"

    $PM_INSTALL @tanstack/react-table nuqs

    print_success "Data table libraries installed"
}

# Install authentication
install_auth() {
    print_header "Installing Authentication"

    $PM_INSTALL @supabase/supabase-js @supabase/ssr

    print_success "Authentication libraries installed"
}

# Install utilities
install_utils() {
    print_header "Installing Utilities"

    $PM_INSTALL clsx tailwind-merge class-variance-authority next-themes zustand motion

    print_success "Utilities installed"
}

# Install dev tools
install_dev_tools() {
    print_header "Installing Development Tools"

    $PM_INSTALL -D eslint eslint-config-next prettier prettier-plugin-tailwindcss \
        husky lint-staged

    print_success "Development tools installed"
}

# Initialize Shadcn UI
init_shadcn() {
    print_header "Initializing Shadcn UI"

    # Check if components.json exists
    if [ ! -f "components.json" ]; then
        print_info "Running shadcn init..."
        npx shadcn@latest init -y
        print_success "Shadcn UI initialized"
    else
        print_info "Shadcn UI already initialized (components.json exists)"
    fi
}

# Add core Shadcn components
add_shadcn_components() {
    print_header "Adding Shadcn UI Components"

    print_info "Adding form components..."
    npx shadcn@latest add input label textarea select checkbox radio-group switch slider -y

    print_info "Adding navigation components..."
    npx shadcn@latest add dropdown-menu tabs breadcrumb -y

    print_info "Adding feedback components..."
    npx shadcn@latest add toast dialog alert-dialog -y

    print_info "Adding data display components..."
    npx shadcn@latest add table card avatar badge skeleton -y

    print_info "Adding overlay components..."
    npx shadcn@latest add popover tooltip sheet -y

    print_info "Adding utility components..."
    npx shadcn@latest add accordion separator scroll-area calendar command -y

    print_info "Adding button..."
    npx shadcn@latest add button -y

    print_success "Shadcn UI components added"
}

# Create folder structure
create_folders() {
    print_header "Creating Folder Structure"

    mkdir -p app/{actions,api}
    mkdir -p components/{forms,layout,header,data-table}
    mkdir -p lib/{data,supabase,auth}
    mkdir -p hooks
    mkdir -p types
    mkdir -p config

    print_success "Folder structure created"
}

# Create next.config.ts
create_next_config() {
    print_header "Creating next.config.ts"

    cat > next.config.ts << 'EOF'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Cache Components (stable in Next.js 16)
    cacheComponents: true,

    // Use Turbopack in development
    turbo: {},
  },

  // Strict mode for better error catching
  reactStrictMode: true,
}

export default nextConfig
EOF

    print_success "next.config.ts created"
}

# Create tsconfig.json
create_tsconfig() {
    print_header "Creating tsconfig.json"

    if [ ! -f "tsconfig.json" ]; then
        cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF
        print_success "tsconfig.json created"
    else
        print_info "tsconfig.json already exists"
    fi
}

# Create lib/utils.ts
create_utils() {
    print_header "Creating lib/utils.ts"

    mkdir -p lib
    cat > lib/utils.ts << 'EOF'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
EOF

    print_success "lib/utils.ts created"
}

# Create .env.local template
create_env_template() {
    print_header "Creating .env.local Template"

    if [ ! -f ".env.local" ]; then
        cat > .env.local << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Sentry (optional)
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_AUTH_TOKEN=
EOF
        print_success ".env.local template created"
        print_info "Remember to update .env.local with your actual credentials"
    else
        print_info ".env.local already exists"
    fi
}

# Update package.json scripts
update_scripts() {
    print_header "Updating package.json Scripts"

    # Use Node.js to update package.json
    node << 'EOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.scripts = pkg.scripts || {};
pkg.scripts.dev = 'next dev --turbopack';
pkg.scripts.build = 'next build';
pkg.scripts.start = 'next start';
pkg.scripts.lint = 'next lint';
pkg.scripts.format = 'prettier --write .';
pkg.scripts['type-check'] = 'tsc --noEmit';
pkg.scripts.prepare = 'husky';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
EOF

    print_success "package.json scripts updated"
}

# Setup Husky
setup_husky() {
    print_header "Setting up Husky"

    if [ "$PM" = "npm" ]; then
        npm pkg set scripts.prepare="husky"
        npm run prepare
    fi

    # Create pre-commit hook
    if [ -d ".husky" ]; then
        cat > .husky/pre-commit << 'EOF'
npx lint-staged
EOF
        chmod +x .husky/pre-commit
        print_success "Husky pre-commit hook created"
    fi

    # Create lint-staged config
    node << 'EOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg['lint-staged'] = {
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
  '*.{json,md}': ['prettier --write']
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
EOF

    print_success "Lint-staged configured"
}

# Print summary
print_summary() {
    print_header "Installation Complete!"

    echo -e "${GREEN}Dashboard initialized successfully!${NC}\n"

    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "1. Update .env.local with your Supabase credentials"
    echo -e "2. Run setup_auth.sh to configure authentication"
    echo -e "3. Copy dashboard layout templates from templates/dashboard-layout/"
    echo -e "4. Copy form components from templates/form-components/"
    echo -e "5. Start development: ${BLUE}$PM_RUN dev${NC}\n"

    echo -e "${YELLOW}Installed dependencies:${NC}"
    echo -e "  - Next.js 16 with React 19.2"
    echo -e "  - TypeScript 5.7"
    echo -e "  - Tailwind CSS 4"
    echo -e "  - Shadcn UI (45+ components)"
    echo -e "  - React Hook Form + Zod"
    echo -e "  - TanStack Table + Nuqs"
    echo -e "  - Supabase Auth"
    echo -e "  - Development tools (ESLint, Prettier, Husky)\n"

    echo -e "${YELLOW}Useful commands:${NC}"
    echo -e "  ${BLUE}$PM_RUN dev${NC}          - Start development server"
    echo -e "  ${BLUE}$PM_RUN build${NC}        - Build for production"
    echo -e "  ${BLUE}$PM_RUN lint${NC}         - Run ESLint"
    echo -e "  ${BLUE}$PM_RUN format${NC}       - Format code with Prettier"
    echo -e "  ${BLUE}$PM_RUN type-check${NC}   - Check TypeScript types\n"
}

# Main execution
main() {
    print_header "Next.js 16 Dashboard Initialization"

    check_node
    detect_package_manager

    # Install dependencies
    install_core
    install_typescript
    install_tailwind
    install_shadcn_deps
    install_icons
    install_forms
    install_tables
    install_auth
    install_utils
    install_dev_tools

    # Setup project
    init_shadcn
    add_shadcn_components
    create_folders
    create_next_config
    create_tsconfig
    create_utils
    create_env_template
    update_scripts
    setup_husky

    print_summary
}

# Run main function
main
