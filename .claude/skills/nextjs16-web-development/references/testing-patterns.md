# Testing Patterns for Next.js 16

**CRITICAL**: This guide covers testing patterns for Next.js 16 applications with Cache Components, Server Actions, and modern React patterns.

---

## Testing Philosophy

**What to Test**:
- ✅ Server Actions (business logic, validation, cache invalidation)
- ✅ Cached data functions (cache behavior, data fetching)
- ✅ Form validation (Zod schemas, error handling)
- ✅ Client components (user interactions, state management)
- ✅ API routes (endpoints, error handling)

**What NOT to Test**:
- ❌ Next.js framework internals
- ❌ Third-party library behavior
- ❌ Trivial getters/setters
- ❌ Type definitions (TypeScript handles this)

---

## Setup

### Install Testing Libraries

```bash
npm install -D vitest @vitejs/plugin-react
npm install -D @testing-library/react @testing-library/jest-dom
npm install -D @testing-library/user-event
npm install -D happy-dom # Fast DOM implementation
```

### Configure Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
})
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom'
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test
afterEach(() => {
  cleanup()
})
```

### Add Test Scripts

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

## Pattern 1: Testing Server Actions

### Test Validation

```typescript
// app/actions/products.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createProduct } from './products'

describe('createProduct', () => {
  it('validates required fields', async () => {
    const formData = new FormData()
    formData.append('name', '')
    formData.append('price', '0')

    const result = await createProduct({}, formData)

    expect(result.errors?.name).toBeDefined()
    expect(result.errors?.name[0]).toContain('required')
    expect(result.errors?.price).toBeDefined()
    expect(result.errors?.price[0]).toContain('positive')
  })

  it('creates product with valid data', async () => {
    const formData = new FormData()
    formData.append('name', 'Test Product')
    formData.append('price', '99.99')
    formData.append('stock_quantity', '10')

    const result = await createProduct({}, formData)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data?.name).toBe('Test Product')
  })
})
```

### Test Cache Invalidation

```typescript
// app/actions/products.test.ts
import { describe, it, expect, vi } from 'vitest'
import { updateTag } from 'next/cache'
import { updateProduct } from './products'

// Mock Next.js cache
vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn()
}))

describe('updateProduct', () => {
  it('invalidates product cache on update', async () => {
    const formData = new FormData()
    formData.append('name', 'Updated Product')

    await updateProduct('product-123', {}, formData)

    expect(updateTag).toHaveBeenCalledWith('products')
    expect(updateTag).toHaveBeenCalledWith('products-product-123')
  })
})
```

### Test Error Handling

```typescript
// app/actions/products.test.ts
import { describe, it, expect, vi } from 'vitest'
import { deleteProduct } from './products'
import * as db from '@/lib/db'

vi.mock('@/lib/db')

describe('deleteProduct', () => {
  it('handles database errors gracefully', async () => {
    vi.mocked(db.products.delete).mockRejectedValue(
      new Error('Database connection failed')
    )

    const result = await deleteProduct('product-123')

    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to delete product')
  })
})
```

---

## Pattern 2: Testing Cached Data Functions

### Test Cache Behavior

```typescript
// app/(routes)/products/_data/get-products.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getProducts } from './get-products'

describe('getProducts', () => {
  beforeEach(() => {
    // Clear cache between tests
    // Note: In real tests, you'd need to clear Next.js cache
  })

  it('returns same reference when cached', async () => {
    const result1 = await getProducts()
    const result2 = await getProducts()

    // Same reference = cached
    expect(result1).toBe(result2)
  })

  it('applies filters correctly', async () => {
    const result = await getProducts({ search: 'laptop' })

    expect(result.data.every(p => p.name.includes('laptop'))).toBe(true)
  })

  it('returns paginated results', async () => {
    const result = await getProducts({ page: 1, limit: 10 })

    expect(result.data.length).toBeLessThanOrEqual(10)
    expect(result.metadata.page).toBe(1)
    expect(result.metadata.limit).toBe(10)
  })
})
```

---

## Pattern 3: Testing Zod Schemas

### Test Schema Validation

```typescript
// types/product.test.ts
import { describe, it, expect } from 'vitest'
import { CreateProductSchema } from './product'

describe('CreateProductSchema', () => {
  it('accepts valid product data', () => {
    const validData = {
      name: 'Test Product',
      price: 99.99,
      stock_quantity: 10,
      category: 'electronics'
    }

    const result = CreateProductSchema.safeParse(validData)

    expect(result.success).toBe(true)
  })

  it('rejects invalid price', () => {
    const invalidData = {
      name: 'Test Product',
      price: -10,
      stock_quantity: 10
    }

    const result = CreateProductSchema.safeParse(invalidData)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain('price')
  })

  it('rejects missing required fields', () => {
    const invalidData = {
      price: 99.99
    }

    const result = CreateProductSchema.safeParse(invalidData)

    expect(result.success).toBe(false)
    expect(result.error?.issues.some(i => i.path.includes('name'))).toBe(true)
  })

  it('coerces string numbers to numbers', () => {
    const data = {
      name: 'Test Product',
      price: '99.99',
      stock_quantity: '10'
    }

    const result = CreateProductSchema.safeParse(data)

    expect(result.success).toBe(true)
    expect(typeof result.data?.price).toBe('number')
    expect(typeof result.data?.stock_quantity).toBe('number')
  })
})
```

---

## Pattern 4: Testing Client Components

### Test User Interactions

```typescript
// components/product-form.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductForm } from './product-form'

describe('ProductForm', () => {
  it('renders form fields', () => {
    render(<ProductForm />)

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('submits form with valid data', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<ProductForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/name/i), 'Test Product')
    await user.type(screen.getByLabelText(/price/i), '99.99')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Product',
          price: 99.99
        })
      )
    })
  })

  it('displays validation errors', async () => {
    const user = userEvent.setup()

    render(<ProductForm />)

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', async () => {
    const user = userEvent.setup()
    const slowSubmit = vi.fn(() => new Promise(resolve => setTimeout(resolve, 1000)))

    render(<ProductForm onSubmit={slowSubmit} />)

    await user.type(screen.getByLabelText(/name/i), 'Test')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })
})
```

---

## Pattern 5: Testing Hooks

### Test Custom Hook

```typescript
// hooks/use-products.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProducts } from './use-products'

describe('useProducts', () => {
  it('fetches products on mount', async () => {
    const { result } = renderHook(() => useProducts())

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
    expect(Array.isArray(result.current.data)).toBe(true)
  })

  it('handles errors', async () => {
    const { result } = renderHook(() =>
      useProducts({ failOnLoad: true })
    )

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
    })
  })
})
```

---

## Pattern 6: Testing API Routes

### Test GET Endpoint

```typescript
// app/api/products/route.test.ts
import { describe, it, expect } from 'vitest'
import { GET } from './route'

describe('GET /api/products', () => {
  it('returns products list', async () => {
    const request = new Request('http://localhost:3000/api/products')
    const response = await GET(request)

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
  })

  it('filters by search query', async () => {
    const request = new Request('http://localhost:3000/api/products?search=laptop')
    const response = await GET(request)

    const data = await response.json()
    expect(data.every((p: any) => p.name.includes('laptop'))).toBe(true)
  })

  it('handles errors gracefully', async () => {
    // Mock database error
    const request = new Request('http://localhost:3000/api/products')

    vi.mock('@/lib/db', () => ({
      products: {
        findMany: () => Promise.reject(new Error('DB Error'))
      }
    }))

    const response = await GET(request)
    expect(response.status).toBe(500)
  })
})
```

---

## Pattern 7: Integration Tests

### Test Complete User Flow

```typescript
// tests/integration/product-creation.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductsPage from '@/app/(routes)/products/page'

describe('Product Creation Flow', () => {
  it('allows user to create a product', async () => {
    const user = userEvent.setup()

    render(<ProductsPage />)

    // Click "New Product" button
    await user.click(screen.getByRole('button', { name: /new product/i }))

    // Fill out form
    await user.type(screen.getByLabelText(/name/i), 'Test Product')
    await user.type(screen.getByLabelText(/price/i), '99.99')

    // Submit form
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Verify success message
    await waitFor(() => {
      expect(screen.getByText(/product created/i)).toBeInTheDocument()
    })

    // Verify product appears in list
    expect(screen.getByText('Test Product')).toBeInTheDocument()
  })
})
```

---

## Pattern 8: E2E Tests with Playwright

### Setup Playwright

```bash
npm install -D @playwright/test
npx playwright install
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true
  }
})
```

### E2E Test Example

```typescript
// tests/e2e/product-crud.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Product CRUD', () => {
  test('user can create, edit, and delete product', async ({ page }) => {
    await page.goto('/products')

    // Create product
    await page.click('button:has-text("New Product")')
    await page.fill('input[name="name"]', 'E2E Test Product')
    await page.fill('input[name="price"]', '99.99')
    await page.click('button:has-text("Save")')

    await expect(page.locator('text=E2E Test Product')).toBeVisible()

    // Edit product
    await page.click('button[aria-label="Edit E2E Test Product"]')
    await page.fill('input[name="name"]', 'Updated Product')
    await page.click('button:has-text("Save")')

    await expect(page.locator('text=Updated Product')).toBeVisible()

    // Delete product
    await page.click('button[aria-label="Delete Updated Product"]')
    await page.click('button:has-text("Confirm")')

    await expect(page.locator('text=Updated Product')).not.toBeVisible()
  })
})
```

---

## Testing Checklist

Before deploying, verify:

- [ ] **Server Actions tested** - Validation, success, error cases
- [ ] **Cache invalidation tested** - updateTag() calls verified
- [ ] **Zod schemas tested** - Valid and invalid inputs
- [ ] **Client components tested** - User interactions, loading states
- [ ] **Custom hooks tested** - Data fetching, error handling
- [ ] **API routes tested** - Success, errors, edge cases
- [ ] **Integration tests** - Complete user flows
- [ ] **E2E tests** - Critical paths (auth, checkout, etc.)

---

## Coverage Goals

Aim for:

- **Server Actions**: 90%+ coverage
- **Data fetching functions**: 80%+ coverage
- **Validation schemas**: 100% coverage
- **Client components**: 70%+ coverage
- **API routes**: 85%+ coverage

---

## Best Practices

1. **Test behavior, not implementation** - Focus on what users experience
2. **Avoid testing framework internals** - Trust Next.js/React
3. **Use realistic test data** - Edge cases, empty states, large datasets
4. **Test error paths** - Network failures, validation errors, edge cases
5. **Keep tests fast** - Unit tests < 50ms, integration tests < 500ms
6. **Mock external dependencies** - Database, APIs, third-party services
7. **Test accessibility** - Use screen reader queries, keyboard navigation
8. **Run tests in CI** - Automated on every commit

---

## Summary

Testing is **essential** for production applications:

1. **Server Actions** - Validate business logic and cache invalidation
2. **Zod Schemas** - Ensure validation works correctly
3. **Client Components** - Test user interactions and states
4. **Hooks** - Verify data fetching and state management
5. **API Routes** - Test endpoints and error handling
6. **Integration Tests** - Complete user flows
7. **E2E Tests** - Critical paths with Playwright

**Impact**: Catch bugs before production, refactor with confidence, better code quality.
