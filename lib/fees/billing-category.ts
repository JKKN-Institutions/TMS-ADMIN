// lib/fees/billing-category.ts
// One place that turns a billing category NAME into an id.
//
// billing_categories is shared with MyJKKN and its ids differ per database, so
// TMS resolves by name at write time. Three call sites used to do this inline
// with `cat?.id ?? null`, which meant a renamed or unseeded category would
// insert thousands of bills carrying NO category — real money invisible to
// every category-keyed report, with no error raised anywhere. A missing
// category is a configuration failure, so it throws.

import type { SupabaseClient } from '@supabase/supabase-js';

export class MissingBillingCategoryError extends Error {
  constructor(
    public readonly categoryName: string,
    cause?: string
  ) {
    super(
      `Billing category "${categoryName}" was not found` +
        (cause ? ` (${cause})` : '') +
        '. Seed it in MyJKKN billing categories before generating transport bills or fines.'
    );
    this.name = 'MissingBillingCategoryError';
  }
}

/**
 * The id of the billing category named `categoryName`.
 *
 * @throws MissingBillingCategoryError when no row matches, or when the lookup
 *         itself fails. Callers must NOT swallow this into a null id.
 */
export async function resolveBillingCategoryId(
  svc: SupabaseClient,
  categoryName: string
): Promise<string> {
  const { data, error } = await svc
    .from('billing_categories')
    .select('id')
    .eq('category_name', categoryName)
    .maybeSingle();

  if (error) throw new MissingBillingCategoryError(categoryName, error.message);

  const id = (data as { id: string } | null)?.id;
  if (!id) throw new MissingBillingCategoryError(categoryName);

  return id;
}
