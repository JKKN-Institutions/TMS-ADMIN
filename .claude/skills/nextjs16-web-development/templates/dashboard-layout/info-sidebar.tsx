'use client'

import { useState } from 'react'
import { X, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface InfoSidebarProps {
  title: string
  children: React.ReactNode
  className?: string
}

export function InfoSidebar({ title, children, className }: InfoSidebarProps) {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50 shadow-lg"
        aria-label="Show info sidebar"
      >
        <Info className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <aside
      className={cn(
        'sticky top-20 h-fit rounded-lg border bg-card p-4 shadow-sm',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-primary flex-shrink-0" />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsVisible(false)}
          className="h-6 w-6 flex-shrink-0"
          aria-label="Hide info sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">
        {children}
      </div>
    </aside>
  )
}
