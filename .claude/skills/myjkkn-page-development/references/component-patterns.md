# MyJKKN Component & Service Patterns Reference

Complete code templates for every component and service type in the MyJKKN project. Use these as starting points when creating new modules.

## Service Layer Template

```typescript
// lib/services/[module-group]/[entity]-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import type { Entity, CreateEntityDto, UpdateEntityDto, EntityFilters, EntityListResponse } from '@/types/[module]';

export class EntityService {
  private static supabase = createClientSupabaseClient();

  // Multi-tenant access control (dynamic import to avoid circular deps)
  private static async getUserAccessibleInstitutionIds(userId: string): Promise<string[]> {
    const { UserInstitutionAccessService } = await import(
      '@/lib/services/users/user-institution-access-service'
    );
    return await UserInstitutionAccessService.getUserAccessibleInstitutionIds(userId);
  }

  // CREATE
  static async createEntity(data: CreateEntityDto): Promise<Entity> {
    const { data: entity, error } = await this.supabase
      .from('entities')
      .insert([{
        ...data,
        entity_id: data.entity_id.toUpperCase()  // Uppercase natural keys
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Entity ID "${data.entity_id}" already exists`);
      }
      if (error.code === '23503') {
        throw new Error('Invalid reference data provided');
      }
      throw error;
    }

    toast.success('Entity created successfully');
    return entity;
  }

  // READ (single with joins)
  static async getEntity(id: string): Promise<Entity> {
    const { data, error } = await this.supabase
      .from('entities')
      .select(`
        *,
        institution:institutions (id, name, counselling_code),
        degree:degrees (id, degree_id, degree_name),
        department:departments (id, department_code, department_name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null as any;
      throw error;
    }
    return data;
  }

  // READ (list with filters + pagination + access control)
  static async getEntities(filters: EntityFilters): Promise<EntityListResponse> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;

    let query = this.supabase
      .from('entities')
      .select(`
        *,
        institution:institutions (id, name, counselling_code),
        degree:degrees (id, degree_id, degree_name),
        department:departments (id, department_code, department_name)
      `, { count: 'exact' });

    // Institution access filter (multi-tenancy)
    if (filters.userId && !filters.bypassInstitutionFilter) {
      const accessibleIds = await this.getUserAccessibleInstitutionIds(filters.userId);
      if (accessibleIds.length > 0) {
        query = query.in('institution_id', accessibleIds);
      } else {
        return { data: [], metadata: { total: 0, page, limit, totalPages: 0 } };
      }
    }

    // Search filter (multi-column OR search)
    if (filters.search) {
      query = query.or(
        `entity_id.ilike.%${filters.search}%,entity_name.ilike.%${filters.search}%`
      );
    }

    // Status filter
    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    // Parent entity filters
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.degree_id) query = query.eq('degree_id', filters.degree_id);
    if (filters.department_id) query = query.eq('department_id', filters.department_id);

    // Pagination + ordering
    const from = (page - 1) * limit;
    query = query
      .range(from, from + limit - 1)
      .order('created_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  // UPDATE
  static async updateEntity(id: string, data: UpdateEntityDto): Promise<Entity> {
    const { data: entity, error } = await this.supabase
      .from('entities')
      .update({
        ...data,
        entity_id: data.entity_id?.toUpperCase(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Entity ID "${data.entity_id}" already exists`);
      }
      throw error;
    }

    toast.success('Entity updated successfully');
    return entity;
  }

  // DELETE
  static async deleteEntity(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('entities')
      .delete()
      .eq('id', id);

    if (error) throw error;
    toast.success('Entity deleted successfully');
  }

  // LOOKUP by name (returns null if not found)
  static async getEntityByName(name: string, parentId: string): Promise<Entity | null> {
    const { data, error } = await this.supabase
      .from('entities')
      .select('*')
      .eq('parent_id', parentId)
      .ilike('entity_name', name)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  // LIST by parent (no pagination, active only)
  static async getEntitiesByParent(parentId: string): Promise<Entity[]> {
    const { data, error } = await this.supabase
      .from('entities')
      .select(`*, institution:institutions(id, name)`)
      .eq('parent_id', parentId)
      .eq('is_active', true)
      .order('entity_name');

    if (error) throw error;
    return data || [];
  }
}
```

---

## Data Table Schema (URL Search Params)

```typescript
// _components/data-table-schema.ts
import * as z from 'zod';

export const entitySearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Module-specific filter fields
  institution_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),

  // Date range (JSON stringified in URL)
  dateRange: z.string().optional().transform((val) => {
    if (!val) return undefined;
    try {
      return JSON.parse(val);
    } catch {
      return undefined;
    }
  }),
});

export type EntitySearchParams = z.infer<typeof entitySearchParamsSchema>;
```

---

## Column Definitions

```typescript
// _components/columns.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTableRowActions } from './row-actions';
import Link from 'next/link';
import type { Entity } from '@/types/[module]';

export const columns: ColumnDef<Entity>[] = [
  // 1. Selection checkbox
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },

  // 2. Code/ID column (sortable)
  {
    accessorKey: 'entity_id',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Entity ID' />,
    size: 120,
  },

  // 3. Name column (clickable link to detail page)
  {
    accessorKey: 'entity_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    cell: ({ row }) => (
      <Link
        href={`/module-group/entities/${row.original.id}`}
        className='text-primary hover:underline font-medium'
      >
        {row.original.entity_name}
      </Link>
    ),
    size: 250,
  },

  // 4. Related entity column (nested object with fallback)
  {
    accessorKey: 'institution',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
    cell: ({ row }) => row.original.institution?.name || 'N/A',
    size: 180,
  },

  // 5. Status badge column
  {
    accessorKey: 'is_active',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    },
    size: 100,
  },

  // 6. Date column (formatted)
  {
    accessorKey: 'created_at',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Created' />,
    cell: ({ row }) => new Date(row.getValue('created_at')).toLocaleDateString(),
    size: 120,
  },

  // 7. Actions column
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 60,
  },
];
```

---

## Row Actions

```typescript
// _components/row-actions.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Eye, Pencil, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { EntityService } from '@/lib/services/[module]/entity-service';
import toast from 'react-hot-toast';
import type { Entity } from '@/types/[module]';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onDelete?: () => void;
}

export function DataTableRowActions<TData>({ row, onDelete }: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const entity = row.original as Entity;

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canView = isSuperAdmin || canAccess('module-group.entities', 'view');
  const canEdit = isSuperAdmin || canAccess('module-group.entities', 'edit');
  const canDelete = isSuperAdmin || canAccess('module-group.entities', 'delete');

  if (!canView && !canEdit && !canDelete) return null;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await EntityService.deleteEntity(entity.id);
      router.refresh();
      onDelete?.();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
      setShowDeleteAlert(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'>
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[160px]'>
          {canView && (
            <DropdownMenuItem onClick={() => router.push(`/module-group/entities/${entity.id}`)}>
              <Eye className='mr-2 h-4 w-4' /> View
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={!canEdit}
            className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
            onClick={() => canEdit && router.push(`/module-group/entities/${entity.id}/edit`)}
          >
            <Pencil className='mr-2 h-4 w-4' /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canDelete}
            className={!canDelete ? 'opacity-50 cursor-not-allowed' : 'text-destructive'}
            onClick={() => canDelete && setShowDeleteAlert(true)}
          >
            <Trash className='mr-2 h-4 w-4' /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{entity.entity_name}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

---

## Data Table Wrapper

```typescript
// _components/entities-data-table.tsx
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Trash, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { ImportDialog } from './import-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { EntityService } from '@/lib/services/[module]/entity-service';
import toast from 'react-hot-toast';
import type { EntitySearchParams } from './data-table-schema';

interface Props {
  search: EntitySearchParams;
}

export function EntitiesDataTable({ search }: Props) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<any[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const canCreate = isSuperAdmin || canAccess('module-group.entities', 'create');
  const canDelete = isSuperAdmin || canAccess('module-group.entities', 'delete');

  // Stable fetch function with useCallback
  const fetchData = useCallback(async (params: {
    page: number; limit: number; search?: string;
    sort_by?: string; sort_order?: 'asc' | 'desc';
  }) => {
    const filters = {
      page: params.page,
      limit: params.limit,
      search: params.search || search.search,
      sortBy: params.sort_by,
      sortOrder: params.sort_order,
      institution_id: search.institution_id,
      // Add more parent filters as needed
    };

    const { data, metadata } = await EntityService.getEntities(filters);
    return {
      success: true,
      data: data || [],
      pagination: {
        page: metadata.page,
        limit: metadata.limit,
        total_pages: metadata.totalPages,
        total_items: metadata.total,
      },
    };
  }, [search]);

  // Bulk delete handler
  const handleBulkDelete = async () => {
    const results = await Promise.allSettled(
      selectedForDelete.map((item) => EntityService.deleteEntity(item.id))
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (succeeded > 0) toast.success(`${succeeded} entities deleted`);
    if (failed > 0) toast.error(`${failed} failed to delete`);

    setShowDeleteDialog(false);
    setSelectedForDelete([]);
    setRefreshTrigger((prev) => prev + 1);
    router.refresh();
  };

  // Custom toolbar
  const renderCustomToolbar = (props: { selectedRows: any[] }) => (
    <div className='flex items-center gap-2'>
      {canCreate && (
        <>
          <Button size='sm' onClick={() => router.push('/module-group/entities/new')}>
            <Plus className='mr-2 h-4 w-4' /> Add Entity
          </Button>
          <Button size='sm' variant='outline' onClick={() => setImportOpen(true)}>
            <Upload className='mr-2 h-4 w-4' /> Import
          </Button>
        </>
      )}
      {canDelete && props.selectedRows.length > 0 && (
        <Button
          size='sm'
          variant='destructive'
          onClick={() => {
            setSelectedForDelete(props.selectedRows);
            setShowDeleteDialog(true);
          }}
        >
          <Trash className='mr-2 h-4 w-4' /> Delete ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns}
        renderToolbarContent={renderCustomToolbar}
        config={{ enableUrlState: true, enableRowSelection: true }}
        idField='id'
        refetchKey={refreshTrigger}
      />

      {/* Bulk delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedForDelete.length} entities?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className='bg-destructive text-destructive-foreground'
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import dialog */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={() => {
          setRefreshTrigger((prev) => prev + 1);
          router.refresh();
        }}
      />
    </>
  );
}
```

---

## Form Component (Create/Edit)

```typescript
// _components/entity-form.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Form, FormControl, FormDescription, FormField,
  FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EntityService } from '@/lib/services/[module]/entity-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import toast from 'react-hot-toast';
import type { Entity } from '@/types/[module]';

// Zod validation schema
const entitySchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  entity_id: z
    .string()
    .min(2, 'Minimum 2 characters')
    .max(20, 'Maximum 20 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Only uppercase letters, numbers, _ and - allowed')
    .transform((val) => val.toUpperCase()),
  entity_name: z.string().min(2, 'Minimum 2 characters').max(100, 'Maximum 100 characters'),
  is_active: z.boolean().default(true),
});

type EntityFormValues = z.infer<typeof entitySchema>;

interface EntityFormProps {
  entity?: Entity;
  isEditing?: boolean;
}

export function EntityForm({ entity, isEditing = false }: EntityFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<any[]>([]);

  const form = useForm<EntityFormValues>({
    resolver: zodResolver(entitySchema),
    defaultValues: {
      institution_id: entity?.institution_id || '',
      entity_id: entity?.entity_id || '',
      entity_name: entity?.entity_name || '',
      is_active: entity?.is_active ?? true,
    },
  });

  // Load dropdown data on mount
  useEffect(() => {
    const controller = new AbortController();
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        if (!controller.signal.aborted) setInstitutions(data);
      } catch (error) {
        console.error('Failed to load institutions:', error);
      }
    }
    loadInstitutions();
    return () => controller.abort();
  }, []);

  // Cascading dropdown example (uncomment if needed):
  // const watchedInstitutionId = form.watch('institution_id');
  // useEffect(() => {
  //   const controller = new AbortController();
  //   if (watchedInstitutionId && !isEditing) {
  //     DegreeService.getDegreesByInstitution(watchedInstitutionId)
  //       .then(data => { if (!controller.signal.aborted) setDegrees(data); });
  //   } else {
  //     setDegrees([]);
  //     form.setValue('degree_id', '');
  //   }
  //   return () => controller.abort();
  // }, [watchedInstitutionId, isEditing, form]);

  const onSubmit = async (values: EntityFormValues) => {
    try {
      setIsSubmitting(true);
      if (isEditing && entity) {
        await EntityService.updateEntity(entity.id, values);
      } else {
        await EntityService.createEntity(values);
      }

      // Invalidate caches
      await queryClient.invalidateQueries({ queryKey: ['entities'] });

      router.push('/module-group/entities');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <Card>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>

              {/* Select field */}
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Text input with description */}
              <FormField
                control={form.control}
                name='entity_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entity ID</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., CSE_BE' {...field} />
                    </FormControl>
                    <FormDescription>
                      Unique identifier (uppercase letters, numbers, _, -)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Simple text input */}
              <FormField
                control={form.control}
                name='entity_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Boolean switch field (full width) */}
            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to hide this entity from lists
                    </div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit buttons */}
        <div className='flex justify-end gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? isEditing ? 'Saving...' : 'Creating...'
              : isEditing ? 'Save Changes' : 'Create Entity'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

---

## Filter Components

### Filter Presentation (UI)

```typescript
// _components/entity-filters.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import type { EntitySearchParams } from './data-table-schema';

interface EntityFiltersProps {
  searchParams: EntitySearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function EntityFilters({ searchParams, onFilterChange, onClearFilters }: EntityFiltersProps) {
  const [institutions, setInstitutions] = useState<any[]>([]);

  // Load filter options
  useEffect(() => {
    const controller = new AbortController();
    OrganizationService.getInstitutionNames(true)
      .then((data) => { if (!controller.signal.aborted) setInstitutions(data); })
      .catch(console.error);
    return () => controller.abort();
  }, []);

  const hasActiveFilters = searchParams.institution_id || searchParams.status;

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
      {/* Institution filter */}
      <Select
        value={searchParams.institution_id || ''}
        onValueChange={(val) => onFilterChange('institution_id', val || undefined)}
      >
        <SelectTrigger>
          <SelectValue placeholder='All Institutions' />
        </SelectTrigger>
        <SelectContent>
          {institutions.map((inst) => (
            <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select
        value={searchParams.status || ''}
        onValueChange={(val) => onFilterChange('status', val || undefined)}
      >
        <SelectTrigger>
          <SelectValue placeholder='All Statuses' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='active'>Active</SelectItem>
          <SelectItem value='inactive'>Inactive</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear filters button */}
      {hasActiveFilters && (
        <Button variant='ghost' size='sm' onClick={onClearFilters}>
          <X className='mr-2 h-4 w-4' /> Clear Filters
        </Button>
      )}
    </div>
  );
}
```

### Filter Logic (URL State)

```typescript
// _components/entity-filters-client.tsx
'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EntityFilters } from './entity-filters';
import type { EntitySearchParams } from './data-table-schema';

interface Props {
  searchParams: EntitySearchParams;
}

export function EntityFiltersClient({ searchParams }: Props) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1'); // Always reset to page 1 on filter change
      router.push(`/module-group/entities?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (currentSearchParams?.get('pageSize')) {
      params.set('pageSize', currentSearchParams.get('pageSize')!);
    }
    router.push(`/module-group/entities?${params.toString()}`);
  }, [router, currentSearchParams]);

  return (
    <EntityFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
```

---

## React Query Hook

```typescript
// hooks/[module-group]/use-entities.ts
import { useQuery } from '@tanstack/react-query';
import { EntityService } from '@/lib/services/[module-group]/entity-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { EntityFilters } from '@/types/[module]';

export function useEntities(filters: EntityFilters) {
  return useQuery({
    queryKey: ['entities', filters],
    queryFn: async () => {
      const { data, metadata } = await EntityService.getEntities(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}
```

---

## Server-Side Data Fetching

```typescript
// _data/get-entities.ts
import { createClient } from '@/lib/supabase/server';

interface EntityFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  institution_id?: string;
}

export async function getEntities(filters: EntityFilters) {
  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;

  let query = supabase
    .from('entities')
    .select(`
      *,
      institution:institutions (id, name)
    `, { count: 'exact' });

  if (filters.search) {
    query = query.or(
      `entity_id.ilike.%${filters.search}%,entity_name.ilike.%${filters.search}%`
    );
  }

  if (filters.institution_id) {
    query = query.eq('institution_id', filters.institution_id);
  }

  const from = (page - 1) * pageSize;
  query = query
    .range(from, from + pageSize - 1)
    .order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Failed to fetch entities:', error);
    throw new Error(`Failed to fetch entities: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}
```

---

## Page Templates

### List Page (Server Component)

```typescript
// page.tsx
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { EntityFiltersClient } from './_components/entity-filters-client';
import { EntitiesDataTable } from './_components/entities-data-table';
import { entitySearchParamsSchema } from './_components/data-table-schema';

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = entitySearchParamsSchema.parse(await searchParams);

  return (
    <ContentLayout title='Entities'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Module Group' },
          { label: 'Entities' },
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Entities</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage your entities
          </p>
        </div>
        <EntityFiltersClient searchParams={search} />
        <EntitiesDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
```

### Create Page (Client Component)

```typescript
// new/page.tsx
'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { EntityForm } from '../_components/entity-form';

export default function NewEntityPage() {
  return (
    <ContentLayout title='Create Entity'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Module Group' },
          { label: 'Entities', href: '/module-group/entities' },
          { label: 'New Entity' },
        ]}
      />
      <div className='mt-4'>
        <h1 className='text-2xl font-bold py-1'>Create New Entity</h1>
        <p className='text-sm text-muted-foreground mb-6'>
          Fill in the details to create a new entity
        </p>
        <EntityForm />
      </div>
    </ContentLayout>
  );
}
```

### Detail Page (Client Component)

```typescript
// [id]/page.tsx
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EntityService } from '@/lib/services/[module]/entity-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { Entity } from '@/types/[module]';

export default function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('module-group.entities', 'edit');

  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    EntityService.getEntity(id)
      .then(setEntity)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Loading...'>
        <div className='flex items-center justify-center py-20'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !entity) {
    return (
      <ContentLayout title='Error'>
        <p className='text-destructive'>{error || 'Entity not found'}</p>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={entity.entity_name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Module Group' },
          { label: 'Entities', href: '/module-group/entities' },
          { label: entity.entity_name },
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex items-center justify-between'>
          <h1 className='text-2xl font-bold'>{entity.entity_name}</h1>
          {canEdit && (
            <Button onClick={() => router.push(`/module-group/entities/${id}/edit`)}>
              <Pencil className='mr-2 h-4 w-4' /> Edit
            </Button>
          )}
        </div>

        <Card>
          <CardContent className='p-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              <div>
                <p className='text-sm text-muted-foreground'>Entity ID</p>
                <p className='font-medium'>{entity.entity_id}</p>
              </div>
              <div>
                <p className='text-sm text-muted-foreground'>Institution</p>
                <p className='font-medium'>{entity.institution?.name || 'N/A'}</p>
              </div>
              <div>
                <p className='text-sm text-muted-foreground'>Status</p>
                <Badge variant={entity.is_active ? 'default' : 'secondary'}>
                  {entity.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className='text-sm text-muted-foreground'>Created</p>
                <p className='font-medium'>
                  {new Date(entity.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
```

### Edit Page (Client Component)

```typescript
// [id]/edit/page.tsx
'use client';

import { useState, useEffect, use } from 'react';
import { Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { EntityForm } from '../../_components/entity-form';
import { EntityService } from '@/lib/services/[module]/entity-service';
import type { Entity } from '@/types/[module]';

export default function EditEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    EntityService.getEntity(id)
      .then(setEntity)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Loading...'>
        <div className='flex items-center justify-center py-20'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (!entity) {
    return (
      <ContentLayout title='Error'>
        <p className='text-destructive'>Entity not found</p>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Entity'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Module Group' },
          { label: 'Entities', href: '/module-group/entities' },
          { label: entity.entity_name, href: `/module-group/entities/${id}` },
          { label: 'Edit' },
        ]}
      />
      <div className='mt-4'>
        <h1 className='text-2xl font-bold py-1'>Edit Entity</h1>
        <p className='text-sm text-muted-foreground mb-6'>
          Update entity details
        </p>
        <EntityForm entity={entity} isEditing={true} />
      </div>
    </ContentLayout>
  );
}
```
