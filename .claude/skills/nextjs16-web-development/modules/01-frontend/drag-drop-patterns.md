# Drag & Drop Patterns

dnd-kit for Kanban boards and sortable lists.

## Overview

Production-ready drag-and-drop using dnd-kit:
- **Kanban boards**: Task management
- **Sortable lists**: Reorderable items
- **Accessible**: Keyboard navigation
- **Touch-friendly**: Mobile support

---

## Installation

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities
```

---

## Kanban Board

### Board Component

```tsx
// components/kanban/kanban-board.tsx
'use client'

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext } from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { TaskCard } from './task-card'

interface Task {
  id: string
  title: string
  status: string
}

interface KanbanBoardProps {
  tasks: Task[]
  columns: Array<{ id: string; title: string }>
  onTaskMove: (taskId: string, newStatus: string) => Promise<void>
}

export function KanbanBoard({ tasks, columns, onTaskMove }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const task = tasks.find((t) => t.id === active.id)
      if (task) {
        await onTaskMove(task.id, over.id as string)
      }
    }

    setActiveId(null)
  }

  const activeTask = tasks.find((t) => t.id === activeId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasks.filter((t) => t.status === column.id)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} />}
      </DragOverlay>
    </DndContext>
  )
}
```

### Column Component

```tsx
// components/kanban/kanban-column.tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { TaskCard } from './task-card'

interface KanbanColumnProps {
  column: { id: string; title: string }
  tasks: Array<{ id: string; title: string }>
}

export function KanbanColumn({ column, tasks }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: column.id })

  return (
    <div className="flex-shrink-0 w-80">
      <div className="bg-muted rounded-lg p-4">
        <h3 className="font-semibold mb-4">{column.title}</h3>

        <SortableContext
          id={column.id}
          items={tasks}
          strategy={verticalListSortingStrategy}
        >
          <div ref={setNodeRef} className="space-y-2 min-h-[200px]">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
```

### Task Card Component

```tsx
// components/kanban/task-card.tsx
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card } from '@/components/ui/card'

interface TaskCardProps {
  task: { id: string; title: string }
}

export function TaskCard({ task }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 cursor-move hover:shadow-md transition-shadow"
    >
      <p>{task.title}</p>
    </Card>
  )
}
```

---

## Sortable List

### List Component

```tsx
// components/sortable/sortable-list.tsx
'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableItem } from './sortable-item'

interface SortableListProps {
  items: Array<{ id: string; content: string }>
  onReorder: (items: Array<{ id: string; content: string }>) => Promise<void>
}

export function SortableList({ items: initialItems, onReorder }: SortableListProps) {
  const [items, setItems] = useState(initialItems)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = async (event) => {
    const { active, over } = event

    if (active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)

      const newItems = arrayMove(items, oldIndex, newIndex)
      setItems(newItems)
      await onReorder(newItems)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item) => (
            <SortableItem key={item.id} id={item.id} content={item.content} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

### Item Component

```tsx
// components/sortable/sortable-item.tsx
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

interface SortableItemProps {
  id: string
  content: string
}

export function SortableItem({ id, content }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 bg-background border rounded-lg"
    >
      <div {...attributes} {...listeners} className="cursor-move">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1">{content}</div>
    </div>
  )
}
```

---

## Usage Example

### Page with Kanban Board

```tsx
// app/(dashboard)/dashboard/tasks/page.tsx
import { getTasks } from '@/lib/data/tasks'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { updateTaskStatus } from '@/app/actions/tasks'

export default async function TasksPage() {
  const tasks = await getTasks()

  const columns = [
    { id: 'todo', title: 'To Do' },
    { id: 'in_progress', title: 'In Progress' },
    { id: 'done', title: 'Done' },
  ]

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Tasks</h1>
      <KanbanBoard
        tasks={tasks}
        columns={columns}
        onTaskMove={updateTaskStatus}
      />
    </div>
  )
}
```

---

**Version**: 3.0.0
