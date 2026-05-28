# Charts & Analytics

Recharts integration for dashboard visualizations.

## Overview

Production-ready chart components using Recharts:
- **Responsive**: Auto-resize to container
- **Accessible**: ARIA labels and keyboard navigation
- **Customizable**: Themes and color schemes
- **Type-safe**: TypeScript definitions

---

## Installation

```bash
npm install recharts
```

---

## Chart Components

### 1. Area Chart

```tsx
// components/charts/area-chart.tsx
'use client'

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface AreaChartProps {
  data: Array<{ name: string; value: number }>
  dataKey?: string
  color?: string
  height?: number
}

export function AreaChart({
  data,
  dataKey = 'value',
  color = 'hsl(var(--primary))',
  height = 300,
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          fillOpacity={1}
          fill="url(#colorValue)"
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
```

### 2. Bar Chart

```tsx
// components/charts/bar-chart.tsx
'use client'

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface BarChartProps {
  data: Array<{ name: string; value: number }>
  dataKey?: string
  color?: string
  height?: number
}

export function BarChart({
  data,
  dataKey = 'value',
  color = 'hsl(var(--primary))',
  height = 300,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
          }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
```

### 3. Line Chart

```tsx
// components/charts/line-chart.tsx
'use client'

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface LineChartProps {
  data: Array<any>
  lines: Array<{
    dataKey: string
    color: string
    name: string
  }>
  height?: number
}

export function LineChart({
  data,
  lines,
  height = 300,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
          }}
        />
        <Legend />
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            stroke={line.color}
            name={line.name}
            strokeWidth={2}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
```

### 4. Pie Chart

```tsx
// components/charts/pie-chart.tsx
'use client'

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface PieChartProps {
  data: Array<{ name: string; value: number }>
  colors?: string[]
  height?: number
}

const DEFAULT_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

export function PieChart({
  data,
  colors = DEFAULT_COLORS,
  height = 300,
}: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) =>
            `${name}: ${(percent * 100).toFixed(0)}%`
          }
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </RechartsPieChart>
    </ResponsiveContainer>
  )
}
```

---

## Usage Example

### Analytics Dashboard

```tsx
// app/(dashboard)/dashboard/analytics/page.tsx
import { Suspense } from 'react'
import { getAnalyticsData } from '@/lib/data/analytics'
import { AreaChart } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { LineChart } from '@/components/charts/line-chart'
import { PieChart } from '@/components/charts/pie-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AnalyticsPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <OrdersChart />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <TrafficChart />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <CategoryChart />
      </Suspense>
    </div>
  )
}

async function RevenueChart() {
  const data = await getAnalyticsData('revenue')

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Revenue</CardTitle>
      </CardHeader>
      <CardContent>
        <AreaChart data={data} dataKey="revenue" />
      </CardContent>
    </Card>
  )
}

async function OrdersChart() {
  const data = await getAnalyticsData('orders')

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Orders</CardTitle>
      </CardHeader>
      <CardContent>
        <BarChart data={data} dataKey="orders" />
      </CardContent>
    </Card>
  )
}

async function TrafficChart() {
  const data = await getAnalyticsData('traffic')

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Traffic Sources</CardTitle>
      </CardHeader>
      <CardContent>
        <LineChart
          data={data}
          lines={[
            { dataKey: 'organic', color: 'hsl(var(--primary))', name: 'Organic' },
            { dataKey: 'social', color: 'hsl(var(--accent))', name: 'Social' },
          ]}
        />
      </CardContent>
    </Card>
  )
}

async function CategoryChart() {
  const data = await getAnalyticsData('categories')

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Sales by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <PieChart data={data} />
      </CardContent>
    </Card>
  )
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-32 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent>
        <div className="h-[300px] bg-muted animate-pulse rounded" />
      </CardContent>
    </Card>
  )
}
```

---

## Theming

### Add Chart Colors

```css
/* app/globals.css */
@layer base {
  :root {
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }

  .dark {
    --chart-1: 220 70% 60%;
    --chart-2: 160 60% 55%;
    --chart-3: 30 80% 65%;
    --chart-4: 280 65% 70%;
    --chart-5: 340 75% 65%;
  }
}
```

---

**Version**: 3.0.0
