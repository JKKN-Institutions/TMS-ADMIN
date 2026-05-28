#!/bin/bash

# validate_structure.sh - Validate Next.js 16 Web Development Skill Structure
# This script validates that all required files and templates exist

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get skill directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

check_file() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    local file="$1"
    local description="$2"

    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $description - Missing: $file"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

check_dir() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    local dir="$1"
    local description="$2"

    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $description"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $description - Missing: $dir"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

# Change to skill directory
cd "$SKILL_DIR"

print_header "Validating Next.js 16 Web Development Skill"

# 1. Root Files
print_header "1. Root Files"
check_file "SKILL.md" "Skill manifest"
check_file "README.md" "Skill README"
check_file "TESTING.md" "Testing guide"

# 2. Module Documentation
print_header "2. Module Documentation"
check_dir "modules/01-frontend" "Frontend module directory"
check_file "modules/01-frontend/README.md" "Frontend module README"
check_file "modules/01-frontend/project-setup.md" "Project setup guide"
check_file "modules/01-frontend/layout-system.md" "Layout system patterns"
check_file "modules/01-frontend/form-patterns.md" "Form patterns"
check_file "modules/01-frontend/data-table-patterns.md" "Data table patterns"
check_file "modules/01-frontend/rbac-navigation.md" "RBAC navigation"
check_file "modules/01-frontend/command-palette.md" "Command palette"
check_file "modules/01-frontend/charts-analytics.md" "Charts & analytics"
check_file "modules/01-frontend/drag-drop-patterns.md" "Drag & drop"
check_file "modules/01-frontend/file-upload-patterns.md" "File upload"
check_file "modules/01-frontend/theme-system.md" "Theme system"

check_dir "modules/02-backend" "Backend module directory"
check_file "modules/02-backend/README.md" "Backend module README"

# 3. Workflow Documentation
print_header "3. Workflow Documentation"
check_dir "workflows" "Workflows directory"
check_file "workflows/complete-workflow.md" "Complete workflow"
check_file "workflows/module-builder-workflow.md" "Module builder workflow"
check_file "workflows/auth-integration-workflow.md" "Auth integration workflow"

# 4. Dashboard Layout Templates
print_header "4. Dashboard Layout Templates"
check_dir "templates/dashboard-layout" "Dashboard layout directory"
check_file "templates/dashboard-layout/app-sidebar.tsx" "AppSidebar component"
check_file "templates/dashboard-layout/header.tsx" "Header component"
check_file "templates/dashboard-layout/page-container.tsx" "PageContainer component"
check_file "templates/dashboard-layout/info-sidebar.tsx" "InfoSidebar component"
check_file "templates/dashboard-layout/layout.tsx" "Layout component"
check_file "templates/dashboard-layout/providers.tsx" "Providers component"
check_file "templates/dashboard-layout/README.md" "Layout README"

# 5. Form Component Templates
print_header "5. Form Component Templates"
check_dir "templates/form-components" "Form components directory"
check_file "templates/form-components/base-form-field-props.ts" "BaseFormFieldProps"
check_file "templates/form-components/form-input.tsx" "FormInput"
check_file "templates/form-components/form-select.tsx" "FormSelect"
check_file "templates/form-components/form-checkbox.tsx" "FormCheckbox"
check_file "templates/form-components/form-radio-group.tsx" "FormRadioGroup"
check_file "templates/form-components/form-date-picker.tsx" "FormDatePicker"
check_file "templates/form-components/form-textarea.tsx" "FormTextarea"
check_file "templates/form-components/form-slider.tsx" "FormSlider"
check_file "templates/form-components/form-switch.tsx" "FormSwitch"
check_file "templates/form-components/form-file-upload.tsx" "FormFileUpload"
check_file "templates/form-components/form-checkbox-group.tsx" "FormCheckboxGroup"
check_file "templates/form-components/form-otp.tsx" "FormOTP"

# 6. Data Table Templates
print_header "6. Data Table Templates"
check_dir "templates/data-table" "Data table directory"
check_file "templates/data-table/use-data-table.ts" "useDataTable hook"
check_file "templates/data-table/data-table.tsx" "DataTable component"
check_file "templates/data-table/data-table-toolbar.tsx" "DataTableToolbar"
check_file "templates/data-table/data-table-pagination.tsx" "DataTablePagination"
check_file "templates/data-table/data-table-column-header.tsx" "DataTableColumnHeader"
check_file "templates/data-table/data-table-faceted-filter.tsx" "DataTableFacetedFilter"
check_file "templates/data-table/data-table-view-options.tsx" "DataTableViewOptions"
check_file "templates/data-table/README.md" "Data table README"

# 7. Auth Templates
print_header "7. Auth Templates"
check_dir "templates/auth" "Auth directory"
check_file "templates/auth/middleware.ts" "Auth middleware"
check_file "templates/auth/auth-context.tsx" "AuthContext"
check_file "templates/auth/protected-route.tsx" "ProtectedRoute"
check_file "templates/auth/user-dropdown.tsx" "UserDropdown"
check_dir "templates/auth/auth-pages" "Auth pages directory"
check_file "templates/auth/auth-pages/sign-in.tsx" "Sign in page"
check_file "templates/auth/auth-pages/sign-up.tsx" "Sign up page"
check_file "templates/auth/README.md" "Auth README"

# 8. Scripts
print_header "8. Automation Scripts"
check_dir "scripts" "Scripts directory"
check_file "scripts/init_dashboard.sh" "Dashboard initialization script"
check_file "scripts/setup_auth.sh" "Auth setup script"
check_file "scripts/generate_module.py" "Module generator script"
check_file "scripts/validate_structure.sh" "Structure validation script"

# 9. Reference Documentation
print_header "9. Reference Documentation"
check_dir "references" "References directory"
check_file "references/supabase-auth-patterns.md" "Supabase Auth patterns"
check_file "references/shadcn-ui-guide.md" "Shadcn UI guide"
check_file "references/tech-stack-reference.md" "Tech stack reference"

# 10. Assets
print_header "10. Assets"
check_dir "assets" "Assets directory"
check_file "assets/shadcn-components-list.md" "Shadcn components list"
check_file "assets/tailwind.config.dashboard.ts" "Tailwind config"

# Summary
print_header "Validation Summary"

echo -e "Total Checks: ${BLUE}$TOTAL_CHECKS${NC}"
echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "\n${GREEN}✓ All checks passed! Skill structure is complete.${NC}\n"
    exit 0
else
    echo -e "\n${RED}✗ Some checks failed. Please review the missing files above.${NC}\n"
    exit 1
fi
