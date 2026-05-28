# Theme System

Dark/light mode with next-themes.

## Overview

Production-ready theme system with:
- **Dark/light modes**: Seamless switching
- **System preference**: Auto-detect user preference
- **Persistence**: Save theme choice
- **No flash**: Prevent theme flicker on load
- **Type-safe**: TypeScript support

---

## Installation

```bash
npm install next-themes
```

---

## Setup

### Theme Provider

```tsx
// components/theme-provider.tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ThemeProviderProps } from 'next-themes/dist/types'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

### Add to Layout

```tsx
// app/layout.tsx
import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

---

## Theme Toggle

### Toggle Component

```tsx
// components/theme-toggle.tsx
'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Simple Toggle

```tsx
// components/theme-toggle-simple.tsx
'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ThemeToggleSimple() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
```

---

## CSS Variables

### Define Theme Colors

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

---

## Usage in Components

### Access Current Theme

```tsx
'use client'

import { useTheme } from 'next-themes'

export function Component() {
  const { theme, setTheme, systemTheme } = useTheme()

  return (
    <div>
      <p>Current theme: {theme}</p>
      <p>System theme: {systemTheme}</p>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={() => setTheme('light')}>Light</button>
    </div>
  )
}
```

### Theme-Aware Styling

```tsx
export function Card() {
  return (
    <div className="bg-card text-card-foreground border border-border rounded-lg p-4">
      <h3 className="text-foreground">Card Title</h3>
      <p className="text-muted-foreground">Card description</p>
    </div>
  )
}
```

---

## Advanced Usage

### Multiple Themes

```tsx
// Support more than 2 themes
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  themes={['light', 'dark', 'blue', 'rose']}
>
  {children}
</ThemeProvider>
```

### Storage Key

```tsx
// Custom storage key
<ThemeProvider storageKey="my-app-theme">
  {children}
</ThemeProvider>
```

### Force Theme

```tsx
// Force a specific section to always be dark
<div className="dark">
  <Component /> {/* Always dark, regardless of global theme */}
</div>
```

---

## Best Practices

1. **Use CSS variables**: Theme-aware colors with `hsl(var(--primary))`
2. **Prevent flash**: Add `suppressHydrationWarning` to `<html>`
3. **System preference**: Enable `enableSystem` for auto-detection
4. **Disable transitions**: Set `disableTransitionOnChange` to avoid animation flicker
5. **Semantic colors**: Use `foreground`, `muted-foreground` instead of hardcoded colors

---

## Troubleshooting

### Theme Flash on Load

Add `suppressHydrationWarning` to html tag:

```tsx
<html lang="en" suppressHydrationWarning>
```

### Theme Not Persisting

Check that `attribute="class"` matches your CSS:

```tsx
<ThemeProvider attribute="class">
```

### Colors Not Updating

Ensure colors use CSS variables:

```tsx
// ✅ Good
className="bg-background text-foreground"

// ❌ Bad
className="bg-white text-black"
```

---

**Version**: 3.0.0
**Updated**: January 2026
