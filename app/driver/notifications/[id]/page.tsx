'use client';

import { use } from 'react';
import NotificationView from '@/components/notifications/notification-view';

/** View one received notification. Shared component — see notification-view.tsx. */
export default function DriverNotificationViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <NotificationView id={id} backHref="/driver/notifications" />;
}
