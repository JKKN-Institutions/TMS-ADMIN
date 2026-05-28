'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useFilteredNav } from '@/hooks/use-filtered-nav'
import type { NavItem } from '@/config/nav-config'

export function AppSidebar() {
  const pathname = usePathname()
  const { mainNav } = useFilteredNav()
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Load collapse state from cookie
  useEffect(() => {
    const collapsed = document.cookie
      .split('; ')
      .find((row) => row.startsWith('sidebar-collapsed='))
      ?.split('=')[1]

    setIsCollapsed(collapsed === 'true')
  }, [])

  // Save collapse state to cookie
  const toggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    document.cookie = `sidebar-collapsed=${newState}; path=/; max-age=31536000`
  }

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r bg-background transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4">
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-xl font-bold">Dashboard</span>
          </Link>
        )}
        {isCollapsed && (
          <Link href="/dashboard" className="flex items-center justify-center w-full">
            <span className="text-xl font-bold">D</span>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {mainNav.map((item) => (
          <NavItemComponent
            key={item.href}
            item={item}
            pathname={pathname}
            isCollapsed={isCollapsed}
          />
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCollapse}
          className="w-full justify-center"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Collapse
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}

interface NavItemComponentProps {
  item: NavItem
  pathname: string
  isCollapsed: boolean
  level?: number
}

function NavItemComponent({
  item,
  pathname,
  isCollapsed,
  level = 0,
}: NavItemComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const hasChildren = item.items && item.items.length > 0

  const NavContent = (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-accent hover:text-accent-foreground',
        level > 0 && 'ml-4'
      )}
      onClick={(e) => {
        if (hasChildren && !isCollapsed) {
          e.preventDefault()
          setIsExpanded(!isExpanded)
        }
      }}
    >
      {item.icon && <span className="h-5 w-5 flex-shrink-0">{item.icon}</span>}
      {!isCollapsed && <span className="flex-1">{item.title}</span>}
      {!isCollapsed && hasChildren && (
        <ChevronRight
          className={cn(
            'h-4 w-4 transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      )}
    </Link>
  )

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{NavContent}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{item.title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div>
      {NavContent}
      {hasChildren && isExpanded && !isCollapsed && (
        <div className="mt-1 space-y-1">
          {item.items!.map((subItem) => (
            <NavItemComponent
              key={subItem.href}
              item={subItem}
              pathname={pathname}
              isCollapsed={isCollapsed}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
