'use client';

import { use } from 'react';
import { RouteCheckScreen } from '@/components/route-check/check-screen';

export default function RouteCheckPage({ params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = use(params);
  return <RouteCheckScreen checkId={checkId} />;
}
