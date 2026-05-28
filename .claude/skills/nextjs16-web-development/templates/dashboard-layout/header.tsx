'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Breadcrumbs } from './breadcrumbs'
import { UserDropdown } from '@/components/header/user-dropdown'
import { ThemeToggle } from '@/components/theme-toggle'

export function Header() {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      {/* Breadcrumbs */}
      <div className="flex-1">
        <Breadcrumbs />
      </div>

      {/* Search */}
      <div className="relative w-full max-w-sm hidden md:block">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search..."
          className="w-full pl-8"
        />
      </div>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* User dropdown */}
      <UserDropdown />
    </header>
  )
}
