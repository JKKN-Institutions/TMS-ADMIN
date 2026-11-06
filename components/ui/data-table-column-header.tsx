'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            // MyJKKN sort trigger: ghost h-8 button; -ml-3 cancels its px-3 so the
            // title lines up with the cell text below.
            '-ml-3 inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-gray-100 hover:text-gray-900 data-[state=open]:bg-gray-100 dark:data-[state=open]:bg-[#262a35] focus:outline-none',
            className
          )}
        >
          <span>{title}</span>
          {sorted === 'desc' ? (
            <ArrowDown className="h-4 w-4" />
          ) : sorted === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-60" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => column.toggleSorting(false)}>
          <ArrowUp className="text-gray-500" /> Asc
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => column.toggleSorting(true)}>
          <ArrowDown className="text-gray-500" /> Desc
        </DropdownMenuItem>
        {column.getCanHide() && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => column.toggleVisibility(false)}>
              <EyeOff className="text-gray-500" /> Hide
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
