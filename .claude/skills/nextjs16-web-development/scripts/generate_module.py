#!/usr/bin/env python3
"""
Next.js 16 Module Generator (Enhanced)

Generates a complete CRUD module with:
- TypeScript types and Zod schemas
- Cached data fetching functions
- Server Actions for mutations
- Form components using FormInput, FormSelect, etc.
- Data table using useDataTable and TanStack Table
- Complete page routes (list, create, edit, detail)
- Loading skeletons

Usage:
    python generate_module.py <module-name> [--singular] [--path .]

Examples:
    python generate_module.py products
    python generate_module.py blog-posts --singular post
    python generate_module.py users --path /path/to/project
"""

import sys
import os
from pathlib import Path

def to_pascal_case(text):
    """Convert hyphenated text to PascalCase"""
    return ''.join(word.capitalize() for word in text.split('-'))

def to_camel_case(text):
    """Convert hyphenated text to camelCase"""
    words = text.split('-')
    return words[0] + ''.join(word.capitalize() for word in words[1:])

def generate_module(module_name, singular=None, project_path='.'):
    """Generate a complete CRUD module"""

    if not singular:
        # Auto-generate singular by removing 's' if plural
        singular = module_name[:-1] if module_name.endswith('s') else module_name

    # Names for templates
    plural = module_name
    pascal_singular = to_pascal_case(singular)
    pascal_plural = to_pascal_case(plural)
    camel_singular = to_camel_case(singular)
    camel_plural = to_camel_case(plural)

    base_path = Path(project_path).resolve()

    print(f"🚀 Generating {pascal_singular} module...")
    print(f"   Plural: {plural}")
    print(f"   Singular: {singular}")
    print("")

    # Create directories
    types_dir = base_path / 'types'
    data_dir = base_path / 'lib' / 'data'
    actions_dir = base_path / 'app' / 'actions'
    routes_dir = base_path / 'app' / '(dashboard)' / 'dashboard' / plural
    components_dir = base_path / 'components' / plural

    for dir in [types_dir, data_dir, actions_dir, components_dir]:
        dir.mkdir(parents=True, exist_ok=True)

    # Generate TypeScript types
    types_content = f'''import {{ z }} from 'zod'

// Database entity
export interface {pascal_singular} {{
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  user_id: string
}}

// Validation schemas
export const Create{pascal_singular}Schema = z.object({{
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters'),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .nullable(),
  is_active: z.boolean().default(true),
}})

export const Update{pascal_singular}Schema = Create{pascal_singular}Schema.partial()

export type Create{pascal_singular}Input = z.infer<typeof Create{pascal_singular}Schema>
export type Update{pascal_singular}Input = z.infer<typeof Update{pascal_singular}Schema>

// Filters for data fetching
export interface {pascal_singular}Filters {{
  search?: string
  is_active?: boolean
  page?: number
  per_page?: number
}}
'''

    types_file = types_dir / f'{singular}.ts'
    types_file.write_text(types_content)
    print(f"✅ Created {types_file}")

    # Generate data layer with caching
    data_content = f'''import {{ cacheTag, cacheLife }} from 'next/cache'
import {{ createClient }} from '@/lib/supabase/server'
import type {{ {pascal_singular}, {pascal_singular}Filters }} from '@/types/{singular}'

export async function get{pascal_plural}(filters: {pascal_singular}Filters = {{}}) {{
  'use cache'
  cacheLife('warm') // 5-minute freshness
  cacheTag('{plural}')

  const supabase = await createClient()

  let query = supabase
    .from('{plural}')
    .select('*', {{ count: 'exact' }})
    .order('created_at', {{ ascending: false }})

  // Apply filters
  if (filters.search) {{
    query = query.ilike('name', `%${{filters.search}}%`)
  }}
  if (filters.is_active !== undefined) {{
    query = query.eq('is_active', filters.is_active)
  }}

  // Pagination
  const page = filters.page || 1
  const perPage = filters.per_page || 10
  const from = (page - 1) * perPage
  const to = from + perPage - 1
  query = query.range(from, to)

  const {{ data, error, count }} = await query

  if (error) throw error

  return {{
    data: (data || []) as {pascal_singular}[],
    total: count || 0,
    pageCount: Math.ceil((count || 0) / perPage),
  }}
}}

export async function get{pascal_singular}(id: string) {{
  'use cache'
  cacheLife('warm')
  cacheTag('{plural}', `{singular}-${{id}}`)

  const supabase = await createClient()

  const {{ data, error }} = await supabase
    .from('{plural}')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as {pascal_singular}
}}
'''

    data_file = data_dir / f'{plural}.ts'
    data_file.write_text(data_content)
    print(f"✅ Created {data_file}")

    # Generate Server Actions
    actions_content = f'''\'use server\'

import {{ updateTag }} from 'next/cache'
import {{ redirect }} from 'next/navigation'
import {{ revalidatePath }} from 'next/cache'
import {{ createClient }} from '@/lib/supabase/server'
import {{
  Create{pascal_singular}Schema,
  Update{pascal_singular}Schema,
}} from '@/types/{singular}'

export type FormState = {{
  message?: string
  errors?: Record<string, string[]>
  success?: boolean
}}

export async function create{pascal_singular}(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {{
  const validation = Create{pascal_singular}Schema.safeParse({{
    name: formData.get('name'),
    description: formData.get('description'),
    is_active: formData.get('is_active') === 'true',
  }})

  if (!validation.success) {{
    return {{
      errors: validation.error.flatten().fieldErrors,
      message: 'Invalid fields. Please check the form.',
    }}
  }}

  const supabase = await createClient()

  // Get current user
  const {{ data: {{ user }} }} = await supabase.auth.getUser()
  if (!user) {{
    return {{ message: 'Unauthorized' }}
  }}

  const {{ data, error }} = await supabase
    .from('{plural}')
    .insert([{{ ...validation.data, user_id: user.id }}])
    .select()
    .single()

  if (error) {{
    return {{ message: `Database error: Failed to create {singular}.` }}
  }}

  updateTag('{plural}')
  redirect(`/dashboard/{plural}/${{data.id}}`)
}}

export async function update{pascal_singular}(
  id: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {{
  const validation = Update{pascal_singular}Schema.safeParse({{
    name: formData.get('name'),
    description: formData.get('description'),
    is_active: formData.get('is_active') === 'true',
  }})

  if (!validation.success) {{
    return {{
      errors: validation.error.flatten().fieldErrors,
      message: 'Invalid fields. Please check the form.',
    }}
  }}

  const supabase = await createClient()

  const {{ error }} = await supabase
    .from('{plural}')
    .update(validation.data)
    .eq('id', id)

  if (error) {{
    return {{ message: `Database error: Failed to update {singular}.` }}
  }}

  updateTag('{plural}')
  updateTag(`{singular}-${{id}}`)
  revalidatePath(`/dashboard/{plural}/${{id}}`)

  return {{ success: true, message: '{pascal_singular} updated successfully!' }}
}}

export async function delete{pascal_singular}(id: string): Promise<FormState> {{
  const supabase = await createClient()

  const {{ error }} = await supabase
    .from('{plural}')
    .delete()
    .eq('id', id)

  if (error) {{
    return {{ message: `Database error: Failed to delete {singular}.` }}
  }}

  updateTag('{plural}')
  updateTag(`{singular}-${{id}}`)
  redirect('/dashboard/{plural}')
}}
'''

    actions_file = actions_dir / f'{plural}.ts'
    actions_file.write_text(actions_content)
    print(f"✅ Created {actions_file}")

    # Generate Form Component using FormInput, FormTextarea, FormCheckbox
    form_content = f'''\'use client\'

import {{ useActionState }} from 'react'
import {{ useFormStatus }} from 'react-dom'
import {{ create{pascal_singular}, update{pascal_singular} }} from '@/app/actions/{plural}'
import {{ FormInput }} from '@/components/forms/form-input'
import {{ FormTextarea }} from '@/components/forms/form-textarea'
import {{ FormCheckbox }} from '@/components/forms/form-checkbox'
import {{ Button }} from '@/components/ui/button'
import type {{ {pascal_singular} }} from '@/types/{singular}'

interface {pascal_singular}FormProps {{
  {camel_singular}?: {pascal_singular}
}}

export function {pascal_singular}Form({{ {camel_singular} }}: {pascal_singular}FormProps) {{
  const action = {camel_singular}
    ? update{pascal_singular}.bind(null, {camel_singular}.id)
    : create{pascal_singular}

  const [state, formAction] = useActionState(action, {{}})

  return (
    <form action={{formAction}} className="space-y-6">
      {{state.message && (
        <div className={{`p-4 rounded-md ${{state.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}}`}}>
          {{state.message}}
        </div>
      )}}

      <FormInput
        label="Name"
        name="name"
        required
        defaultValue={{{camel_singular}?.name}}
        error={{state.errors?.name?.[0]}}
      />

      <FormTextarea
        label="Description"
        name="description"
        rows={{4}}
        defaultValue={{{camel_singular}?.description || ''}}
        error={{state.errors?.description?.[0]}}
      />

      <FormCheckbox
        label="Active"
        name="is_active"
        defaultChecked={{{camel_singular}?.is_active ?? true}}
      />

      <SubmitButton />
    </form>
  )
}}

function SubmitButton() {{
  const {{ pending }} = useFormStatus()

  return (
    <Button type="submit" disabled={{pending}}>
      {{pending ? 'Saving...' : 'Save {pascal_singular}'}}
    </Button>
  )
}}
'''

    (components_dir / f'{singular}-form.tsx').write_text(form_content)
    print(f"✅ Created {components_dir}/{singular}-form.tsx")

    # Generate Table Columns using DataTableColumnHeader
    columns_content = f'''\'use client\'

import {{ type ColumnDef }} from '@tanstack/react-table'
import {{ DataTableColumnHeader }} from '@/components/data-table/data-table-column-header'
import {{ Badge }} from '@/components/ui/badge'
import {{ Button }} from '@/components/ui/button'
import {{
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
}} from '@/components/ui/dropdown-menu'
import {{ MoreHorizontal, Pencil, Trash }} from 'lucide-react'
import Link from 'next/link'
import type {{ {pascal_singular} }} from '@/types/{singular}'

export const columns: ColumnDef<{pascal_singular}>[] = [
  {{
    accessorKey: 'name',
    header: ({{ column }}) => (
      <DataTableColumnHeader column={{column}} title="Name" />
    ),
  }},
  {{
    accessorKey: 'description',
    header: 'Description',
    cell: ({{ row }}) => {{
      const desc = row.getValue('description') as string | null
      return desc ? (
        <p className="max-w-md truncate">{{desc}}</p>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    }},
  }},
  {{
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({{ row }}) => {{
      const isActive = row.getValue('is_active') as boolean
      return (
        <Badge variant={{isActive ? 'default' : 'secondary'}}>
          {{isActive ? 'Active' : 'Inactive'}}
        </Badge>
      )
    }},
  }},
  {{
    accessorKey: 'created_at',
    header: ({{ column }}) => (
      <DataTableColumnHeader column={{column}} title="Created" />
    ),
    cell: ({{ row }}) => {{
      const date = new Date(row.getValue('created_at'))
      return date.toLocaleDateString()
    }},
  }},
  {{
    id: 'actions',
    cell: ({{ row }}) => {{
      const {camel_singular} = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={{`/dashboard/{plural}/${{{camel_singular}.id}}`}}>
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={{`/dashboard/{plural}/${{{camel_singular}.id}}/edit`}}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }},
  }},
]
'''

    (components_dir / 'columns.tsx').write_text(columns_content)
    print(f"✅ Created {components_dir}/columns.tsx")

    # Generate Table Component using useDataTable
    table_content = f'''\'use client\'

import {{ useDataTable }} from '@/components/data-table/use-data-table'
import {{ DataTable }} from '@/components/data-table/data-table'
import {{ DataTableToolbar }} from '@/components/data-table/data-table-toolbar'
import {{ DataTablePagination }} from '@/components/data-table/data-table-pagination'
import {{ columns }} from './columns'
import type {{ {pascal_singular} }} from '@/types/{singular}'

interface {pascal_singular}TableProps {{
  data: {pascal_singular}[]
  pageCount: number
}}

export function {pascal_singular}Table({{ data, pageCount }}: {pascal_singular}TableProps) {{
  const {{ table }} = useDataTable({{
    data,
    columns,
    pageCount,
    defaultPerPage: 10,
    defaultSort: [{{ id: 'created_at', desc: true }}],
  }})

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={{table}}
        searchPlaceholder="Search {plural}..."
        filters={{[
          {{
            column: 'is_active',
            title: 'Status',
            options: [
              {{ label: 'Active', value: 'true' }},
              {{ label: 'Inactive', value: 'false' }},
            ],
          }},
        ]}}
      />
      <DataTable table={{table}} />
      <DataTablePagination table={{table}} />
    </div>
  )
}}
'''

    (components_dir / f'{singular}-table.tsx').write_text(table_content)
    print(f"✅ Created {components_dir}/{singular}-table.tsx")

    # Generate Skeletons
    skeletons_content = f'''import {{ Skeleton }} from '@/components/ui/skeleton'

export function {pascal_singular}FormSkeleton() {{
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-10 w-32" />
    </div>
  )
}}

export function {pascal_singular}TableSkeleton() {{
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}}
'''

    (components_dir / 'skeletons.tsx').write_text(skeletons_content)
    print(f"✅ Created {components_dir}/skeletons.tsx")

    # Generate List Page
    list_page = f'''import {{ Suspense }} from 'react'
import {{ get{pascal_plural} }} from '@/lib/data/{plural}'
import {{ {pascal_singular}Table }} from '@/components/{plural}/{singular}-table'
import {{ {pascal_singular}TableSkeleton }} from '@/components/{plural}/skeletons'
import {{ PageContainer }} from '@/components/layout/page-container'
import {{ Button }} from '@/components/ui/button'
import {{ Plus }} from 'lucide-react'
import Link from 'next/link'
import type {{ {pascal_singular}Filters }} from '@/types/{singular}'

interface PageProps {{
  searchParams: Promise<{{
    search?: string
    is_active?: string
    page?: string
    per_page?: string
  }}>
}}

export default async function {pascal_plural}Page({{ searchParams }}: PageProps) {{
  const params = await searchParams

  return (
    <PageContainer
      title="{pascal_plural}"
      description="Manage your {plural}"
      actions={{
        <Button asChild>
          <Link href="/dashboard/{plural}/new">
            <Plus className="mr-2 h-4 w-4" />
            Create {pascal_singular}
          </Link>
        </Button>
      }}
    >
      <Suspense fallback={{<{pascal_singular}TableSkeleton />}}>
        <{pascal_singular}List filters={{params}} />
      </Suspense>
    </PageContainer>
  )
}}

async function {pascal_singular}List({{ filters }}: {{ filters: {pascal_singular}Filters }}) {{
  const {{ data, pageCount }} = await get{pascal_plural}(filters)
  return <{pascal_singular}Table data={{data}} pageCount={{pageCount}} />
}}
'''

    (routes_dir / 'page.tsx').write_text(list_page)
    print(f"✅ Created {routes_dir}/page.tsx")

    # Generate Create Page
    (routes_dir / 'new').mkdir(parents=True, exist_ok=True)
    create_page = f'''import {{ Suspense }} from 'react'
import {{ {pascal_singular}Form }} from '@/components/{plural}/{singular}-form'
import {{ {pascal_singular}FormSkeleton }} from '@/components/{plural}/skeletons'
import {{ PageContainer }} from '@/components/layout/page-container'

export default function New{pascal_singular}Page() {{
  return (
    <PageContainer title="Create {pascal_singular}">
      <Suspense fallback={{<{pascal_singular}FormSkeleton />}}>
        <{pascal_singular}Form />
      </Suspense>
    </PageContainer>
  )
}}
'''

    (routes_dir / 'new' / 'page.tsx').write_text(create_page)
    print(f"✅ Created {routes_dir}/new/page.tsx")

    # Generate Detail Page
    detail_dir = routes_dir / '[id]'
    detail_dir.mkdir(parents=True, exist_ok=True)

    detail_page = f'''import {{ Suspense }} from 'react'
import {{ get{pascal_singular} }} from '@/lib/data/{plural}'
import {{ PageContainer }} from '@/components/layout/page-container'
import {{ Button }} from '@/components/ui/button'
import {{ Badge }} from '@/components/ui/badge'
import {{ Skeleton }} from '@/components/ui/skeleton'
import {{ Pencil }} from 'lucide-react'
import Link from 'next/link'
import {{ notFound }} from 'next/navigation'

interface PageProps {{
  params: Promise<{{ id: string }}>
}}

export default async function {pascal_singular}DetailPage({{ params }}: PageProps) {{
  const {{ id }} = await params

  return (
    <Suspense fallback={{<{pascal_singular}DetailSkeleton />}}>
      <{pascal_singular}Detail id={{id}} />
    </Suspense>
  )
}}

async function {pascal_singular}Detail({{ id }}: {{ id: string }}) {{
  const {camel_singular} = await get{pascal_singular}(id).catch(() => notFound())

  return (
    <PageContainer
      title={{{camel_singular}.name}}
      actions={{
        <Button asChild>
          <Link href={{`/dashboard/{plural}/${{id}}/edit`}}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </Button>
      }}
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Status</h3>
          <Badge variant={{{camel_singular}.is_active ? 'default' : 'secondary'}}>
            {{{camel_singular}.is_active ? 'Active' : 'Inactive'}}
          </Badge>
        </div>

        {{{camel_singular}.description && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
            <p className="text-sm">{{{camel_singular}.description}}</p>
          </div>
        )}}

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Created</h3>
          <p className="text-sm">
            {{new Date({camel_singular}.created_at).toLocaleDateString()}}
          </p>
        </div>
      </div>
    </PageContainer>
  )
}}

function {pascal_singular}DetailSkeleton() {{
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}}
'''

    (detail_dir / 'page.tsx').write_text(detail_page)
    print(f"✅ Created {detail_dir}/page.tsx")

    # Generate Edit Page
    edit_dir = detail_dir / 'edit'
    edit_dir.mkdir(parents=True, exist_ok=True)

    edit_page = f'''import {{ Suspense }} from 'react'
import {{ get{pascal_singular} }} from '@/lib/data/{plural}'
import {{ {pascal_singular}Form }} from '@/components/{plural}/{singular}-form'
import {{ {pascal_singular}FormSkeleton }} from '@/components/{plural}/skeletons'
import {{ PageContainer }} from '@/components/layout/page-container'
import {{ notFound }} from 'next/navigation'

interface PageProps {{
  params: Promise<{{ id: string }}>
}}

export default async function Edit{pascal_singular}Page({{ params }}: PageProps) {{
  const {{ id }} = await params

  return (
    <PageContainer title="Edit {pascal_singular}">
      <Suspense fallback={{<{pascal_singular}FormSkeleton />}}>
        <{pascal_singular}FormWrapper id={{id}} />
      </Suspense>
    </PageContainer>
  )
}}

async function {pascal_singular}FormWrapper({{ id }}: {{ id: string }}) {{
  const {camel_singular} = await get{pascal_singular}(id).catch(() => notFound())
  return <{pascal_singular}Form {camel_singular}={{{camel_singular}}} />
}}
'''

    (edit_dir / 'page.tsx').write_text(edit_page)
    print(f"✅ Created {edit_dir}/page.tsx")

    # Generate Database Schema SQL
    schema_content = f'''-- Create {plural} table
CREATE TABLE {plural} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) NOT NULL
);

-- Enable RLS
ALTER TABLE {plural} ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own {plural}"
  ON {plural} FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own {plural}"
  ON {plural} FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own {plural}"
  ON {plural} FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own {plural}"
  ON {plural} FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_{plural}_updated_at
  BEFORE UPDATE ON {plural}
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_{plural}_user_id ON {plural}(user_id);
CREATE INDEX idx_{plural}_created_at ON {plural}(created_at);
'''

    migrations_dir = base_path / 'supabase' / 'migrations'
    migrations_dir.mkdir(parents=True, exist_ok=True)
    schema_file = migrations_dir / f'create_{plural}_table.sql'
    schema_file.write_text(schema_content)
    print(f"✅ Created {schema_file}")

    print("")
    print(f"✅ {pascal_singular} module generated successfully!")
    print("")
    print("📁 Files created:")
    print(f"   Types:      types/{singular}.ts")
    print(f"   Data:       lib/data/{plural}.ts")
    print(f"   Actions:    app/actions/{plural}.ts")
    print(f"   Components: components/{plural}/*.tsx")
    print(f"   Pages:      app/(dashboard)/dashboard/{plural}/**/page.tsx")
    print(f"   Migration:  supabase/migrations/create_{plural}_table.sql")
    print("")
    print("🚀 Next steps:")
    print(f"   1. Run the migration: supabase/migrations/create_{plural}_table.sql")
    print(f"   2. Customize types in: types/{singular}.ts")
    print(f"   3. Update form fields in: components/{plural}/{singular}-form.tsx")
    print(f"   4. Customize table columns in: components/{plural}/columns.tsx")
    print(f"   5. Add to navigation config: config/nav-config.ts")
    print(f"   6. Start dev server: npm run dev")
    print("")

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_module.py <module-name> [--singular name] [--path /path]")
        print("\nExamples:")
        print("  python generate_module.py products")
        print("  python generate_module.py blog-posts --singular post")
        print("  python generate_module.py users --path /path/to/project")
        sys.exit(1)

    module_name = sys.argv[1]
    singular = None
    project_path = '.'

    # Parse optional arguments
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--singular' and i + 1 < len(sys.argv):
            singular = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--path' and i + 1 < len(sys.argv):
            project_path = sys.argv[i + 1]
            i += 2
        else:
            i += 1

    generate_module(module_name, singular, project_path)

if __name__ == "__main__":
    main()
