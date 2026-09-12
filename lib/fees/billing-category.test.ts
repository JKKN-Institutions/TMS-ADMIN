import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from './__testing__/fake-supabase';
import { resolveBillingCategoryId, MissingBillingCategoryError } from './billing-category';

describe('resolveBillingCategoryId', () => {
  it('returns the id when the category exists', async () => {
    const svc = makeFakeSupabase({
      billing_categories: [{ id: 'cat-9', category_name: 'Transport Maintenance Fee' }],
    });

    await expect(
      resolveBillingCategoryId(svc as never, 'Transport Maintenance Fee')
    ).resolves.toBe('cat-9');
  });

  it('queries by the exact category name it was given', async () => {
    const svc = makeFakeSupabase({
      billing_categories: [{ id: 'cat-9', category_name: 'Transport Maintenance Fee' }],
    });

    await resolveBillingCategoryId(svc as never, 'Transport Maintenance Fee');

    const call = svc.calls.find((c) => c.table === 'billing_categories');
    const eq = call?.ops.find(([op]) => op === 'eq');
    expect(eq?.[1]).toEqual(['category_name', 'Transport Maintenance Fee']);
  });

  // The whole point of this module: a missing category must stop the write, not
  // quietly produce an uncategorised bill.
  it('throws MissingBillingCategoryError when no row matches', async () => {
    const svc = makeFakeSupabase({ billing_categories: [] });

    await expect(
      resolveBillingCategoryId(svc as never, 'Transport Maintenance Fee')
    ).rejects.toBeInstanceOf(MissingBillingCategoryError);
  });

  it('names the category in the error message so the fix is obvious', async () => {
    const svc = makeFakeSupabase({ billing_categories: [] });

    await expect(
      resolveBillingCategoryId(svc as never, 'Staff Transport Maintenance Fee')
    ).rejects.toThrow(/Staff Transport Maintenance Fee/);
  });

  // A transport-level failure is NOT "the category does not exist", but it must
  // still stop the write rather than fall through to a null id.
  it('throws and preserves the driver message when the lookup itself fails', async () => {
    const svc = makeFakeSupabase(
      { billing_categories: [] },
      { errors: { billing_categories: { message: 'connection reset' } } }
    );

    await expect(
      resolveBillingCategoryId(svc as never, 'Transport Maintenance Fee')
    ).rejects.toThrow(/connection reset/);
  });
});
