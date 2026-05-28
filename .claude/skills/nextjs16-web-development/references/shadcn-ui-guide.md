# Shadcn UI Guide

Complete guide to using Shadcn UI components in Next.js 16 dashboard applications.

## Table of Contents

1. [What is Shadcn UI](#what-is-shadcn-ui)
2. [Installation](#installation)
3. [Core Components](#core-components)
4. [Component Patterns](#component-patterns)
5. [Customization](#customization)
6. [Best Practices](#best-practices)

---

## What is Shadcn UI

Shadcn UI is **NOT** a component library. It's a collection of reusable components that you can copy and paste into your apps.

### Key Differences from Traditional Libraries

| Traditional Library | Shadcn UI |
|---------------------|-----------|
| Install via npm | Copy/paste code |
| Update via npm | Update manually |
| Locked to library's design | Full code ownership |
| Bundle size increases | Only what you use |
| Black box components | Transparent source |

### Architecture

```
Shadcn UI Components
├── Built on Radix UI (headless primitives)
├── Styled with Tailwind CSS
├── Typed with TypeScript
└── Accessible by default (ARIA compliant)
```

---

## Installation

### 1. Install CLI

```bash
npx shadcn@latest init
```

This creates:
- `components/ui/` - Component directory
- `lib/utils.ts` - Utility functions
- `tailwind.config.ts` - Tailwind configuration
- `components.json` - Shadcn configuration

### 2. Install Components

```bash
# Individual components
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add dropdown-menu

# Multiple at once
npx shadcn@latest add button input label select
```

### 3. Configuration

`components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

---

## Core Components

### Form Components

```bash
npx shadcn@latest add input label textarea select checkbox radio-group switch slider
```

**Usage Example**:

```tsx
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="name@example.com" />
</div>
```

### Navigation Components

```bash
npx shadcn@latest add dropdown-menu navigation-menu tabs breadcrumb
```

**Dropdown Menu Example**:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

<DropdownMenu>
  <DropdownMenuTrigger>Open</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Profile</DropdownMenuItem>
    <DropdownMenuItem>Settings</DropdownMenuItem>
    <DropdownMenuItem>Logout</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Feedback Components

```bash
npx shadcn@latest add alert toast dialog alert-dialog
```

**Toast Example**:

```tsx
import { useToast } from '@/hooks/use-toast'

function MyComponent() {
  const { toast } = useToast()

  return (
    <button onClick={() => {
      toast({
        title: 'Success!',
        description: 'Your changes have been saved.',
      })
    }}>
      Save
    </button>
  )
}
```

### Data Display

```bash
npx shadcn@latest add table card avatar badge skeleton
```

**Card Example**:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Total Revenue</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-2xl font-bold">$45,231.89</p>
  </CardContent>
</Card>
```

### Overlay Components

```bash
npx shadcn@latest add dialog sheet popover tooltip
```

**Dialog Example**:

```tsx
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'

<Dialog>
  <DialogTrigger>Open Dialog</DialogTrigger>
  <DialogContent>
    <h2>Dialog Title</h2>
    <p>Dialog content goes here</p>
  </DialogContent>
</Dialog>
```

---

## Component Patterns

### Pattern 1: Controlled Components

```tsx
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'

export function ControlledInput() {
  const [value, setValue] = useState('')

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  )
}
```

### Pattern 2: Form Integration

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email(),
})

export function FormExample() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  return (
    <form onSubmit={handleSubmit((data) => console.log(data))}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
    </form>
  )
}
```

### Pattern 3: Composition

```tsx
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Create Account</CardTitle>
    <CardDescription>Enter your details below</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Form fields */}
  </CardContent>
  <CardFooter>
    <Button>Submit</Button>
  </CardFooter>
</Card>
```

### Pattern 4: Variants

```tsx
import { Button } from '@/components/ui/button'

// Different variants
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Different sizes
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>
```

---

## Customization

### Modify Component Styles

Since you own the code, directly edit component files:

```tsx
// components/ui/button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground",
        // Add custom variant
        custom: "bg-purple-500 text-white hover:bg-purple-600",
      },
    },
  }
)
```

### Theme Customization

Edit `app/globals.css`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    /* Add custom colors */
    --success: 142 76% 36%;
    --warning: 38 92% 50%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    /* Dark mode custom colors */
    --success: 142 71% 45%;
    --warning: 48 96% 53%;
  }
}
```

### Extend with Custom Components

```tsx
// components/ui/custom-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Badge } from './badge'

interface CustomCardProps {
  title: string
  badge?: string
  children: React.ReactNode
}

export function CustomCard({ title, badge, children }: CustomCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {badge && <Badge>{badge}</Badge>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
```

---

## Best Practices

### 1. Use the `cn()` Utility

Always use `cn()` for conditional classes:

```tsx
import { cn } from '@/lib/utils'

<Button className={cn(
  'w-full',
  isLoading && 'opacity-50 cursor-not-allowed',
  variant === 'danger' && 'bg-red-500'
)}>
  Submit
</Button>
```

### 2. Maintain Accessibility

Shadcn components are accessible by default. Keep it that way:

```tsx
// ✅ Good - maintains accessibility
<Label htmlFor="email">Email</Label>
<Input id="email" aria-describedby="email-error" />
{error && <p id="email-error">{error}</p>}

// ❌ Bad - loses accessibility
<div>Email</div>
<Input />
{error && <p>{error}</p>}
```

### 3. Composition Over Prop Drilling

```tsx
// ✅ Good - composition
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>

// ❌ Bad - prop drilling
<Card
  title="Title"
  content="Content"
  showHeader={true}
  headerClassName="..."
  contentClassName="..."
/>
```

### 4. Create Wrapper Components

For repeated patterns, create wrappers:

```tsx
// components/stat-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  change?: string
}

export function StatCard({ title, value, icon, change }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change && (
          <p className="text-xs text-muted-foreground">{change}</p>
        )}
      </CardContent>
    </Card>
  )
}
```

### 5. Keep Components Updated

Shadcn evolves. Stay updated:

```bash
# Check for updates
npx shadcn@latest diff

# Update specific component
npx shadcn@latest add button --overwrite

# Update all components
npx shadcn@latest add --all --overwrite
```

---

## Common Component Combinations

### Form with Validation

```tsx
<form>
  <div className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="name">Name</Label>
      <Input id="name" />
    </div>

    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" />
    </div>

    <div className="space-y-2">
      <Label htmlFor="message">Message</Label>
      <Textarea id="message" />
    </div>

    <Button type="submit">Submit</Button>
  </div>
</form>
```

### Data Table

```tsx
<Card>
  <CardHeader>
    <CardTitle>Recent Orders</CardTitle>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>{order.id}</TableCell>
            <TableCell>{order.customer}</TableCell>
            <TableCell>${order.amount}</TableCell>
            <TableCell>
              <Badge>{order.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

### Settings Panel

```tsx
<Card>
  <CardHeader>
    <CardTitle>Settings</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <Label>Email Notifications</Label>
        <p className="text-sm text-muted-foreground">
          Receive emails about your account activity
        </p>
      </div>
      <Switch />
    </div>

    <Separator />

    <div className="flex items-center justify-between">
      <div>
        <Label>Dark Mode</Label>
        <p className="text-sm text-muted-foreground">
          Toggle dark mode theme
        </p>
      </div>
      <Switch />
    </div>
  </CardContent>
</Card>
```

---

## Component Reference

### All Available Components

```bash
# Layout
npx shadcn@latest add aspect-ratio separator

# Form
npx shadcn@latest add input label textarea select checkbox radio-group switch slider

# Button
npx shadcn@latest add button

# Data Display
npx shadcn@latest add table card avatar badge skeleton

# Feedback
npx shadcn@latest add alert toast dialog alert-dialog

# Navigation
npx shadcn@latest add dropdown-menu navigation-menu tabs breadcrumb

# Overlay
npx shadcn@latest add dialog sheet popover tooltip hover-card

# Utilities
npx shadcn@latest add accordion collapsible calendar command scroll-area
```

---

## Troubleshooting

### Issue: Component not found

```bash
# Re-add the component
npx shadcn@latest add button
```

### Issue: Styles not applying

Check:
1. Tailwind config includes component paths
2. `globals.css` imports Shadcn styles
3. CSS variables are defined

### Issue: TypeScript errors

```bash
# Regenerate types
npx shadcn@latest add button --overwrite
```

---

## See Also

- [Tech Stack Reference](./tech-stack-reference.md)
- [Form Patterns](../modules/01-frontend/form-patterns.md)
- [Data Table Patterns](../modules/01-frontend/data-table-patterns.md)
- [Official Shadcn UI Docs](https://ui.shadcn.com)
