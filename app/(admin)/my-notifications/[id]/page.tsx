'use client';

import { use } from 'react';
import NotificationView from '@/components/notifications/notification-view';

/** View one notification the admin RECEIVED. See notification-view.tsx. */
export default function AdminNotificationViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <NotificationView id={id} backHref="/my-notifications" />;
}
