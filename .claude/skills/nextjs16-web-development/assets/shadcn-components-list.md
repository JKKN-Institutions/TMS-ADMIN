# Shadcn UI Components List

Complete list of all 45+ Shadcn UI components available for Next.js 16 dashboards.

## Installation Quick Reference

```bash
# Install individual component
npx shadcn@latest add button

# Install multiple components
npx shadcn@latest add button input label

# Install with auto-confirm
npx shadcn@latest add button -y

# Update existing component
npx shadcn@latest add button --overwrite
```

---

## Form Components (12)

### Input
```bash
npx shadcn@latest add input
```
**Usage**: Text input, email, password, number fields
**Variants**: Default, file, with icons
**Common Props**: type, placeholder, disabled, required

### Label
```bash
npx shadcn@latest add label
```
**Usage**: Form field labels with accessibility
**Features**: htmlFor binding, required indicator
**Accessibility**: Automatic ARIA labels

### Textarea
```bash
npx shadcn@latest add textarea
```
**Usage**: Multi-line text input
**Features**: Auto-resize, character count
**Common Props**: rows, maxLength, placeholder

### Select
```bash
npx shadcn@latest add select
```
**Usage**: Dropdown selection
**Features**: Search, multi-select, groups
**Built on**: @radix-ui/react-select

### Checkbox
```bash
npx shadcn@latest add checkbox
```
**Usage**: Boolean selections, checkbox groups
**States**: Checked, unchecked, indeterminate
**Built on**: @radix-ui/react-checkbox

### Radio Group
```bash
npx shadcn@latest add radio-group
```
**Usage**: Single selection from options
**Features**: Horizontal/vertical layout
**Built on**: @radix-ui/react-radio-group

### Switch
```bash
npx shadcn@latest add switch
```
**Usage**: Toggle on/off states
**Features**: Disabled state, labels
**Built on**: @radix-ui/react-switch

### Slider
```bash
npx shadcn@latest add slider
```
**Usage**: Range selection, volume controls
**Features**: Min/max, step, multiple thumbs
**Built on**: @radix-ui/react-slider

### Calendar
```bash
npx shadcn@latest add calendar
```
**Usage**: Date picker, date ranges
**Features**: Multiple months, disabled dates
**Built on**: react-day-picker

### Date Picker
```bash
npx shadcn@latest add date-picker
```
**Usage**: Calendar with popover
**Features**: Range selection, presets
**Requires**: calendar, popover, button

### Form
```bash
npx shadcn@latest add form
```
**Usage**: Form wrapper with validation
**Features**: React Hook Form integration
**Requires**: label, button, input

### Input OTP
```bash
npx shadcn@latest add input-otp
```
**Usage**: One-time password input
**Features**: Pattern validation, auto-focus
**Built on**: input-otp

---

## Button Components (1)

### Button
```bash
npx shadcn@latest add button
```
**Variants**: default, destructive, outline, secondary, ghost, link
**Sizes**: default, sm, lg, icon
**Built on**: @radix-ui/react-slot

**Example**:
```tsx
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button size="icon"><Icon /></Button>
```

---

## Navigation Components (4)

### Dropdown Menu
```bash
npx shadcn@latest add dropdown-menu
```
**Usage**: User menus, action menus
**Features**: Nested items, separators, checkboxes
**Built on**: @radix-ui/react-dropdown-menu

**Components**:
- DropdownMenu
- DropdownMenuTrigger
- DropdownMenuContent
- DropdownMenuItem
- DropdownMenuCheckboxItem
- DropdownMenuRadioGroup
- DropdownMenuLabel
- DropdownMenuSeparator
- DropdownMenuShortcut
- DropdownMenuGroup
- DropdownMenuSub

### Navigation Menu
```bash
npx shadcn@latest add navigation-menu
```
**Usage**: Site navigation, mega menus
**Features**: Indicators, nested menus
**Built on**: @radix-ui/react-navigation-menu

### Tabs
```bash
npx shadcn@latest add tabs
```
**Usage**: Content organization, settings
**Features**: Controlled/uncontrolled, keyboard nav
**Built on**: @radix-ui/react-tabs

### Breadcrumb
```bash
npx shadcn@latest add breadcrumb
```
**Usage**: Navigation hierarchy
**Features**: Separators, ellipsis, links
**Accessibility**: ARIA breadcrumb

---

## Feedback Components (5)

### Alert
```bash
npx shadcn@latest add alert
```
**Variants**: default, destructive
**Usage**: Information, warnings, errors
**Components**: Alert, AlertTitle, AlertDescription

### Toast
```bash
npx shadcn@latest add toast
```
**Usage**: Notifications, confirmations
**Features**: Auto-dismiss, actions, queue
**Built on**: @radix-ui/react-toast

**Hook**: `useToast()`

### Dialog
```bash
npx shadcn@latest add dialog
```
**Usage**: Modals, confirmations
**Features**: Overlay, close button, keyboard
**Built on**: @radix-ui/react-dialog

**Components**:
- Dialog
- DialogTrigger
- DialogContent
- DialogHeader
- DialogFooter
- DialogTitle
- DialogDescription

### Alert Dialog
```bash
npx shadcn@latest add alert-dialog
```
**Usage**: Destructive actions, confirmations
**Features**: Cancel/action buttons
**Built on**: @radix-ui/react-alert-dialog

### Progress
```bash
npx shadcn@latest add progress
```
**Usage**: Loading states, uploads
**Features**: Indeterminate mode
**Built on**: @radix-ui/react-progress

---

## Data Display Components (7)

### Table
```bash
npx shadcn@latest add table
```
**Usage**: Data tables, lists
**Components**: Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter, TableCaption

### Card
```bash
npx shadcn@latest add card
```
**Usage**: Content containers
**Components**: Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent

**Example**:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

### Avatar
```bash
npx shadcn@latest add avatar
```
**Usage**: User profiles, images
**Features**: Fallback initials
**Built on**: @radix-ui/react-avatar

### Badge
```bash
npx shadcn@latest add badge
```
**Variants**: default, secondary, destructive, outline
**Usage**: Status indicators, labels

### Skeleton
```bash
npx shadcn@latest add skeleton
```
**Usage**: Loading placeholders
**Features**: Shimmer animation

### Aspect Ratio
```bash
npx shadcn@latest add aspect-ratio
```
**Usage**: Image/video containers
**Ratios**: 16/9, 4/3, 1/1, custom
**Built on**: @radix-ui/react-aspect-ratio

### Carousel
```bash
npx shadcn@latest add carousel
```
**Usage**: Image galleries, content sliders
**Features**: Auto-play, navigation
**Built on**: embla-carousel-react

---

## Overlay Components (6)

### Popover
```bash
npx shadcn@latest add popover
```
**Usage**: Context menus, tooltips
**Features**: Positioning, arrow
**Built on**: @radix-ui/react-popover

### Tooltip
```bash
npx shadcn@latest add tooltip
```
**Usage**: Hints, descriptions
**Features**: Delay, positioning
**Built on**: @radix-ui/react-tooltip

### Hover Card
```bash
npx shadcn@latest add hover-card
```
**Usage**: Rich previews on hover
**Features**: Delay, positioning
**Built on**: @radix-ui/react-hover-card

### Sheet
```bash
npx shadcn@latest add sheet
```
**Usage**: Slide-out panels, mobile menus
**Sides**: top, right, bottom, left
**Built on**: @radix-ui/react-dialog

### Context Menu
```bash
npx shadcn@latest add context-menu
```
**Usage**: Right-click menus
**Features**: Nested items, shortcuts
**Built on**: @radix-ui/react-context-menu

### Menubar
```bash
npx shadcn@latest add menubar
```
**Usage**: Application menu bars
**Features**: Nested menus, shortcuts
**Built on**: @radix-ui/react-menubar

---

## Utility Components (10)

### Accordion
```bash
npx shadcn@latest add accordion
```
**Usage**: FAQs, collapsible sections
**Types**: Single, multiple
**Built on**: @radix-ui/react-accordion

### Separator
```bash
npx shadcn@latest add separator
```
**Usage**: Visual dividers
**Orientations**: horizontal, vertical
**Built on**: @radix-ui/react-separator

### Scroll Area
```bash
npx shadcn@latest add scroll-area
```
**Usage**: Custom scrollbars
**Features**: Horizontal/vertical
**Built on**: @radix-ui/react-scroll-area

### Collapsible
```bash
npx shadcn@latest add collapsible
```
**Usage**: Expandable content
**Features**: Controlled state
**Built on**: @radix-ui/react-collapsible

### Command
```bash
npx shadcn@latest add command
```
**Usage**: Command palettes, search
**Features**: Keyboard nav, filtering
**Built on**: cmdk

### Toggle
```bash
npx shadcn@latest add toggle
```
**Usage**: On/off states
**Variants**: default, outline
**Built on**: @radix-ui/react-toggle

### Toggle Group
```bash
npx shadcn@latest add toggle-group
```
**Usage**: Multiple toggles
**Types**: Single, multiple
**Built on**: @radix-ui/react-toggle-group

### Resizable
```bash
npx shadcn@latest add resizable
```
**Usage**: Split panes, resize panels
**Features**: Horizontal/vertical
**Built on**: react-resizable-panels

### Sonner
```bash
npx shadcn@latest add sonner
```
**Usage**: Toast notifications
**Features**: Stacking, positioning
**Built on**: sonner

### Drawer
```bash
npx shadcn@latest add drawer
```
**Usage**: Mobile-friendly bottom sheets
**Features**: Swipe gestures
**Built on**: vaul

---

## Chart Components (1)

### Chart
```bash
npx shadcn@latest add chart
```
**Usage**: Data visualizations
**Types**: Area, Bar, Line, Pie
**Built on**: Recharts

**Sub-components**:
- ChartContainer
- ChartTooltip
- ChartTooltipContent
- ChartLegend
- ChartLegendContent

---

## Component Dependencies

Some components require other components to work:

### Date Picker
Requires: `calendar`, `popover`, `button`
```bash
npx shadcn@latest add calendar popover button
npx shadcn@latest add date-picker
```

### Form
Requires: `label`, `button`, `input`
```bash
npx shadcn@latest add label button input
npx shadcn@latest add form
```

### Command
Works well with: `dialog`
```bash
npx shadcn@latest add dialog
npx shadcn@latest add command
```

### Data Table (Custom)
Requires: `table`, `button`, `dropdown-menu`, `input`, `select`
```bash
npx shadcn@latest add table button dropdown-menu input select
# Then copy custom data-table components from templates/
```

---

## Installation Strategies

### Minimal Dashboard Setup
```bash
npx shadcn@latest add button input label card table
```
Total: 5 components

### Complete Form Setup
```bash
npx shadcn@latest add input label textarea select checkbox \
  radio-group switch slider calendar date-picker form
```
Total: 11 components

### Full Dashboard Setup
```bash
npx shadcn@latest add button input label textarea select \
  checkbox radio-group switch slider calendar form \
  table card avatar badge skeleton \
  dropdown-menu tabs breadcrumb \
  dialog alert-dialog toast \
  popover tooltip sheet \
  accordion separator scroll-area
```
Total: 28 components

### Complete Installation (All 45+)
Run the `init_dashboard.sh` script which automatically installs all components.

---

## Component Categories Summary

| Category | Count | Key Components |
|----------|-------|----------------|
| Form Components | 12 | Input, Select, Checkbox, Calendar |
| Button Components | 1 | Button (6 variants) |
| Navigation Components | 4 | Dropdown Menu, Tabs, Breadcrumb |
| Feedback Components | 5 | Alert, Toast, Dialog |
| Data Display Components | 7 | Table, Card, Avatar, Badge |
| Overlay Components | 6 | Popover, Tooltip, Sheet |
| Utility Components | 10 | Accordion, Command, Scroll Area |
| Chart Components | 1 | Chart (4 types) |

**Total**: 45+ components

---

## Updating Components

### Check for Updates
```bash
npx shadcn@latest diff
```

### Update Single Component
```bash
npx shadcn@latest add button --overwrite
```

### Update All Components
```bash
npx shadcn@latest add --all --overwrite
```

---

## See Also

- [Shadcn UI Guide](../references/shadcn-ui-guide.md)
- [Form Patterns](../modules/01-frontend/form-patterns.md)
- [Data Table Patterns](../modules/01-frontend/data-table-patterns.md)
- [Official Shadcn UI Docs](https://ui.shadcn.com)
