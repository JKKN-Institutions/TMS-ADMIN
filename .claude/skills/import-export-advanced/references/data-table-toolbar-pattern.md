# Data Table Toolbar Pattern

This file provides the complete pattern for integrating Import/Export functionality into data tables.

## File Location

`app/(routes)/.../[entity]/_components/[entity]-data-table.tsx`

## Required Imports

```typescript
'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { EntitySearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import {
  Plus,
  TrashIcon,
  Loader2,
  Upload,
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FileJson
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EntityService } from '@/lib/services/organization/entity-service';
import { Entity } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';
import { useState, useCallback } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ImportDialog } from './import-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import toast from 'react-hot-toast';
```

## Component State

```typescript
export function EntityDataTable({ search }: EntityDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Entity[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Import/Export state
  const [importOpen, setImportOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Permissions
  const canCreate = isSuperAdmin || canAccess('organizations.entities', 'create');
```

## FetchData with useCallback

```typescript
  // IMPORTANT: Wrap fetchData in useCallback to prevent infinite re-renders
  const fetchData = useCallback(async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        // Pass through filter parameters from search prop
        institution_id: search.institution_id,
        degree_id: search.degree_id,
        department_id: search.department_id,
        status: search.status
      };

      const { data, metadata } = await EntityService.getEntities(filters);

      return {
        success: true,
        data: data || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: metadata?.totalPages ?? 0,
          total_items: metadata?.total ?? 0
        }
      };
    } catch (error) {
      console.error('Error fetching entities:', error);
      throw error;
    }
  }, [search.institution_id, search.degree_id, search.department_id, search.status]);
```

## Import/Export Handlers

```typescript
  // Handle import completion - trigger table refresh
  const handleImportComplete = () => {
    setRefreshTrigger(prev => prev + 1);
    router.refresh();
  };

  // Download template
  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/organizations/entities/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `entities-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Template download error:', error);
      toast.error('Failed to download template');
    }
  };

  // Export as Excel
  const handleExportExcel = async () => {
    try {
      const response = await fetch('/api/organizations/entities/export?format=xlsx');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `entities-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Entities exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export entities');
    }
  };

  // Export as CSV
  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/organizations/entities/export?format=csv');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `entities-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Entities exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export entities');
    }
  };

  // Export as JSON
  const handleExportJSON = async () => {
    try {
      const response = await fetch('/api/organizations/entities/export?format=json');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `entities-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Entities exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export entities');
    }
  };
```

## Custom Toolbar Render Function

```typescript
  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreate && (
        <>
          {/* Add New Button */}
          <Button
            onClick={() => router.push('/organizations/entities/new')}
            size='sm'
            className='h-8'
          >
            <Plus className='mr-2 h-4 w-4' />
            Add Entity
          </Button>

          {/* Import Button */}
          <Button
            variant='outline'
            size='sm'
            className='h-8'
            onClick={() => setImportOpen(true)}
          >
            <Upload className='mr-2 h-4 w-4' />
            Import
          </Button>

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm' className='h-8'>
                <Download className='mr-2 h-4 w-4' />
                Export
                <ChevronDown className='ml-2 h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className='mr-2 h-4 w-4' />
                Export as Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileText className='mr-2 h-4 w-4' />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                <FileJson className='mr-2 h-4 w-4' />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadTemplate}>
                <Download className='mr-2 h-4 w-4' />
                Download Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Bulk Delete Button (when rows selected) */}
      {props.selectedRows.length > 0 && (
        <Button
          onClick={() => handleBulkDelete(props.selectedRows as Entity[], props.resetSelection)}
          variant='destructive'
          size='sm'
          className='h-8'
        >
          <TrashIcon className='mr-2 h-4 w-4' />
          Delete Selected ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );
```

## DataTable Component with ImportDialog

```typescript
  return (
    <>
      <DataTable
        key={refreshTrigger}  // Force re-render on refresh
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'entities',
          columnMapping: {},
          columnWidths: [],
          headers: []
        }}
        idField='id'
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,  // Disable built-in export (using custom)
          enableRowSelection: true
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        {/* ... delete dialog content ... */}
      </AlertDialog>

      {/* Import Dialog */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={handleImportComplete}
      />
    </>
  );
}
```

## Key Implementation Notes

### 1. RefreshTrigger Pattern

Using `key={refreshTrigger}` on DataTable forces React to re-mount the component when data changes:

```typescript
const [refreshTrigger, setRefreshTrigger] = useState(0);

const handleImportComplete = () => {
  setRefreshTrigger(prev => prev + 1);  // Increment to trigger re-render
  router.refresh();  // Also refresh server components
};

<DataTable key={refreshTrigger} ... />
```

### 2. useCallback for fetchData

Always wrap `fetchData` in `useCallback` with stable dependencies to prevent infinite re-renders:

```typescript
const fetchData = useCallback(async (params) => {
  // ... fetch logic
}, [search.institution_id, search.degree_id, ...]);  // Only filter values
```

### 3. Disable Built-in Export

When using custom export buttons, disable the built-in export:

```typescript
config={{
  enableExport: false,  // Use custom export dropdown instead
}}
```

### 4. Toolbar Button Order

Recommended order for toolbar buttons:
1. Add New (primary action)
2. Import
3. Export dropdown
4. Delete Selected (only when rows selected)
