'use client';

import NotificationInbox from '@/components/notifications/notification-inbox';

/**
 * The admin's OWN received-notification inbox. Distinct from /notifications, which is
 * the sender console (messages this admin broadcast, with delivery stats). Reached from
 * the header bell's "View all notifications" footer.
 */
export default function AdminMyNotificationsPage() {
  return <NotificationInbox />;
}
