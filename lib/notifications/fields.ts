import { normalizeTargeting } from '@/lib/notifications/audience';
import type { DispatchInput, NotificationPriority } from '@/lib/notifications/dispatch';

/**
 * Compose payload whitelist + validation for the admin /api/admin/notifications/send
 * route. Everything the admin can set on a notification is validated here; the route
 * adds only createdBy (from the auth context). Keeps untrusted input off the insert.
 */

export const NOTIFICATION_CATEGORIES = [
  'general',
  'announcement',
  'route',
  'booking',
  'grievance',
  'enrollment',
  'payment',
  'alert',
  'system',
] as const;

export const NOTIFICATION_PRIORITIES: NotificationPriority[] = ['low', 'normal', 'high', 'urgent'];

const TITLE_MAX = 200;
const BODY_MAX = 5000;
const URL_MAX = 500;

export interface ComposeParseResult {
  errors: string[];
  /** Present only when errors is empty. createdBy is filled in by the route. */
  value?: Omit<DispatchInput, 'createdBy'>;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function parseComposeInput(raw: unknown): ComposeParseResult {
  const errors: string[] = [];
  const b = (raw ?? {}) as Record<string, unknown>;

  const title = str(b.title);
  if (!title) errors.push('Title is required.');
  else if (title.length > TITLE_MAX) errors.push(`Title must be ≤ ${TITLE_MAX} characters.`);

  const body = str(b.body);
  if (!body) errors.push('Message body is required.');
  else if (body.length > BODY_MAX) errors.push(`Message must be ≤ ${BODY_MAX} characters.`);

  const category = str(b.category) || 'general';
  if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) errors.push(`Unknown category "${category}".`);

  const priority = (str(b.priority) || 'normal') as NotificationPriority;
  if (!NOTIFICATION_PRIORITIES.includes(priority)) errors.push(`Unknown priority "${priority}".`);

  const url = str(b.url) || null;
  if (url && url.length > URL_MAX) errors.push(`URL must be ≤ ${URL_MAX} characters.`);

  let expiresAt: string | null = null;
  if (b.expires_at != null && b.expires_at !== '') {
    const raw = String(b.expires_at);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) errors.push('Expiry date is invalid.');
    else expiresAt = d.toISOString();
  }

  const targeting = normalizeTargeting(b.targeting);
  if (!targeting) errors.push('A valid audience (targeting) is required.');

  const metadata =
    b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
      ? (b.metadata as Record<string, unknown>)
      : undefined;

  if (errors.length > 0 || !targeting) return { errors };

  return {
    errors: [],
    value: {
      title,
      body,
      category,
      priority,
      url,
      icon: str(b.icon) || null,
      expiresAt,
      targeting,
      metadata,
    },
  };
}
