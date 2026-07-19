/**
 * Formats an admin bug-report reply into a TMS notification (title + body).
 * Pure + dependency-free so it is unit-testable; delivery lives in the
 * bug-reports POST route via lib/notifications/dispatch.
 */
export function buildReplyNotification(
  displayId: string | null,
  message: string,
): { title: string; body: string } {
  const id = displayId?.trim();
  return {
    title: id ? `Reply to your bug report (${id})` : 'Reply to your bug report',
    body: message.trim().slice(0, 4000),
  };
}
